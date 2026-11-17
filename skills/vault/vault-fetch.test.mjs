// Pins the scripts' waits: a 429's (vault-storage 7z-2, question 383) and an outage's (7as-2,
// D751, D752, questions 430 and 431). Run: node --test skills/vault/

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {vaultFetch} from './vault-fetch.mjs';

// The outage's mark, kept in memory for a test; the default keeps it in a file.
const memoryOutage = () => {
  let since = null;
  return {
    start: at => (since ??= at),
    clear: () => void (since = null),
    since: () => since
  };
};

const answer =
  (status, retryAfter = null, code = status === 429 ? 'too_many_requests' : 'ok') =>
  () =>
    new Response(code === null ? 'Service Unavailable' : JSON.stringify({code}), {
      status,
      headers: retryAfter === null ? {} : {'Retry-After': retryAfter}
    });

// What fetch throws: a TypeError whose cause carries the socket's code.
const failed = code => () => {
  throw new TypeError('fetch failed', {cause: Object.assign(new Error(code), {code})});
};

// A clock that moves only when the client waits.
const scripted = (answers, clock = 0) => {
  const sent = [];
  const slept = [];
  const fetchImpl = async (url, init) => {
    sent.push([url, init.method, init.body]);
    return answers[Math.min(sent.length, answers.length) - 1]();
  };
  const opts = {
    fetchImpl,
    wait: async ms => {
      slept.push(ms);
      clock += ms;
    },
    now: () => clock,
    outage: memoryOutage()
  };
  return {sent, slept, opts};
};

const WRITE = {method: 'POST', body: '{"op":"append"}'};
const STEPS = [250, 500, 1_000, 2_000, 4_000, 8_000, 16_000];
const sum = list => list.reduce((a, b) => a + b, 0);

test('a 429 is sent again after each Retry-After, body and all, and the answer is returned', async () => {
  const {sent, slept, opts} = scripted([answer(429, '1'), answer(429, '4'), answer(200)]);
  const response = await vaultFetch('http://v/vault/edit', WRITE, opts);
  assert.equal(response.status, 200);
  assert.deepEqual(slept, [1_000, 4_000]);
  assert.deepEqual(
    sent.map(([url, method, body]) => `${method} ${url} ${body}`),
    Array(3).fill('POST http://v/vault/edit {"op":"append"}')
  );
});

test('the waits stop at five minutes in all, and the last refusal is returned', async () => {
  const {sent, slept, opts} = scripted([answer(429, '120')]);
  const response = await vaultFetch('http://v/vault/a.md', {}, opts);
  assert.equal(response.status, 429);
  assert.deepEqual(slept, [120_000, 120_000, 60_000], 'the last wait cut to what was left');
  assert.equal(sent.length, 4);
  assert.equal((await response.json()).code, 'too_many_requests', 'its body unread');
});

test('a 429 with no Retry-After, a 404, and a 500 are returned at once, read or write', async () => {
  for (const init of [{}, WRITE])
    for (const [status, retryAfter] of [[429], [429, 'soon'], [404], [500]]) {
      const {sent, slept, opts} = scripted([answer(status, retryAfter)]);
      assert.equal((await vaultFetch('http://v/x', init, opts)).status, status);
      assert.deepEqual([sent.length, slept.length], [1, 0]);
    }
});

test('a refused write goes again, the waits growing, until the server listens', async () => {
  const {sent, slept, opts} = scripted([
    failed('ECONNREFUSED'),
    failed('ECONNREFUSED'),
    failed('ECONNREFUSED'),
    answer(200)
  ]);
  assert.equal((await vaultFetch('http://v/vault/edit', WRITE, opts)).status, 200);
  assert.deepEqual(slept, [250, 500, 1_000]);
  assert.equal(sent.length, 4);
  assert.equal(opts.outage.since(), null, 'the answer clears the outage');
});

