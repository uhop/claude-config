import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-drift.sh', import.meta.url));
const NO_BASELINE = 'no baseline recorded';

let work, repo, head;
const git = (...args) =>
  execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: {...process.env, GIT_CONFIG_GLOBAL: '/dev/null'}
  }).trim();

before(() => {
  work = mkdtempSync(join(tmpdir(), 'check-drift-'));
  repo = join(work, 'repo');
  execFileSync('git', ['init', '-q', repo]);
  git(
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@example.invalid',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'x'
  );
  head = git('rev-parse', 'HEAD');
});

after(() => rmSync(work, {recursive: true, force: true}));

const note = (extra = '') =>
  [
    '## Baseline snapshot',
    '',
    '```json',
    JSON.stringify({repo: {head: {sha: head}, tags: []}, submodules: {}, publishable: {}}),
    '```',
    extra
  ].join('\n');
const read = extra => ({status: 200, body: note(extra)});
const refused = (status, code, details) => ({status, body: JSON.stringify({code, details})});
const DROPPED = {dropped: true};
const OFFLINE = refused(503, 'tenant_unavailable');

const fake = (path, text) => {
  writeFileSync(path, text);
  chmodSync(path, 0o755);
};

const check = async (answers, args = []) => {
  const dir = mkdtempSync(join(work, 'run-'));
  const sleptLog = join(dir, 'slept.log');
  const gets = [];
  const puts = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (req.method === 'PUT') {
        puts.push(Buffer.concat(chunks).toString());
        res.end('{}');
        return;
      }
      gets.push(req.url);
      const answer = answers[Math.min(gets.length, answers.length) - 1];
      if (answer.dropped) {
        req.socket.destroy();
        return;
      }
      res.statusCode = answer.status;
      res.end(answer.body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fake(
    join(dir, 'vault-curl'),
    '#!/usr/bin/env bash\npath=$1\nshift\nexec curl --connect-timeout 1 "$@" "$DRIFT_TEST_URL$path"\n'
  );
  fake(join(dir, 'sleep'), `#!/usr/bin/env bash\nprintf '%s\\n' "$1" >>"${sleptLog}"\n`);
  const child = spawn('bash', [SCRIPT, 'p', ...args], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      PATH: `${dir}:${process.env.PATH}`,
      DRIFT_TEST_URL: `http://127.0.0.1:${server.address().port}`
    }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => (stdout += chunk));
  child.stderr.on('data', chunk => (stderr += chunk));
  const code = await new Promise(resolve => child.on('close', resolve));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  const slept = existsSync(sleptLog)
    ? readFileSync(sleptLog, 'utf8').trim().split(/\r?\n/).map(Number)
    : [];
  return {code, stdout, stderr, gets, puts, slept};
};

const sum = numbers => numbers.reduce((a, b) => a + b, 0);
// A request that crosses a clock second counts as a second spent.
const spends = (slept, window) => {
  assert.ok(sum(slept) <= window && sum(slept) > window - 5, String(sum(slept)));
};

test('a 404 is no baseline, and --update bootstraps one', async () => {
  const report = await check([{status: 404, body: '{"code":"not_found"}'}]);
  assert.equal(report.code, 1);
  assert.match(report.stdout, new RegExp(NO_BASELINE));
  const update = await check([{status: 404, body: '{"code":"not_found"}'}], ['--update']);
  assert.equal(update.puts.length, 1);
});

test('a note read whole with no baseline block is no baseline', async () => {
  const {code, stdout} = await check([{status: 200, body: '## GitHub\n\nstored\n'}]);
  assert.equal(code, 1);
  assert.match(stdout, new RegExp(NO_BASELINE));
});

test('a baseline read is compared, and --update keeps the sections it carries', async () => {
  const clean = await check([read()]);
  assert.equal(clean.code, 0, clean.stderr);
  assert.doesNotMatch(clean.stdout, new RegExp(NO_BASELINE));
  const update = await check([read('\n## GitHub\n\nkept text\n')], ['--update']);
  assert.equal(update.puts.length, 1);
  assert.match(JSON.parse(update.puts[0]).body, /## GitHub\n\nkept text/);
});

for (const [name, answer, said] of [
  ['a 401', refused(401, 'unauthorized'), /401 unauthorized/],
  ['a 500', refused(500, 'internal'), /500 internal/],
  ['a 503 that may have applied', refused(503, 'writes_paused'), /503 writes_paused/],
  ['an error page', {status: 502, body: '<html>Bad Gateway</html>'}, /502/]
]) {
  test(`${name} stops the check once, names the status, and writes nothing`, async () => {
    const {code, stdout, stderr, gets, puts, slept} = await check([answer], ['--update']);
    assert.equal(code, 2);
    assert.match(stderr, said);
    assert.doesNotMatch(stdout, new RegExp(NO_BASELINE));
    assert.equal(gets.length, 1);
    assert.deepEqual(puts, []);
    assert.deepEqual(slept, []);
  });
}

for (const [name, first] of [
  ['tenant_unavailable', OFFLINE],
  ['verification_unavailable', refused(503, 'verification_unavailable')],
  ['a dropped connection', DROPPED]
]) {
  test(`${name} is asked again, with waits doubling from a quarter second`, async () => {
    const {code, stderr, gets, slept} = await check([first, first, read()]);
    assert.equal(code, 0, stderr);
    assert.equal(gets.length, 3);
    assert.deepEqual(slept, [0.25, 0.5]);
  });
}

test('an outage is waited out for two minutes, then stops and writes nothing', async () => {
  const {code, stdout, stderr, puts, slept} = await check([OFFLINE], ['--update']);
  assert.equal(code, 2);
  assert.match(stderr, /503 tenant_unavailable/);
  assert.doesNotMatch(stdout, new RegExp(NO_BASELINE));
  assert.deepEqual(puts, []);
  assert.deepEqual(slept.slice(0, 8), [0.25, 0.5, 1, 2, 4, 8, 16, 16]);
  assert.ok(Math.max(...slept) <= 16);
  spends(slept, 120);
});

test('a dropped connection that never recovers stops after the same two minutes', async () => {
  const {code, stderr, puts, slept} = await check([DROPPED], ['--update']);
  assert.equal(code, 2);
  assert.match(stderr, /no connection/);
  assert.deepEqual(puts, []);
  spends(slept, 120);
});

test('a refusal that names the database is waited out for ten minutes', async () => {
  const {code, puts, slept} = await check(
    [refused(503, 'tenant_unavailable', {reason: 'database'})],
    ['--update']
  );
  assert.equal(code, 2);
  assert.deepEqual(puts, []);
  spends(slept, 600);
});
