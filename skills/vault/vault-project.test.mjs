import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkoutOf, mainCheckout, projectOf} from './vault-project.mjs';

const script = relative => fileURLToPath(new URL(relative, import.meta.url));

let work, main, linked, plain;
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {stdio: 'ignore'});

before(() => {
  work = mkdtempSync(join(tmpdir(), 'vault-project-'));
  main = join(work, 'main-name');
  linked = join(work, 'other-name');
  plain = join(work, 'no-repo');
  mkdirSync(main);
  mkdirSync(plain);
  git(main, 'init', '-q');
  git(
    main,
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
  git(main, 'remote', 'add', 'origin', 'https://github.com/o/r.git');
  git(main, 'worktree', 'add', '-q', '--detach', linked);
});

after(() => rmSync(work, {recursive: true, force: true}));

test('a linked worktree stands for its main checkout, a plain checkout for itself', () => {
  assert.equal(
    mainCheckout('/cache/wt', '/home/u/Open/claude-config/.git'),
    '/home/u/Open/claude-config'
  );
  assert.equal(mainCheckout('/home/u/Open/x', '/home/u/Open/x/.git'), '/home/u/Open/x');
  assert.equal(
    mainCheckout('/srv/x', '/srv/bare.git'),
    '/srv/x',
    'a bare repository names nothing'
  );
});

test('a project is its main checkout’s folder, and no repository is its own folder', () => {
  assert.equal(projectOf(main), 'main-name');
  assert.equal(projectOf(linked), 'main-name');
  assert.equal(checkoutOf(linked), main);
  assert.equal(projectOf(plain), 'no-repo');
});

test('the marker names the project, in a worktree too', () => {
  mkdirSync(join(linked, '.claude'));
  writeFileSync(join(linked, '.claude/vault-project'), 'named\n');
  try {
    assert.equal(projectOf(linked), 'named');
  } finally {
    rmSync(join(linked, '.claude'), {recursive: true});
  }
});

/** Runs a script in the worktree against a server that answers everything with an empty 404. */
const requestsOf = async (args, extraEnv = {}) => {
  const urls = [];
  const server = createServer((req, res) => {
    urls.push(decodeURIComponent(req.url));
    res.writeHead(404, {'Content-Type': 'application/json'}).end('{"error":"none"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = {
    ...process.env,
    PROGRAM_CLERK_URL: `http://127.0.0.1:${server.address().port}`,
    PROGRAM_CLERK_KEY: 'k',
    ...extraEnv
  };
  await new Promise(resolve => {
    const child = spawn(args[0], args.slice(1), {cwd: linked, env, stdio: 'ignore'});
    child.on('close', resolve);
  });
  await new Promise(resolve => server.close(resolve));
  return urls;
};

/** Runs a script in the worktree with a stand-in `vault-curl`, which no runner has, and what it asked. */
const vaultCurlAsks = async args => {
  const bin = mkdtempSync(join(work, 'bin-'));
  const log = join(bin, 'asked.log');
  writeFileSync(join(bin, 'vault-curl'), `#!/usr/bin/env bash\nprintf '%s\\n' "$1" >>"${log}"\n`);
  chmodSync(join(bin, 'vault-curl'), 0o755);
  await requestsOf(args, {PATH: `${bin}:${process.env.PATH}`});
  return decodeURIComponent(readFileSync(log, 'utf8'));
};

test('vault-verify in a worktree reads its main checkout’s project', async () => {
  const asked = await vaultCurlAsks(['node', script('../vault-verify/vault-verify.mjs')]);
  assert.ok(asked.includes('projects/main-name/'), asked);
  assert.ok(!asked.includes('other-name'), asked);
});

test('fleet-status --cwd in a worktree reads its main checkout’s project', async () => {
  const urls = await requestsOf([
    'node',
    script('../fleet-status/fleet-status.mjs'),
    'show',
    '--cwd'
  ]);
  assert.ok(
    urls.some(url => url.includes('projects/main-name/')),
    urls.join('\n')
  );
  assert.ok(!urls.some(url => url.includes('other-name')), urls.join('\n'));
});

test('check-drift in a worktree reads its main checkout’s project', async () => {
  const asked = await vaultCurlAsks(['bash', script('../vault-check-drift/check-drift.sh')]);
  assert.ok(asked.includes('/vault/projects/main-name/state.md'), asked);
  assert.ok(!asked.includes('other-name'), asked);
});
