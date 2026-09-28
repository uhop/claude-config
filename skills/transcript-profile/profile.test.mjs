// Runs profile.mjs as a child process against a generated transcript tree,
// through --root (the script is a CLI with an import guard, so it cannot be
// imported). Run: node --test skills/transcript-profile/

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'profile.mjs');

const run = args =>
  execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
const runJson = args => JSON.parse(run([...args, '--json']));
const row = (report, name) => report.rows.find(r => r.name === name);

const iso = ms => new Date(ms).toISOString();
const use = (t, id, name, extra = {}, msg) => ({
  type: 'assistant',
  timestamp: iso(t),
  ...extra,
  message: {...(msg ? {id: msg} : {}), content: [{type: 'tool_use', id, name, input: {}}]}
});
const result = (t, id, content, extra = {}) => ({
  type: 'user',
  timestamp: iso(t),
  ...extra,
  message: {content: [{type: 'tool_result', tool_use_id: id, content}]}
});
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

const T0 = Date.now() - 60_000;
let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'profile-test-'));

  // alpha: one session with two matched Reads (a string and text blocks), one
  // matched Bash, one pending Bash, an old-style sidechain Grep, a non-message
  // row, a malformed line, and a sub-agent transcript beside it.
  const alpha = join(root, '-home-x-alpha');
  mkdirSync(join(alpha, 's1', 'subagents'), {recursive: true});
  writeFileSync(
    join(alpha, 's1.jsonl'),
    jsonl([
      use(T0, 'r1', 'Read'),
      result(T0 + 100, 'r1', 'a'.repeat(1000)),
      use(T0 + 1000, 'r2', 'Read'),
      result(T0 + 1300, 'r2', [
        {type: 'text', text: 'b'.repeat(200)},
        {type: 'image', source: {}}
      ]),
      use(T0 + 2000, 'b1', 'Bash'),
      result(T0 + 2050, 'b1', 'x'.repeat(100)),
      use(T0 + 3000, 'b2', 'Bash'),
      use(T0 + 4000, 'g1', 'Grep', {isSidechain: true}),
      result(T0 + 4010, 'g1', 'y'.repeat(10), {isSidechain: true}),
      {type: 'summary', summary: 'not a message'}
    ]) + 'not json\n'
  );
  writeFileSync(
    join(alpha, 's1', 'subagents', 'agent-1.jsonl'),
    jsonl([use(T0 + 5000, 'r3', 'Read'), result(T0 + 5500, 'r3', 'c'.repeat(3000))])
  );

  // gamma: one message issuing three Edits at once, answered 3.0, 3.2 and
  // 3.4 s after issue, then a single Edit: latency carries the batch, own
  // cost does not.
  const gamma = join(root, '-home-x-gamma');
  mkdirSync(gamma, {recursive: true});
  writeFileSync(
    join(gamma, 's2.jsonl'),
    jsonl([
      use(T0, 'e1', 'Edit', {}, 'msg_1'),
      use(T0 + 10, 'e2', 'Edit', {}, 'msg_1'),
      use(T0 + 20, 'e3', 'Edit', {}, 'msg_1'),
      result(T0 + 3000, 'e1', 'ok'),
      result(T0 + 3200, 'e2', 'ok'),
      result(T0 + 3400, 'e3', 'ok'),
      use(T0 + 5000, 'e4', 'Edit'),
      result(T0 + 5150, 'e4', 'ok')
    ])
  );

  // beta: one session 40 days old, by row timestamps and by file mtime.
  const beta = join(root, '-home-x-beta');
  mkdirSync(beta, {recursive: true});
  const old = T0 - 40 * 86400 * 1000;
  const oldFile = join(beta, 'old.jsonl');
  writeFileSync(oldFile, jsonl([use(old, 'r4', 'Read'), result(old + 100, 'r4', 'd'.repeat(500))]));
  utimesSync(oldFile, old / 1000, old / 1000);
});

after(() => rmSync(root, {recursive: true, force: true}));

test('bytes, latency, and pending per tool', () => {
  const r = runJson(['--root', root, '--project', 'alpha']);
  assert.equal(r.sessions_analyzed, 1);
  assert.equal(r.subagent_transcripts, 0);
  assert.equal(r.total_result_bytes, 1300);

  const read = row(r, 'Read');
  assert.equal(read.count, 2);
  assert.equal(read.bytes, 1200);
  assert.equal(read.avg_bytes, 600);
  assert.equal(read.p50_bytes, 1000);
  assert.equal(read.p95_bytes, 1000);
  assert.equal(read.total_ms, 400);
  assert.equal(read.p50_ms, 300);
  assert.equal(read.avg_ms, 200);

  const bash = row(r, 'Bash');
  assert.equal(bash.count, 1);
  assert.equal(bash.unmatched, 1);
  assert.equal(bash.bytes, 100);
  assert.equal(read.batched, 0);
  assert.equal(read.own_p50_ms, read.p50_ms);

  assert.equal(row(r, 'Grep'), undefined);
});

test('own cost is the gap from the previous result in the same message', () => {
  const r = runJson(['--root', root, '--project', 'gamma']);
  const edit = row(r, 'Edit');
  assert.equal(edit.count, 4);
  assert.equal(edit.batched, 3);
  assert.equal(edit.p50_ms, 3190);
  assert.equal(edit.own_p50_ms, 200);
  assert.equal(edit.own_p95_ms, 3000);
  const out = run(['--root', root, '--project', 'gamma', '--top', '3']);
  assert.match(
    out,
    /^\| Edit \| 4 \| 75% \| 9\.7s \| 3\.2s \| 3\.4s \| 2\.4s \| 200ms \| 3\.0s \|$/m
  );
});

test('--include-sidechain reads <session>/subagents/ and isSidechain rows', () => {
  const r = runJson(['--root', root, '--project', 'alpha', '--include-sidechain']);
  assert.equal(r.sessions_analyzed, 1);
  assert.equal(r.subagent_transcripts, 1);
  assert.equal(r.total_result_bytes, 1300 + 3000 + 10);
  assert.equal(row(r, 'Read').count, 3);
  assert.equal(row(r, 'Grep').bytes, 10);
});

test('--days drops old transcripts; --project selects a project directory', () => {
  assert.equal(runJson(['--root', root]).total_result_bytes, 1808);
  assert.equal(runJson(['--root', root, '--days', '30']).total_result_bytes, 1308);
  const beta = runJson(['--root', root, '--project', 'beta']);
  assert.equal(beta.total_result_bytes, 500);
  assert.equal(beta.sessions_analyzed, 1);
});

test('the markdown report carries the bytes table', () => {
  const out = run(['--root', root, '--project', 'alpha', '--top', '5']);
  assert.match(out, /^Result bytes: \*\*1\.3 KB\*\*/m);
  assert.match(out, /^## By result bytes \(top 5\)$/m);
  assert.match(out, /^\| Read \| 2 \| 1\.2 KB \| 92\.3% \| 600 B \| 1\.0 KB \| 1\.0 KB \|$/m);
});

test('an unreadable --root fails with the path in the message', () => {
  assert.throws(
    () => run(['--root', join(root, 'missing')]),
    e => e.status === 2 && /missing/.test(e.stderr)
  );
});
