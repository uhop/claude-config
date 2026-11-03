// Run: node --test skills/release-check/release-digest.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const DIGEST = new URL('release-digest.mjs', import.meta.url).pathname;

const repo = t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-digest-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...args],
      {cwd: dir, encoding: 'utf8', stdio: 'pipe'}
    );
  const write = (rel, text = 'x\n') => {
    mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
    writeFileSync(path.join(dir, rel), text);
  };
  const commit = (rel, subject) => {
    write(rel, `${subject}\n`);
    git('add', '-A');
    git('commit', '-qm', subject);
  };
  const digest = (sub = '.') => {
    const r = spawnSync('node', [DIGEST, path.join(dir, sub), '--no-network'], {encoding: 'utf8'});
    return JSON.parse(r.stdout).checks.git;
  };
  git('init', '-q');
  write('package.json', '{"name": "root", "version": "1.0.0"}\n');
  write('mcp/package.json', '{"name": "sub", "version": "1.0.0"}\n');
  git('add', '-A');
  git('commit', '-qm', 'start');
  return {git, write, commit, digest};
};

const subjects = g => g.commits_since.map(line => line.replace(/^\S+ /, ''));

test('a single package reads the whole repository since its nearest tag', t => {
  const {git, commit, digest} = repo(t);
  git('tag', '1.0.0');
  commit('a.txt', 'one');
  commit('mcp/b.txt', 'two');
  const g = digest();
  assert.equal(g.last_tag, '1.0.0');
  assert.deepEqual(subjects(g), ['two', 'one']);
  assert.equal(g.tag_is_bare_semver, true);
});

test('a sub-package reads its own tag and its own directory', t => {
  const {git, commit, digest} = repo(t);
  git('tag', 'mcp-1.0.0');
  commit('a.txt', 'server work');
  commit('mcp/b.txt', 'adapter work');
  git('tag', '2.0.0');
  commit('c.txt', 'more server work');
  const g = digest('mcp');
  assert.equal(g.last_tag, 'mcp-1.0.0');
  assert.deepEqual(subjects(g), ['adapter work']);
  assert.equal(g.commit_count, 1);
  assert.equal(g.tag_is_bare_semver, true);
});

test("the root package never takes a sub-package's tag", t => {
  const {git, commit, digest} = repo(t);
  git('tag', '2.0.0');
  commit('a.txt', 'one');
  git('tag', 'mcp-1.0.0');
  commit('b.txt', 'two');
  const g = digest();
  assert.equal(g.last_tag, '2.0.0');
  assert.deepEqual(subjects(g), ['two', 'one']);
});

test("a sub-package never takes a sibling's tag whose name starts like its own", t => {
  const {git, commit, digest} = repo(t);
  git('tag', 'mcp-1.0.0');
  commit('mcp/a.txt', 'one');
  git('tag', 'mcp-tools-3.0.0');
  commit('mcp/b.txt', 'two');
  const g = digest('mcp');
  assert.equal(g.last_tag, 'mcp-1.0.0');
  assert.deepEqual(subjects(g), ['two', 'one']);
});

test('a sub-package with no tag of its own reads its whole directory', t => {
  const {git, commit, digest} = repo(t);
  git('tag', '1.0.0');
  commit('a.txt', 'server work');
  commit('mcp/b.txt', 'adapter work');
  const g = digest('mcp');
  assert.equal(g.last_tag, null);
  assert.deepEqual(subjects(g), ['adapter work', 'start']);
});

test('the working tree is dirty only within what the package answers for', t => {
  const {write, digest} = repo(t);
  write('elsewhere.txt');
  assert.equal(digest('mcp').working_tree_dirty, false);
  assert.equal(digest().working_tree_dirty, true);
  write('mcp/here.txt');
  assert.equal(digest('mcp').working_tree_dirty, true);
});

test('a legacy `v` tag is still found, and still flagged', t => {
  const {git, commit, digest} = repo(t);
  git('tag', 'v1.0.0');
  commit('a.txt', 'one');
  const g = digest();
  assert.equal(g.last_tag, 'v1.0.0');
  assert.equal(g.tag_is_bare_semver, false);
});

test('a repository with no tag reads all of it', t => {
  const {commit, digest} = repo(t);
  commit('a.txt', 'one');
  const g = digest();
  assert.equal(g.last_tag, null);
  assert.deepEqual(subjects(g), ['one', 'start']);
});