test("a refused request waits 90 s in all, under an agent's 120 s command limit, then fails", async () => {
  const {sent, slept, opts} = scripted([failed('ECONNREFUSED')]);
  const markedAtFirstWait = [];
  const wait = opts.wait;
  opts.wait = async ms => {
    if (markedAtFirstWait.length === 0) markedAtFirstWait.push(opts.outage.since());
    await wait(ms);
  };
  await assert.rejects(vaultFetch('http://v/vault/a.md', {}, opts), err => {
    assert.equal(err.cause.code, 'ECONNREFUSED');
    return true;
  });
  assert.deepEqual(slept.slice(0, 7), STEPS);
  assert.ok(slept.slice(7).every(ms => ms <= 16_000));
  assert.equal(sum(slept), 90_000, 'the last wait cut to what was left');
  assert.equal(sent.length, slept.length + 1);
  assert.deepEqual(markedAtFirstWait, [0], "the outage is marked with its first failure's time");
  assert.equal(opts.outage.since(), 0, 'and stays marked past the window');
});

test('a call that meets a marked outage waits until 90 s past its first failure', async () => {
  const {sent, slept, opts} = scripted([failed('ECONNREFUSED')], 60_000);
  opts.outage.start(0);
  await assert.rejects(vaultFetch('http://v/vault/edit', WRITE, opts));
  assert.equal(sum(slept), 30_000, 'the 30 s the outage had left');
  assert.equal(sent.length, slept.length + 1);
  assert.equal(opts.outage.since(), 0, "the mark keeps the first failure's time");

  const recovers = scripted([answer(503, null, 'tenant_unavailable'), answer(200)], 10_000);
  recovers.opts.outage.start(0);
  assert.equal((await vaultFetch('http://v/vault/edit', WRITE, recovers.opts)).status, 200);
  assert.deepEqual(recovers.slept, [250]);
  assert.equal(recovers.opts.outage.since(), null, 'the answer ends it');
});

test('past the deadline, a call tries once, until an answer ends the outage', async () => {
  const {sent, slept, opts} = scripted([failed('ECONNREFUSED')], 90_000);
  opts.outage.start(0);
  await assert.rejects(vaultFetch('http://v/vault/a.md', {}, opts));
  await assert.rejects(vaultFetch('http://v/vault/edit', WRITE, opts));
  assert.deepEqual([sent.length, slept.length], [2, 0], 'each tried once');

  const back = scripted([answer(200), failed('ECONNREFUSED'), answer(200)], 90_000);
  back.opts.outage.start(0);
  assert.equal((await vaultFetch('http://v/x', {}, back.opts)).status, 200);
  assert.equal(back.opts.outage.since(), null, 'the answer ends it');
  assert.equal((await vaultFetch('http://v/x', {}, back.opts)).status, 200);
  assert.deepEqual(back.slept, [250], 'the next failure waits again');
});

test('a dropped connection repeats a read, never a write; an unknown host repeats neither', async () => {
  const read = scripted([failed('ECONNRESET'), answer(200)]);
  assert.equal((await vaultFetch('http://v/x', {}, read.opts)).status, 200);
  assert.equal(read.sent.length, 2);

  const write = scripted([failed('ECONNRESET'), answer(200)]);
  await assert.rejects(vaultFetch('http://v/vault/edit', WRITE, write.opts));
  assert.deepEqual([write.sent.length, write.slept.length], [1, 0]);

  for (const init of [{}, WRITE]) {
    const unknown = scripted([failed('ENOTFOUND'), answer(200)]);
    await assert.rejects(vaultFetch('http://nowhere/x', init, unknown.opts));
    assert.equal(unknown.sent.length, 1);
  }
});

test('a 503 that applied nothing repeats a write, waiting at least its Retry-After', async () => {
  for (const code of ['tenant_unavailable', 'verification_unavailable', 'writes_paused', null]) {
    const {sent, slept, opts} = scripted([answer(503, '5', code), answer(200)]);
    assert.equal((await vaultFetch('http://v/vault/edit', WRITE, opts)).status, 200, `${code}`);
    assert.deepEqual([sent.length, slept], [2, [5_000]]);
  }
});

