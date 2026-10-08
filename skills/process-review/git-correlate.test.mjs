// Release detection for /reflect's multi_release and /process-review's
// release_cluster. Run: node --test skills/process-review/
//
// Sources in Eugene's order (2026-10-08): npm's publish times, then the
// package.json version bumps, then the tag, checked and reported missing;
// commit subjects only for a repository with no package.json. The fixture
// mirrors the miss that filed it: vault-storage `bfbfbfd8` released
// @uhop/vault-storage-mcp twice under "New MCP version: X." subjects.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {correlateSession, projectDirForRepo, isVersionBump} from './git-correlate.mjs';

const T0 = Date.parse('2026-10-06T20:00:00Z');
const T1 = Date.parse('2026-10-06T23:01:00Z');
const T2 = Date.parse('2026-10-07T00:45:00Z');
const MIN = 60000;

const git = (repo, ts, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args
    ],
    {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.com',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.com',
        GIT_AUTHOR_DATE: new Date(ts).toISOString(),
        GIT_COMMITTER_DATE: new Date(ts).toISOString()
      }
    }
  );

const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

const withRepo = (build, run) => {
  const base = mkdtempSync(join(tmpdir(), 'gitcorrelate'));
  const repo = join(base, 'repo');
  mkdirSync(repo);
  try {
    git(repo, T0, 'init', '-q', '-b', 'main');
    build(repo);
    return run(repo);
  } finally {
    rmSync(base, {recursive: true, force: true});
  }
};

// vault-storage's shape: a private root package and a published one in mcp/.
const monorepo = repo => {
  mkdirSync(join(repo, 'mcp'));
  writeJson(join(repo, 'package.json'), {name: 'fixture-root', private: true, version: '0.0.1'});
  writeJson(join(repo, 'mcp', 'package.json'), {name: '@fixture/mcp', version: '0.13.0'});
  git(repo, T0, 'add', '.');
  git(repo, T0, 'commit', '-q', '-m', 'Started.');
  writeJson(join(repo, 'mcp', 'package.json'), {name: '@fixture/mcp', version: '0.14.0'});
  git(repo, T1, 'commit', '-q', '-am', 'New MCP version: 0.14.0.');
  git(repo, T1, 'tag', 'mcp-0.14.0');
  writeJson(join(repo, 'mcp', 'package.json'), {name: '@fixture/mcp', version: '0.15.0'});
  git(repo, T2, 'commit', '-q', '-am', 'New MCP version: 0.15.0.');
  git(repo, T2, 'tag', '0.15.0'); // the tag that was redone as mcp-0.15.0
};

// 0.16.0 was published from changes this repository never received.
const registry = {
  '@fixture/mcp': {
    status: 'ok',
    times: {'0.13.0': T0, '0.14.0': T1 + 10 * MIN, '0.15.0': T2 + 4 * MIN, '0.16.0': T2 + 8 * MIN}
  }
};
const online = name => registry[name] ?? {status: 'unpublished', times: {}};
const offline = () => ({status: 'not checked', times: {}});

const session = (repo, npmTimes) =>
  correlateSession(projectDirForRepo(repo), T1 - MIN, T2 + MIN, [], {npmTimes});

test('a package release counts whatever its commit subject says', () =>
  withRepo(monorepo, repo => {
    const git = session(repo, online);
    assert.equal(git.multi_release.length, 1);
    const [group] = git.multi_release;
    assert.equal(group.package, '@fixture/mcp');
    assert.deepEqual(
      group.releases.map(r => r.version),
      ['0.14.0', '0.15.0', '0.16.0']
    );
  }));

test('npm alone is enough, and a version no commit carries is flagged', () =>
  withRepo(monorepo, repo => {
    const {releases} = session(repo, online);
    const v16 = releases.find(r => r.version === '0.16.0');
    assert.equal(v16.recorded, false);
    assert.equal(v16.bump, undefined);
    assert.equal(releases.find(r => r.version === '0.15.0').recorded, true);
  }));

test('a release without its tag names the tag it expected', () =>
  withRepo(monorepo, repo => {
    const {releases} = session(repo, online);
    assert.equal(releases.find(r => r.version === '0.14.0').tag, 'mcp-0.14.0');
    const v15 = releases.find(r => r.version === '0.15.0');
    assert.equal(v15.tag, null);
    assert.ok(v15.tag_expected.includes('mcp-0.15.0'));
    assert.ok(!v15.tag_expected.includes('0.15.0'));
  }));

test('offline, the bumps still find the releases and npm is marked unchecked', () =>
  withRepo(monorepo, repo => {
    const git = session(repo, offline);
    assert.equal(git.npm['@fixture/mcp'], 'not checked');
    assert.deepEqual(
      git.releases.map(r => r.version),
      ['0.14.0', '0.15.0']
    );
    assert.equal(git.multi_release.length, 1);
  }));

test('a private package releases by its version bumps, never through npm', () =>
  withRepo(
    repo => {
      writeJson(join(repo, 'package.json'), {name: 'fixture-app', private: true, version: '0.7.0'});
      git(repo, T0, 'add', '.');
      git(repo, T0, 'commit', '-q', '-m', 'Started.');
      writeJson(join(repo, 'package.json'), {name: 'fixture-app', private: true, version: '0.8.0'});
      git(repo, T1, 'commit', '-q', '-am', 'Prepared the release.');
      git(repo, T1, 'tag', '0.8.0');
    },
    repo => {
      const asked = [];
      const git = session(repo, name => (asked.push(name), online(name)));
      assert.deepEqual(asked, []);
      assert.deepEqual(
        git.releases.map(r => [r.version, r.tag]),
        [['0.8.0', '0.8.0']]
      );
      assert.equal(git.multi_release.length, 0);
    }
  ));

test('a repository with no package.json falls back to commit subjects', () =>
  withRepo(
    repo => {
      writeFileSync(join(repo, 'README.md'), 'x\n');
      git(repo, T0, 'add', '.');
      git(repo, T0, 'commit', '-q', '-m', 'Started.');
      writeFileSync(join(repo, 'README.md'), 'y\n');
      git(repo, T1, 'commit', '-q', '-am', 'Release 1.0.0');
      writeFileSync(join(repo, 'README.md'), 'z\n');
      git(repo, T2, 'commit', '-q', '-am', 'Release 1.0.1');
    },
    repo => {
      const git = session(repo, online);
      assert.equal(git.multi_release.length, 1);
      assert.equal(git.multi_release[0].releases.length, 2);
    }
  ));

test('subjects stay the fallback: a post is not a release', () => {
  assert.equal(isVersionBump('New version: 1.2.0.'), true);
  assert.equal(isVersionBump('Published.'), false);
});
