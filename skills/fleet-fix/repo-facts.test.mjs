// Run: node --test skills/fleet-fix/repo-facts.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'repo-facts.mjs');

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.invalid'
};

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], {
    cwd,
    env: GIT_ENV,
    stdio: ['ignore', 'pipe', 'pipe']
  });

const write = (path, text = 'x\n') => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, text);
};

const scratch = t => {
  const root = mkdtempSync(join(tmpdir(), 'repo-facts-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
};

const repoAt = (path, files) => {
  mkdirSync(path, {recursive: true});
  git(path, 'init', '-q', '-b', 'main');
  for (const [name, text] of Object.entries(files)) write(join(path, name), text);
  git(path, 'add', '.');
  git(path, 'commit', '-qm', 'first');
  return path;
};

const factsOf = (dir, ...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('a repository with no package.json gets the whole sheet', t => {
  const repo = repoAt(join(scratch(t), 'repo'), {
    'README.md': '# r\n',
    '.github/dependabot.yml': "updates:\n  - package-ecosystem: 'github-actions'\n"
  });
  git(repo, 'remote', 'add', 'origin', 'git@github.com:o/r.git');

  const facts = factsOf(repo);
  assert.deepEqual(facts.pkg, {present: false});
  assert.equal(facts.context.owner_repo, 'o/r');
  assert.equal(facts.context.name, null);
  assert.ok(facts.files.present.includes('README.md'));
  assert.ok(facts.files.absent.includes('AGENTS.md'));
  assert.deepEqual(facts.dependabot.ecosystems, ['github-actions']);
  assert.equal(facts.license_file.present, false);

  const context = factsOf(repo, '--context');
  assert.equal(context.owner_repo, 'o/r');
  assert.equal(context.name, null);
});

test('a repository with a package.json reads its surfaces', t => {
  const repo = repoAt(join(scratch(t), 'repo'), {
    'package.json': JSON.stringify({name: 'p', version: '1.2.3', scripts: {test: 'x'}})
  });
  const facts = factsOf(repo);
  assert.equal(facts.pkg.present, true);
  assert.deepEqual(facts.pkg.scripts, ['test']);
  assert.equal(facts.context.name, 'p');
  assert.equal(facts.context.version, '1.2.3');
});

const withWikiSubmodule = t => {
  const root = scratch(t);
  const wiki = repoAt(join(root, 'wiki-source'), {
    'Home.md': '# p\n\n# Search\n',
    '_Sidebar.md': 's\n'
  });
  const repo = repoAt(join(root, 'repo'), {'README.md': '# r\n'});
  git(repo, 'submodule', 'add', '-q', wiki, 'wiki');
  git(repo, 'commit', '-qm', 'wiki');
  const clone = join(root, 'clone');
  git(root, 'clone', '-q', repo, clone);
  return clone;
};

test('an uninitialized wiki submodule reads as unknown, not as an empty wiki', t => {
  const clone = withWikiSubmodule(t);
  const facts = factsOf(clone);
  assert.deepEqual(facts.wiki, {dir: 'wiki', initialized: false});
  assert.equal(facts.git.submodules[0].path, 'wiki');
  assert.equal(facts.git.submodules[0].initialized, false);
  assert.equal(facts.context.wiki_dir, 'wiki');
  assert.equal(facts.context.wiki_initialized, false);

  git(clone, 'submodule', 'update', '-q', '--init', 'wiki');
  const after = factsOf(clone);
  assert.equal(after.wiki.initialized, true);
  assert.equal(after.wiki.home_present, true);
  assert.equal(after.wiki.home_has_search_section, true);
  assert.equal(after.wiki.page_count, 2);
  assert.equal(after.git.submodules[0].initialized, true);
  assert.equal(after.context.wiki_initialized, true);
});

test('a submodule folder removed from the tree still names the wiki', t => {
  const clone = withWikiSubmodule(t);
  rmSync(join(clone, 'wiki'), {recursive: true});
  assert.deepEqual(factsOf(clone).wiki, {dir: 'wiki', initialized: false});
});

test('a stray file in a submodule folder git says is uninitialized changes nothing', t => {
  const clone = withWikiSubmodule(t);
  write(join(clone, 'wiki/stray.md'));
  assert.deepEqual(factsOf(clone).wiki, {dir: 'wiki', initialized: false});
});

test('an empty folder that .gitmodules names but git does not track reads as uninitialized', t => {
  const repo = repoAt(join(scratch(t), 'repo'), {
    '.gitmodules': '[submodule "wiki"]\n\tpath = wiki\n\turl = https://example.invalid/w.git\n'
  });
  mkdirSync(join(repo, 'wiki'));
  assert.deepEqual(factsOf(repo).wiki, {dir: 'wiki', initialized: false});
});

test('a wiki folder that is no submodule is read as it stands', t => {
  const repo = repoAt(join(scratch(t), 'repo'), {'wiki/Home.md': '# p\n'});
  const facts = factsOf(repo);
  assert.equal(facts.wiki.initialized, true);
  assert.equal(facts.wiki.home_present, true);
  assert.deepEqual(facts.git.submodules, []);
});

test('a repository with no wiki says so', t => {
  const repo = repoAt(join(scratch(t), 'repo'), {'README.md': '# r\n'});
  assert.deepEqual(factsOf(repo).wiki, {dir: null});
  assert.equal(factsOf(repo).context.wiki_initialized, null);
});