test('a 503 that may have applied, a 502, and a 504 repeat a read and answer a write at once', async () => {
  for (const make of [
    () => answer(503, '5', 'database_unavailable'),
    () => answer(502),
    () => answer(504)
  ]) {
    const write = scripted([make(), answer(200)]);
    assert.notEqual((await vaultFetch('http://v/vault/edit', WRITE, write.opts)).status, 200);
    assert.equal(write.sent.length, 1);
    const read = scripted([make(), answer(200)]);
    assert.equal((await vaultFetch('http://v/x', {}, read.opts)).status, 200);
    assert.equal(read.sent.length, 2);
  }
});

test('a cancelled call is not sent again', async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  const {sent, opts} = scripted([failed('ECONNREFUSED'), answer(200)]);
  await assert.rejects(vaultFetch('http://v/x', {signal: cancelled.signal}, opts));
  assert.equal(sent.length, 1);
});

test('VAULT_FETCH_OUTAGE_S sets the window, as a hook that runs a script asks', async () => {
  const before = process.env.VAULT_FETCH_OUTAGE_S;
  process.env.VAULT_FETCH_OUTAGE_S = '3';
  try {
    const {slept, opts} = scripted([failed('ECONNREFUSED')]);
    await assert.rejects(vaultFetch('http://v/x', {}, opts));
    assert.equal(sum(slept), 3_000);
  } finally {
    if (before === undefined) delete process.env.VAULT_FETCH_OUTAGE_S;
    else process.env.VAULT_FETCH_OUTAGE_S = before;
  }
});

test('the mark outlives the process: a file another run reads, cleared by an answer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-fetch-outage-'));
  const before = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = dir;
  const onFile = (answers, clock) => {
    const run = scripted(answers, clock);
    delete run.opts.outage;
    return run;
  };
  try {
    const first = onFile([failed('ECONNREFUSED')], 0);
    process.env.VAULT_FETCH_OUTAGE_S = '1';
    await assert.rejects(vaultFetch('http://v/x', {}, first.opts));
    delete process.env.VAULT_FETCH_OUTAGE_S;
    const marker = join(dir, `vault-fetch-outage-${process.getuid?.() ?? 'user'}`);
    assert.equal(readFileSync(marker, 'utf8'), '1970-01-01T00:00:00.000Z\n', 'its time in a file');

    const late = onFile([failed('ECONNREFUSED')], 90_000);
    await assert.rejects(vaultFetch('http://v/x', {}, late.opts));
    assert.deepEqual(
      [late.sent.length, late.slept.length],
      [1, 0],
      'past it, a new run tries once'
    );

    const within = onFile([failed('ECONNREFUSED'), answer(200)], 30_000);
    assert.equal((await vaultFetch('http://v/x', {}, within.opts)).status, 200);
    assert.deepEqual(within.slept, [250], 'within it, a new run waits');
    assert.ok(!existsSync(marker), 'an answer removes the file');
  } finally {
    if (before === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = before;
    rmSync(dir, {recursive: true, force: true});
  }
});

test('calls that meet one outage together all wait it out, whichever marked it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-fetch-outage-'));
  const before = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = dir;
  try {
    const runs = [
      scripted([failed('ECONNREFUSED'), answer(200)]),
      scripted([answer(503, null, 'tenant_unavailable'), answer(503, null, null), answer(200)]),
      scripted([answer(502), answer(200)])
    ];
    for (const run of runs) delete run.opts.outage;
    const answers = await Promise.all(
      runs.map((run, i) => vaultFetch('http://v/vault/edit', i === 2 ? {} : WRITE, run.opts))
    );
    assert.deepEqual(
      answers.map(response => response.status),
      [200, 200, 200]
    );
    assert.deepEqual(
      runs.map(run => run.slept),
      [[250], [250, 500], [250]]
    );
    assert.ok(!existsSync(join(dir, `vault-fetch-outage-${process.getuid?.() ?? 'user'}`)));
  } finally {
    if (before === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = before;
    rmSync(dir, {recursive: true, force: true});
  }
});
