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
  git('init', '-q', '-b', 'main');
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

// What changed for users, read from a tagged repository.
const tagged = t => {
  const r = repo(t);
  const full = (sub = '.') => {
    const out = spawnSync('node', [DIGEST, path.join(r.dir, sub), '--no-network'], {
      encoding: 'utf8'
    });
    return JSON.parse(out.stdout);
  };
  const save = (rel, text, subject = 'change') => {
    r.write(rel, text);
    r.git('add', '-A');
    r.git('commit', '-qm', subject);
  };
  return {...r, full, save};
};
const surface = (c, sub) => c.full(sub).checks.type_surface;
const tests = (c, sub) => c.full(sub).checks.test_assertions;

test('with no tag there is no change to read', t => {
  const c = tagged(t);
  assert.equal(surface(c).reason, 'no tag');
  assert.equal(tests(c).reason, 'no tag');
});

test('a release that touches no types has nothing to review', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.save('src/a.js', 'x\n');
  const d = c.full();
  assert.equal(d.checks.type_surface.review, false);
  assert.deepEqual(d.checks.type_surface.added, []);
  assert.deepEqual(d.summary.review, []);
});

test('each way of declaring a name is read', t => {
  const c = tagged(t);
  c.save('index.d.ts', 'export declare function kept(): void;\n');
  c.git('tag', '1.0.0');
  c.save(
    'index.d.ts',
    [
      'export declare function kept(): void;',
      'export declare function fnA(a: string): void;',
      'export function fnB(): void;',
      'export async function fnC(): void;',
      'export default function fnD(): void;',
      'export class ClsA {',
      '  method<T>(a: T): void;',
      '  prop: number;',
      '  optional?: string;',
      '  readonly ro: string;',
      '  static st(): void;',
      '  get gt(): string;',
      '  private hidden: number;',
      '  multi(',
      '    param: string,',
      '    other?: number,',
      '  ): void;',
      '}',
      'export abstract class ClsB {}',
      'export interface IfaceA {}',
      'export type TypeA = string;',
      'export const constA: number;',
      'export declare const constB: number;',
      'export enum EnumA {}',
      'export namespace NsA {}',
      'declare function ambient(): void;',
      "export {reA, reB as reC} from './x.js';",
      '/** A comment that names commentWord: and more. */',
      ' * starWord: in a comment',
      '// slashWord: in a comment',
      "import type {Hidden} from './y.js';",
      ''
    ].join('\n')
  );
  const added = surface(c).added;
  const want = [
    'fnA',
    'fnB',
    'fnC',
    'fnD',
    'ClsA',
    'method',
    'prop',
    'optional',
    'ro',
    'st',
    'gt',
    'multi',
    'ClsB',
    'IfaceA',
    'TypeA',
    'constA',
    'constB',
    'EnumA',
    'NsA',
    'ambient',
    'reA',
    'reC'
  ];
  assert.deepEqual([...added].sort(), [...want].sort());
});

test('a signature that changed is changed, and one that went is removed', t => {
  const c = tagged(t);
  c.save(
    'index.d.ts',
    'export function same(a: string): void;\nexport function gone(): void;\nexport function kept(): void;\n'
  );
  c.git('tag', '1.0.0');
  c.save(
    'index.d.ts',
    'export function same(a: string, b: number): void;\nexport function kept(): void;\n'
  );
  const s = surface(c);
  assert.deepEqual(s.added, []);
  assert.deepEqual(s.changed, ['same']);
  assert.deepEqual(s.removed, ['gone']);
  assert.equal(s.review, true);
});

test('a removal alone is for review', t => {
  const c = tagged(t);
  c.save('index.d.ts', 'export function gone(): void;\nexport function kept(): void;\n');
  c.git('tag', '1.0.0');
  c.save('index.d.ts', 'export function kept(): void;\n');
  const s = surface(c);
  assert.deepEqual(s.unmentioned, []);
  assert.deepEqual(s.removed, ['gone']);
  assert.equal(s.review, true);
});

test('a name moved between files is neither added nor removed', t => {
  const c = tagged(t);
  c.save('src/a.d.ts', 'export function moved(): void;\n');
  c.git('tag', '1.0.0');
  c.save('src/a.d.ts', 'export {};\n');
  c.save('src/b.d.ts', 'export function moved(): void;\n');
  const s = surface(c);
  assert.deepEqual(s.added, []);
  assert.deepEqual(s.removed, []);
  assert.deepEqual(s.changed, ['moved']);
});

