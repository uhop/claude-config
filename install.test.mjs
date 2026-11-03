// Run: node --test install.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const INSTALLER = join(dirname(fileURLToPath(import.meta.url)), 'install.mjs');

const write = (path, text = 'x\n') => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, text);
};

const fixture = t => {
  const root = mkdtempSync(join(tmpdir(), 'install-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const repo = join(root, 'repo');
  const home = join(root, 'home');
  mkdirSync(home);
  mkdirSync(repo);
  copyFileSync(INSTALLER, join(repo, 'install.mjs'));
  write(join(repo, 'CLAUDE.md'));
  write(join(repo, 'skills/keep/SKILL.md'));
  write(join(repo, 'skills/old/SKILL.md'));
  write(join(repo, 'commands/gone.md'));
  write(join(repo, 'commands/stays.md'));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(repo, 'install.mjs'), ...args], {
      env: {...process.env, HOME: home},
      encoding: 'utf8'
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  return {root, repo, target: join(home, '.claude'), run};
};

const isLink = path => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

test('a link into the checkout at a file that is gone is pruned, with its emptied folder', t => {
  const {repo, target, run} = fixture(t);
  run('--apply');
  assert.ok(isLink(join(target, 'skills/old/SKILL.md')));
  rmSync(join(repo, 'skills/old'), {recursive: true});
  rmSync(join(repo, 'commands/gone.md'));

  const planned = run();
  assert.match(planned, /prune.*skills\/old\/SKILL\.md/);
  assert.match(planned, /prune.*commands\/gone\.md/);
  assert.ok(isLink(join(target, 'skills/old/SKILL.md')), 'a dry run removes nothing');

  const applied = run('--apply');
  assert.match(applied, /prune.*skills\/old\/SKILL\.md/);
  assert.ok(!isLink(join(target, 'skills/old/SKILL.md')));
  assert.ok(!existsSync(join(target, 'skills/old')), 'its folder went with it');
  assert.ok(!isLink(join(target, 'commands/gone.md')));

  assert.ok(isLink(join(target, 'skills/keep/SKILL.md')));
  assert.ok(isLink(join(target, 'commands/stays.md')));
  assert.equal(readlinkSync(join(target, 'commands/stays.md')), join(repo, 'commands/stays.md'));

  assert.doesNotMatch(run('--apply'), /prune/);
});

test('a tree the last link left stays, since the installer owns only what it linked', t => {
  const {repo, target, run} = fixture(t);
  run('--apply');
  rmSync(join(repo, 'commands'), {recursive: true});
  run('--apply');
  assert.ok(!isLink(join(target, 'commands/gone.md')));
  assert.ok(existsSync(join(target, 'commands')));
});

test('what the checkout did not put there is left alone', t => {
  const {root, repo, target, run} = fixture(t);
  run('--apply');
  const elsewhere = join(target, 'skills/mine/SKILL.md');
  mkdirSync(dirname(elsewhere));
  symlinkSync(join(root, 'elsewhere/never-there.md'), elsewhere);
  const live = join(target, 'commands/live.md');
  write(join(root, 'elsewhere/real.md'));
  symlinkSync(join(root, 'elsewhere/real.md'), live);
  const synced = join(target, 'skills/synced/abc/SKILL.md');
  write(synced);
  const empty = join(target, 'skills/already-empty');
  mkdirSync(empty);
  const beside = join(target, 'skills/old/notes.md');
  write(beside);
  rmSync(join(repo, 'skills/old'), {recursive: true});

  run('--apply');

  assert.ok(isLink(elsewhere), 'a dangling link that points elsewhere stays');
  assert.ok(isLink(live), 'a live link that points elsewhere stays');
  assert.ok(existsSync(synced), 'a real file stays');
  assert.ok(existsSync(beside), 'a real file beside a pruned link stays');
  assert.ok(existsSync(empty), 'a folder this run did not empty stays');
  assert.ok(!isLink(join(target, 'skills/old/SKILL.md')), 'the link beside it goes');
});
