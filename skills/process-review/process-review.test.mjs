import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';

const SCRIPT = fileURLToPath(new URL('./process-review.mjs', import.meta.url));

let repo;
const git = (...args) =>
  execFileSync(
    'git',
    ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args],
    {encoding: 'utf8'}
  );
const write = (path, text) => {
  mkdirSync(dirname(join(repo, path)), {recursive: true});
  writeFileSync(join(repo, path), text);
};
const commit = subject => {
  git('add', '-A');
  git('commit', '-q', '-m', subject);
};
const edits = () => {
  // Through `cat`, since Node's own stdio for a child is no OS pipe, and only a pipe truncates.
  const run = spawnSync('bash', ['-c', 'node "$0" "$1" --json --top=99 | cat', SCRIPT, repo], {
    encoding: 'utf8',
    maxBuffer: 2 ** 28
  });
  return JSON.parse(run.stdout).findings.assertion_edit;
};
const edit = subject => edits().find(f => f.commits[0].subject === subject);

const SUITE = `import {test} from 'tape-six';
test('a', t => {
  t.equal(run(), 1);
  t.equal(run(2), 2);
});
`;

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'process-review-'));
  git('init', '-q');
  write('src/a.js', 'export const run = () => 1;\n');
  write('tests/a.test.js', SUITE);
  commit('The first.');
  write('src/a.js', 'export const run = () => 2;\n');
  write('tests/a.test.js', SUITE.replace('t.equal(run(), 1);', 't.ok(run());'));
  commit('Weakened with the source.');
  write('tests/a.test.js', SUITE.replace('t.equal(run(), 1);', 't.ok(run(), "x");'));
  commit('Rewrote with no source.');
  write(
    'tests/a.test.js',
    SUITE.replace('t.equal(run(), 1);', 't.ok(run(), "x");') + '// a note\n'
  );
  write('src/a.js', 'export const run = () => 3;\n');
  commit('No assertion changed.');
  write('src/a.js', 'export const run = () => 4;\n');
  write(
    'tests/a.test.js',
    `import {test} from 'tape-six';
test('a', t => {
    t.equal(run(2), 2);
    t.ok(run(), "x");
});
// a note
`
  );
  commit('Moved and reindented.');
  write('src/a.js', 'export const run = () => 5;\n');
  write('src/z.js', 'export const z = 1;\n');
  rmSync(join(repo, 'tests/a.test.js'));
  commit('Removed the test file.');
});

after(() => rmSync(repo, {recursive: true, force: true}));

test('an assertion rewritten beside a source change is an edit, with its counts', () => {
  const found = edit('Weakened with the source.');
  assert.equal(found.with_source, true);
  assert.equal(found.removed_count, 1);
  assert.equal(found.added_count, 1);
  assert.deepEqual(found.removed, [{file: 'tests/a.test.js', text: 't.equal(run(), 1);'}]);
  assert.deepEqual(found.source_files, ['src/a.js']);
});

test('an assertion rewritten alone is an edit, marked as having no source', () => {
  const found = edit('Rewrote with no source.');
  assert.equal(found.with_source, false);
  assert.deepEqual(found.source_files, []);
});

test('a commit that changes no existing assertion is no edit', () => {
  assert.equal(edit('The first.'), undefined);
  assert.equal(edit('No assertion changed.'), undefined);
});

test('an assertion that only moved or was reindented is no edit', () => {
  assert.equal(edit('Moved and reindented.'), undefined);
});

test('a deleted test file counts against that file', () => {
  const found = edit('Removed the test file.');
  assert.equal(found.with_source, true);
  assert.equal(found.removed_count, 2);
  assert.equal(found.added_count, 0);
  assert.ok(found.removed.every(line => line.file === 'tests/a.test.js'));
});

test('a report past a pipe’s buffer arrives whole', () => {
  write('tests/b.test.js', SUITE);
  commit('Added another test.');
  write('tests/b.test.js', SUITE.replace('t.equal(run(), 1);', 't.ok(run());'));
  commit('x'.repeat(70_000));
  assert.equal(edits().find(f => f.commits[0].subject.startsWith('xxx')).removed_count, 1);
});

test('a commit with a source change sorts ahead of one with none', () => {
  const sources = edits().map(f => f.with_source);
  assert.deepEqual(
    sources,
    [...sources].sort((a, b) => b - a)
  );
});
