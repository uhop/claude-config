// Run: node --test skills/release-check/release-digest.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';

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
  return {git, write, commit, digest, dir};
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

// CI: `gh` and `npm` are stand-ins on PATH, so a digest reads no network and no real run.
const ciRepo = (t, {remote = 'https://github.com/o/r.git', pushed = true} = {}) => {
  const r = repo(t);
  const bin = mkdtempSync(path.join(tmpdir(), 'release-digest-bin-'));
  t.after(() => rmSync(bin, {recursive: true, force: true}));
  const stub = (name, body) =>
    writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, {mode: 0o755});
  stub('npm', `case "$1" in pack) echo '[{"files":[]}]';; *) echo '{}';; esac`);
  const gh = ({runs = [], jobs = {}, fail = false}) => {
    const views = Object.entries(jobs)
      .map(([id, list]) => `${id}) echo '${JSON.stringify({jobs: list})}';;`)
      .join(' ');
    stub(
      'gh',
      fail
        ? `echo 'gh: not logged in' >&2; exit 4`
        : `echo "$*" >> '${bin}/calls'\ncase "$2" in list) echo '${JSON.stringify(runs)}';; view) case "$3" in ${views} *) echo '{"jobs":[]}';; esac;; esac`
    );
  };
  if (remote) r.git('remote', 'add', 'origin', remote);
  if (remote && pushed) {
    r.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    r.git('branch', '-u', 'origin/main');
  }
  const ci = (sub = '.', flags = []) => {
    const out = spawnSync('node', [DIGEST, path.join(r.dir, sub), ...flags], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`}
    });
    return JSON.parse(out.stdout);
  };
  const workflow = (name, on) => r.write(`.github/workflows/${name}`, `name: W\n${on}\njobs: {}\n`);
  const sha = () => r.git('rev-parse', 'HEAD').trim();
  return {...r, gh, ci, workflow, sha, calls: () => path.join(bin, 'calls')};
};

const TESTS = "on:\n  push:\n    branches: ['main']\n  pull_request:\n    branches: ['main']";
const offline = c => c.ci('.', ['--no-network']).checks.ci;

test('a push workflow is waited on, and its command is complete', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  const ci = offline(c);
  assert.equal(ci.repo, 'o/r');
  assert.deepEqual(ci.workflows, [
    {file: 'tests.yml', on_push: true, path_filter: false, dispatch: false}
  ]);
  assert.deepEqual(ci.wait_commands, [
    `gh run watch --exit-status --repo o/r "$(gh run list --repo o/r --commit "$(git rev-parse HEAD)" --workflow tests.yml --json databaseId --jq '.[0].databaseId')"`
  ]);
  assert.deepEqual(ci.dispatch_commands, []);
});

test('each way of writing `on:` that the fleet could use is read', t => {
  const cases = [
    ['on: push', true],
    ['on: [push, pull_request]', true],
    ['on: [pull_request]', false],
    ['"on": push', true],
    ['on:\n  push:', true],
    ['on:\n  push:\n    branches:\n      - main\n      - next', true],
    ['on:\n  push:\n    branches:\n    - main', true],
    ['on:\n  push:\n    branches: [main, next] # both', true],
    ['on:\n  push:\n    branches: [main] # only', true],
    ['on: push # always', true],
    ['on:\n  pull_request:\n# a note\n  push:', true],
    ['on:\n  pull_request:\njobs:\n  push:\n    runs-on: x', false],
    ['on:\n  push:\n    branches: [next]', false],
    ['on:\n  push:\n    branches:\n      - next', false],
    ["on:\n  push:\n    branches: ['rel*']", true],
    ['on:\n  push:\n    branches-ignore: [main]', false],
    ['on:\n  push:\n    branches-ignore: [next]', true],
    ["on:\n  push:\n    tags: ['*']", false],
    ["on:\n  push:\n    tags-ignore: ['*']", false],
    ["on:\n  push:\n    tags: ['*']\n    branches: [main]", true],
    ['on:\n  pull_request:\n    branches: [main]', false],
    ["on:\n  schedule:\n    - cron: '17 6 * * 1'\n  workflow_dispatch:", false],
    ['# on: push\non:\n  # push:\n  pull_request:', false]
  ];
  for (const [on, want] of cases) {
    const c = ciRepo(t);
    c.workflow('w.yml', on);
    assert.equal(offline(c).workflows[0].on_push, want, on);
  }
});

test('a tag-only build is not waited on beside the tests', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.workflow('build.yml', "on:\n  push:\n    tags: ['*']");
  const ci = offline(c);
  assert.equal(ci.wait_commands.length, 1);
  assert.match(ci.wait_commands[0], /--workflow tests\.yml/);
});

test('two workflows a push fires are both waited on', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.workflow('browser.yaml', 'on: push');
  assert.equal(offline(c).wait_commands.length, 2);
});

test('with no push trigger there is nothing to wait on, and a dispatch is offered', t => {
  const c = ciRepo(t);
  c.workflow(
    'tests.yml',
    "on:\n  pull_request:\n    branches: ['main']\n    paths-ignore: ['**.md']\n  workflow_dispatch:"
  );
  const ci = offline(c);
  assert.deepEqual(ci.wait_commands, []);
  assert.deepEqual(ci.dispatch_commands, ['gh workflow run tests.yml --repo o/r --ref main']);
});

test('a dispatch is offered only by a workflow that takes one', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', 'on: [pull_request]');
  assert.deepEqual(offline(c).dispatch_commands, []);
});

test('a path filter on the push is said, since a release commit can miss it', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', "on:\n  push:\n    branches: [main]\n    paths-ignore: ['**.md']");
  assert.equal(offline(c).workflows[0].path_filter, true);
  const d = ciRepo(t);
  d.workflow('tests.yml', "on:\n  push:\n    paths: ['src/**']");
  assert.equal(offline(d).workflows[0].path_filter, true);
});

test('offline, the runs go unread and the digest is never clean for it', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  const d = c.ci('.', ['--no-network']);
  assert.equal(d.checks.ci.status, 'skip');
  assert.equal(d.checks.ci.reason, '--no-network');
  assert.ok(d.summary.unchecked.includes('ci'));
  assert.equal(d.checks.ci.head, null);
});

test('green runs read as ok, for the commit that is pushed', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.git('add', '-A');
  c.git('commit', '-qm', 'workflow');
  c.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const tip = c.sha();
  c.commit('later.txt', 'not pushed');
  c.gh({
    runs: [
      {
        databaseId: 7,
        workflowName: 'Tests',
        status: 'completed',
        conclusion: 'success',
        url: 'u',
        event: 'push'
      }
    ]
  });
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'ok');
  assert.equal(ci.head.sha, tip);
  assert.equal(ci.head.unpushed, 1);
  assert.deepEqual(ci.head.not_green, []);
  assert.deepEqual(ci.head.runs, [
    {workflow: 'Tests', status: 'completed', conclusion: 'success', url: 'u'}
  ]);
});

test('a failed run is an action, and names the jobs that failed', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.gh({
    runs: [
      {
        databaseId: 7,
        workflowName: 'Tests',
        status: 'completed',
        conclusion: 'failure',
        url: 'u',
        event: 'push'
      }
    ],
    jobs: {
      7: [
        {name: 'node 26 linux', status: 'completed', conclusion: 'success'},
        {name: 'node 24 macos', status: 'completed', conclusion: 'failure'},
        {name: 'lint', status: 'completed', conclusion: 'skipped'}
      ]
    }
  });
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'action');
  assert.deepEqual(ci.head.not_green, [
    {
      workflow: 'Tests',
      status: 'completed',
      conclusion: 'failure',
      url: 'u',
      jobs: ['node 24 macos: failure']
    }
  ]);
});

test('a run still going is pending, never green', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.gh({
    runs: [
      {
        databaseId: 8,
        workflowName: 'Tests',
        status: 'in_progress',
        conclusion: '',
        url: 'u',
        event: 'push'
      }
    ],
    jobs: {
      8: [
        {name: 'a', status: 'completed', conclusion: 'success'},
        {name: 'b', status: 'in_progress', conclusion: ''},
        {name: 'c', status: 'queued', conclusion: ''}
      ]
    }
  });
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'action');
  assert.equal(ci.head.pending, true);
  assert.deepEqual(ci.head.not_green[0].jobs, ['b: in_progress', 'c: queued']);
});

test('a cancelled run is not green', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.gh({
    runs: [
      {
        databaseId: 9,
        workflowName: 'Tests',
        status: 'completed',
        conclusion: 'cancelled',
        url: 'u',
        event: 'push'
      }
    ]
  });
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'action');
  assert.equal(ci.head.pending, false);
});

test('a skipped or neutral run is green', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.gh({
    runs: [
      {
        databaseId: 1,
        workflowName: 'A',
        status: 'completed',
        conclusion: 'skipped',
        url: 'u',
        event: 'push'
      },
      {
        databaseId: 2,
        workflowName: 'B',
        status: 'completed',
        conclusion: 'neutral',
        url: 'u',
        event: 'push'
      }
    ]
  });
  assert.equal(c.ci().checks.ci.status, 'ok');
});

test('no run for a commit a push should have fired is an action', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.gh({runs: []});
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'action');
  assert.equal(ci.head.no_runs, true);
});

test('no run where no push fires one is no finding', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', 'on: [pull_request]');
  c.gh({runs: []});
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'ok');
  assert.equal(ci.head.no_runs, true);
});

test('a `gh` that fails is an error, never a pass', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  c.gh({fail: true});
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'error');
  assert.match(ci.message, /not logged in/);
});

test('a branch with no upstream has nothing pushed to read', t => {
  const c = ciRepo(t, {pushed: false});
  c.workflow('tests.yml', TESTS);
  c.gh({runs: []});
  const ci = c.ci().checks.ci;
  assert.equal(ci.status, 'ok');
  assert.equal(ci.head, null);
  assert.equal(ci.wait_commands.length, 1);
});

test('no workflows, or no GitHub remote, skips the check', t => {
  const none = ciRepo(t);
  assert.equal(none.ci('.', ['--no-network']).checks.ci.reason, 'no workflows');
  const other = ciRepo(t, {remote: 'https://codeberg.org/o/r.git'});
  other.workflow('tests.yml', TESTS);
  assert.equal(other.ci('.', ['--no-network']).checks.ci.reason, 'no GitHub remote');
  const absent = ciRepo(t, {remote: null});
  absent.workflow('tests.yml', TESTS);
  assert.equal(absent.ci('.', ['--no-network']).checks.ci.reason, 'no GitHub remote');
});

test('a remote spelled any common way names the same repository', t => {
  for (const remote of [
    'git@github.com:o/r.git',
    'https://github.com/o/r',
    'ssh://git@github.com/o/r.git'
  ]) {
    const c = ciRepo(t, {remote});
    c.workflow('tests.yml', TESTS);
    assert.equal(offline(c).repo, 'o/r', remote);
  }
});

test('a sub-package reads the workflows at the repository root', t => {
  const c = ciRepo(t);
  c.workflow('tests.yml', TESTS);
  const ci = c.ci('mcp', ['--no-network']).checks.ci;
  assert.equal(ci.workflows.length, 1);
});