test('types under a test directory are not the public surface', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  for (const dir of ['tests', 'test', 'ts-test', 'ts-tests', '__tests__'])
    c.save(`${dir}/x.d.ts`, 'export function hidden(): void;\n');
  assert.deepEqual(surface(c).added, []);
});

test('a sub-package answers for its own types', t => {
  const c = tagged(t);
  c.git('tag', 'mcp-1.0.0');
  c.save('other.d.ts', 'export function outside(): void;\n');
  c.save('mcp/in.d.ts', 'export function inside(): void;\n');
  assert.deepEqual(surface(c, 'mcp').added, ['inside']);
});

test('an uncommitted edit counts, since the release carries it', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.write('index.d.ts', 'export function fresh(): void;\n');
  c.git('add', '-A');
  assert.deepEqual(surface(c).added, ['fresh']);
});

test('before the bump, every added name is unmentioned, and is for review, never unclean', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.save('index.d.ts', 'export function fresh(): void;\n');
  c.save('wiki/Release-notes.md', '# Release notes\n\n## 1.0.0\n\n`fresh` from long ago.\n');
  const d = c.full();
  assert.deepEqual(d.checks.type_surface.unmentioned, ['fresh']);
  assert.equal(d.checks.type_surface.status, 'ok');
  assert.ok(d.summary.review.includes('type_surface'));
  assert.ok(!d.summary.action.includes('type_surface'));
});

test('a name in either tier of the new release is mentioned, and one in an older release is not', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.save(
    'index.d.ts',
    'export function inWiki(): void;\nexport function inReadme(): void;\nexport function inOld(): void;\nexport function inNeither(): void;\n$dollar: string;\n'
  );
  c.save('package.json', '{"name": "root", "version": "1.1.0"}\n');
  c.save(
    'wiki/Release-notes.md',
    '# Release notes\n\n## 1.1.0 &mdash; 2026-11-03\n\n**`inWiki()`** is new, and so is `$dollar`.\n\n### Added\n\nStill this release: nothing else.\n\n## 1.0.0\n\n`inOld` shipped here.\n'
  );
  c.save(
    'README.md',
    '# R\n\n## Release History\n\n- 1.1.0 _New `inReadme`._\n- 1.0.0 _`inOld` too._\n'
  );
  assert.deepEqual(surface(c).unmentioned, ['inOld', 'inNeither']);
});

test('a heading names a version only as a whole version', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.save('index.d.ts', 'export function near(): void;\n');
  c.save('package.json', '{"name": "root", "version": "1.1.0"}\n');
  c.save(
    'wiki/Release-notes.md',
    '# Release notes\n\n## 11.1.0\n\n`near`\n\n## 1.1.01\n\n`near`\n'
  );
  assert.deepEqual(surface(c).unmentioned, ['near']);
});

test('a release section ends at the next heading of its level', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.save('index.d.ts', 'export function inSub(): void;\nexport function past(): void;\n');
  c.save('package.json', '{"name": "root", "version": "1.1.0"}\n');
  c.save(
    'wiki/Release-notes.md',
    '# N\n\n## 1.1.0\n\n### Added\n\n`inSub`\n\n## 1.0.9\n\n`past`\n'
  );
  assert.deepEqual(surface(c).unmentioned, ['past']);
});

test('a fix commit that adds public surface is flagged on its own', t => {
  const c = tagged(t);
  c.save('index.d.ts', 'export function old(a: string): void;\n');
  c.git('tag', '1.0.0');
  c.save('index.d.ts', 'export function old(a: string, b: string): void;\n', 'Fixed a thing.');
  c.save(
    'index.d.ts',
    'export function old(a: string, b: string): void;\nexport function open(): void;\n',
    'Added open.'
  );
  c.save(
    'index.d.ts',
    'export function old(a: string, b: string): void;\nexport function open(): void;\nexport function sly(): void;\n',
    'Bugfix: edge cases.'
  );
  c.save('src/a.js', 'x\n', 'fix: no types here');
  const flagged = surface(c).fix_commits_adding_surface;
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].subject, /Bugfix: edge cases/);
  assert.deepEqual(flagged[0].added, ['sly']);
});

