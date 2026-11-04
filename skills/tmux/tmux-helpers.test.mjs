// The helpers against a real private socket. Run:
// node --test skills/tmux/tmux-helpers.test.mjs

import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const waitForText = join(dir, 'scripts/wait-for-text.sh');
const findSessions = join(dir, 'scripts/find-sessions.sh');
const skip = spawnSync('tmux', ['-V']).status === 0 ? false : 'tmux is not installed';
const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');

const run = (script, ...args) => spawnSync(script, args, {encoding: 'utf8'});

let work;
let socket;

before(() => {
  if (skip) return;
  work = mkdtempSync(join(tmpdir(), 'tmux-'));
  socket = join(work, 't.sock');
  // The config the 2026-11-03 pilot met: its only pane was pilot:1.1.
  const config = join(work, '.tmux.conf');
  writeFileSync(config, 'set -g base-index 1\nsetw -g pane-base-index 1\n');
  const started = spawnSync('tmux', [
    '-f',
    config,
    '-S',
    socket,
    'new',
    '-d',
    '-s',
    'demo',
    'printf READY_MARK; sleep 60'
  ]);
  assert.equal(started.status, 0, String(started.stderr));
});

after(() => {
  if (skip) return;
  spawnSync('tmux', ['-S', socket, 'kill-server']);
  // A quickstart that fails stops before its own kill-session.
  spawnSync('tmux', ['-S', join(work, 'quickstart', 'claude.sock'), 'kill-server']);
  rmSync(work, {recursive: true, force: true});
});

test('wait-for-text reaches a pane on a private socket by session name', {skip}, () => {
  const result = run(waitForText, '-S', socket, '-t', 'demo', '-p', 'READY_MARK', '-T', '5');
  assert.equal(result.status, 0, result.stderr);
});

test("wait-for-text's timeout names tmux's error and never matches it", {skip}, () => {
  const result = run(waitForText, '-S', socket, '-t', 'demo:0.0', '-p', 'window', '-T', '0');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /can't find window: 0/);
});

// Without a UTF-8 locale tmux rewrites a tab in its output to `_`.
for (const locale of ['C', 'C.UTF-8']) {
  const sessions = (...args) =>
    spawnSync(findSessions, ['-S', socket, ...args], {
      encoding: 'utf8',
      env: {...process.env, LC_ALL: locale}
    });

  test(`find-sessions separates the name, the state, and the start under ${locale}`, {skip}, () => {
    const result = sessions();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^ {2}- demo \(detached, started \w{3} .*\d{4}\)$/m);
  });

  test(`find-sessions -q filters on the name alone under ${locale}`, {skip}, () => {
    assert.match(sessions('-q', 'DEM').stdout, /- demo /);
    assert.match(sessions('-q', 'detached').stdout, /^No sessions found/);
  });
}

test('the quickstart runs as written under a config that moves window 0', {skip}, () => {
  const [, quickstart] = skill.match(/```bash\n([\s\S]*?)```/);
  const result = spawnSync('bash', ['-ec', quickstart], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: work,
      XDG_CONFIG_HOME: work,
      CLAUDE_TMUX_SOCKET_DIR: join(work, 'quickstart')
    }
  });
  assert.equal(result.status, 0, result.stderr);
});

test('the skill never assumes window 0 or a working directory', () => {
  assert.doesNotMatch(skill, /:0\.0/);
  assert.doesNotMatch(skill, /\.\/scripts\//);
  assert.match(skill, /wait-for-text\.sh -S "\$SOCKET"/);
});