test('a commit that says fixed and adds surface is flagged like one that says bugfix', t => {
  const c = tagged(t);
  c.git('tag', '1.0.0');
  c.save('index.d.ts', 'export function sly(): void;\n', 'Fixed the edge cases.');
  assert.deepEqual(surface(c).fix_commits_adding_surface[0].added, ['sly']);
});

test('an indented assertion is read, as real tests write them', t => {
  const c = tagged(t);
  c.save('tests/a.js', "test('x', t => {\n    t.ok(before);\n});\n");
  c.git('tag', '1.0.0');
  c.save('tests/a.js', "test('x', t => {\n    t.ok(after);\n});\n");
  const a = tests(c);
  assert.equal(a.removed_count, 1);
  assert.equal(a.added_count, 1);
  assert.deepEqual(a.removed[0].lines, ['t.ok(before);']);
});

test('one added copy answers for one removed copy', t => {
  const c = tagged(t);
  c.save('tests/a.js', 't.ok(twin);\nt.ok(twin);\n');
  c.git('tag', '1.0.0');
  c.save('tests/a.js', 'x\n');
  c.save('tests/b.js', 't.ok(twin);\n');
  assert.equal(tests(c).removed_count, 1);
});

test('a rewritten assertion is listed apart from the added ones', t => {
  const c = tagged(t);
  c.save('tests/a.js', "t.ok(caught instanceof Stop, 'propagates');\nt.equal(other, 1);\n");
  c.git('tag', '1.0.0');
  c.save('tests/a.js', "t.equal(caught, undefined, 'ends');\nt.equal(other, 1);\nt.ok(extra);\n");
  const a = tests(c);
  assert.equal(a.review, true);
  assert.equal(a.removed_count, 1);
  assert.equal(a.added_count, 2);
  assert.deepEqual(a.removed, [
    {file: 'tests/a.js', lines: ["t.ok(caught instanceof Stop, 'propagates');"]}
  ]);
});

test('each assertion spelling the fleet uses is read', t => {
  const lines = [
    't.ok(a);',
    'await t.rejects(b);',
    'return t.equal(c, 1);',
    'assert.equal(d, 1);',
    'assert(e);',
    'expect(f).toBe(1);',
    'eval(TEST("g"));',
    'eval(t.TEST("h"));'
  ];
  const c = tagged(t);
  c.save('tests/a.js', lines.join('\n') + '\n');
  c.git('tag', '1.0.0');
  c.save('tests/a.js', 'x\n');
  assert.equal(tests(c).removed_count, lines.length);
});

test('what is no assertion is not listed', t => {
  const c = tagged(t);
  c.save(
    'tests/a.js',
    [
      "t.test('x', () => {});",
      "t.comment('y');",
      't.plan(2);',
      't.skip();',
      'const v = 1;',
      "test('z', t => {});",
      '// t.ok(commented);'
    ].join('\n') + '\n'
  );
  c.git('tag', '1.0.0');
  c.save('tests/a.js', 'x\n');
  assert.equal(tests(c).removed_count, 0);
  assert.equal(tests(c).review, false);
});

test('a moved or reindented assertion is no rewrite', t => {
  const c = tagged(t);
  c.save('tests/a.js', 't.ok(moved);\n  t.ok(indented);\n');
  c.git('tag', '1.0.0');
  c.save('tests/a.js', '    t.ok(indented);\n');
  c.save('tests/b.js', 't.ok(moved);\n');
  assert.equal(tests(c).removed_count, 0);
  assert.equal(tests(c).added_count, 0);
});

test('assertions outside the tests are not read, and every test place is', t => {
  const c = tagged(t);
  c.save('src/a.js', 't.ok(notATest);\n');
  for (const f of [
    'tests/a.js',
    'test/a.js',
    'ts-test/a.ts',
    'ts-tests/a.ts',
    '__tests__/a.js',
    'src/b.test.js'
  ])
    c.save(f, `t.ok(${path.basename(path.dirname(f)).replace(/\W/g, '')});\n`);
  c.git('tag', '1.0.0');
  c.save('src/a.js', 'x\n');
  for (const f of [
    'tests/a.js',
    'test/a.js',
    'ts-test/a.ts',
    'ts-tests/a.ts',
    '__tests__/a.js',
    'src/b.test.js'
  ])
    c.save(f, 'x\n');
  assert.equal(tests(c).removed_count, 6);
});

test('a sub-package answers for its own tests', t => {
  const c = tagged(t);
  c.save('tests/a.js', 't.ok(outside);\n');
  c.save('mcp/tests/a.js', 't.ok(inside);\n');
  c.git('tag', 'mcp-1.0.0');
  c.save('tests/a.js', 'x\n');
  c.save('mcp/tests/a.js', 'y\n');
  assert.deepEqual(tests(c, 'mcp').removed, [{file: 'tests/a.js', lines: ['t.ok(inside);']}]);
});

test('a long list is cut, and the count still says all of it', t => {
  const c = tagged(t);
  const many = Array.from({length: 40}, (_, i) => `t.ok(${i});`).join('\n') + '\n';
  c.save('tests/a.js', many);
  c.git('tag', '1.0.0');
  c.save('tests/a.js', 'x\n');
  const a = tests(c);
  assert.equal(a.removed_count, 40);
  assert.equal(a.removed[0].lines.length, 30);
});

test('rewritten assertions are for review, never unclean', t => {
  const c = tagged(t);
  c.save('tests/a.js', 't.ok(a);\n');
  c.git('tag', '1.0.0');
  c.save('tests/a.js', 'x\n');
  const d = c.full();
  assert.equal(d.checks.test_assertions.status, 'ok');
  assert.ok(d.summary.review.includes('test_assertions'));
  assert.ok(!d.summary.action.includes('test_assertions'));
});

// The paths a wiki page's code names.
const wikiPaths = c => c.full().checks.wiki_paths;
const fence = body => '```bash\n' + body + '\n```\n';

test('no wiki, or a wiki with no pages, skips the check', t => {
  const c = tagged(t);
  assert.equal(wikiPaths(c).reason, 'no wiki');
  mkdirSync(path.join(c.dir, 'wiki'));
  assert.equal(wikiPaths(c).reason, 'no wiki pages');
});

test('a command naming a file that never existed is listed, by page and line', t => {
  const c = tagged(t);
  c.save('bench/parser-jsonc.js', 'x\n');
  c.save('wiki/Benchmarks.md', '# B\n\n' + fence('npm run bench -- bench/parser-jsonc.mjs'));
  const w = wikiPaths(c);
  assert.equal(w.review, true);
  assert.equal(w.status, 'ok');
  assert.deepEqual(w.unresolved, [
    {page: 'Benchmarks.md', line: 4, path: 'bench/parser-jsonc.mjs'}
  ]);
  const d = c.full();
  assert.ok(d.summary.review.includes('wiki_paths'));
  assert.ok(!d.summary.action.includes('wiki_paths'));
});

test('a path that resolves is not listed, however it is spelled', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save('src/b.mjs', 'x\n');
  c.save('src/c.d.ts', 'x\n');
  const spellings = [
    'bench/a.js',
    './bench/a.js',
    'bench/',
    'bench',
    'src/b',
    'src/c',
    './src/b.mjs',
    'bench/a.js.'
  ];
  c.save('wiki/P.md', fence(spellings.map(p => `run ${p}`).join('\n')));
  assert.deepEqual(wikiPaths(c).unresolved, []);
  assert.equal(wikiPaths(c).review, false);
});

test('a path that does not resolve is listed however it opens', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save('wiki/P.md', fence('./bench/gone.js'));
  assert.deepEqual(
    wikiPaths(c).unresolved.map(u => u.path),
    ['bench/gone.js']
  );
});

test('an inline span is read, and prose is not', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save('wiki/P.md', 'Plain bench/prose.js here, and `bench/span.js` there.\n');
  assert.deepEqual(
    wikiPaths(c).unresolved.map(u => u.path),
    ['bench/span.js']
  );
});

test('each fence is read, and the text past its end is prose again', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save(
    'wiki/P.md',
    '~~~\nbench/tilde.js\n~~~\nbench/after.js\n````\n```\nbench/inner.js\n````\n  ```\n  bench/indented.js\n  ```\n'
  );
  assert.deepEqual(
    wikiPaths(c).unresolved.map(u => u.path),
    ['bench/tilde.js', 'bench/inner.js', 'bench/indented.js']
  );
});

test('one kind of fence is not closed by the other', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save('wiki/P.md', '```\n~~~\nbench/mix.js\n```\n');
  assert.deepEqual(
    wikiPaths(c).unresolved.map(u => u.path),
    ['bench/mix.js']
  );
});

test('only the pages are read', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save('wiki/notes.txt', '`bench/text.js`\n');
  c.save('wiki/P.md', 'nothing\n');
  assert.deepEqual(wikiPaths(c).unresolved, []);
});

test('what is no path in this repository is not listed', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  const others = [
    'other/x.js',
    'https://github.com/o/r/blob/main/bench/url.js',
    'git@github.com:o/bench.git',
    '@scope/bench/x.js',
    'node_modules/bench/x.js',
    'bench/test-*.js',
    'bench/<name>.js',
    'bench/{a,b}.js',
    '$W/bench/x.js',
    '${W}/bench/y.js',
    '/abs/bench/z.js',
    '../bench/up.js'
  ];
  c.save('wiki/P.md', fence(others.join('\n')));
  assert.deepEqual(wikiPaths(c).unresolved, []);
});

test('a path after each kind of opener is read', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save(
    'wiki/P.md',
    fence(
      `f('bench/q.js')\ng("bench/d.js")\nh(bench/p.js)\nm=bench/e.js\nk:bench/c.js\n[bench/s.js]\nx,bench/k.js`
    )
  );
  assert.deepEqual(
    wikiPaths(c).unresolved.map(u => u.path),
    [
      'bench/q.js',
      'bench/d.js',
      'bench/p.js',
      'bench/e.js',
      'bench/c.js',
      'bench/s.js',
      'bench/k.js'
    ]
  );
});

test('release notes and pages for an old version are history, and go unread', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  for (const page of ['Release-notes.md', 'V1-Home.md', 'README-0.6.x.md'])
    c.save(`wiki/${page}`, fence('bench/old.js'));
  c.save('wiki/Version-notes.md', fence('bench/current.js'));
  const w = wikiPaths(c);
  assert.equal(w.pages_read, 1);
  assert.deepEqual(
    w.unresolved.map(u => u.path),
    ['bench/current.js']
  );
});

test('a file on disk that git ignores resolves', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.write('bench/built.js', 'x\n');
  c.save('.gitignore', 'bench/built.js\n');
  c.save('wiki/P.md', fence('bench/built.js'));
  assert.deepEqual(wikiPaths(c).unresolved, []);
});

test('a page naming three files of a directory is checked against the rest', t => {
  const c = tagged(t);
  for (const n of 'abcde') c.save(`bench/${n}.js`, 'x\n');
  c.save('bench/deep/f.js', 'x\n');
  c.save('wiki/P.md', fence('bench/a.js bench/b.js bench/c.js'));
  const w = wikiPaths(c);
  assert.equal(w.review, true);
  assert.deepEqual(w.partial_listings, [
    {page: 'P.md', dir: 'bench', named: 3, of: 5, missing: ['bench/d.js', 'bench/e.js']}
  ]);
});

test('a directory named beside two files does not make three', t => {
  const c = tagged(t);
  for (const n of 'abcd') c.save(`bench/${n}.js`, 'x\n');
  c.save('bench/deep/f.js', 'x\n');
  c.save('wiki/P.md', fence('bench/a.js bench/b.js bench/deep/'));
  assert.deepEqual(wikiPaths(c).partial_listings, []);
});

test('two files are a citation, and a whole directory is no gap', t => {
  const c = tagged(t);
  for (const n of 'abcde') c.save(`bench/${n}.js`, 'x\n');
  c.save('wiki/Cite.md', fence('bench/a.js bench/b.js'));
  c.save('wiki/Whole.md', fence('bench/a.js bench/b.js bench/c.js bench/d.js bench/e.js'));
  assert.deepEqual(wikiPaths(c).partial_listings, []);
  assert.equal(wikiPaths(c).review, false);
});

test('a page counts each file once, and each page on its own', t => {
  const c = tagged(t);
  for (const n of 'abcd') c.save(`bench/${n}.js`, 'x\n');
  c.save('wiki/A.md', fence('bench/a.js bench/a.js bench/a.js bench/b.js'));
  c.save('wiki/B.md', fence('bench/c.js'));
  assert.deepEqual(wikiPaths(c).partial_listings, []);
});

test('a long list is cut, and the count still says all of it', t => {
  const c = tagged(t);
  c.save('bench/a.js', 'x\n');
  c.save('wiki/P.md', fence(Array.from({length: 50}, (_, i) => `bench/gone-${i}.js`).join('\n')));
  const w = wikiPaths(c);
  assert.equal(w.unresolved_count, 50);
  assert.equal(w.unresolved.length, 30);
  assert.equal(w.paths_read, 50);
});
