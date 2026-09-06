// Pins the claim extractor and verifier behind /vault verify: what counts as a
// claim, and what the repository can refute. The negative cases are the
// 2026-09-06 calibration's false-positive classes. Run: node --test skills/vault-verify/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {extractClaims, verifyClaims} from './verify-claims.mjs';

const SHA_A = '3f66c92aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bb146c6bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TRACKED = [
  'skills/vault/tag-distance.mjs',
  'hooks/test/x.sh',
  'package.json',
  'dev-docs/a.md',
  'dev-docs/b.md',
  'src/core.js'
];
const FACTS = {
  tracked: new Set(TRACKED),
  exists: p => TRACKED.includes(p) || p === '.claude/INVARIANTS.md' || p === 'src',
  history: new Map([
    ['skills/vault/tag-distance.mjs', {first: '2026-09-01', last: '2026-09-06'}],
    ['hooks/test/x.sh', {first: '2026-08-10', last: '2026-08-10'}],
    ['package.json', {first: '2026-04-01', last: '2026-09-01'}],
    ['dev-docs/a.md', {first: '2026-05-01', last: '2026-05-01'}],
    ['dev-docs/b.md', {first: '2026-05-01', last: '2026-05-01'}],
    ['src/core.js', {first: '2026-06-01', last: '2026-06-01'}],
    ['bin/old.js', {first: '2026-05-01', last: '2026-07-01'}]
  ]),
  tags: new Map([['1.8.0', '2026-08-18']]),
  versions: new Set(['0.0.1', '1.8.0']),
  commits: new Map([
    [SHA_A, '2026-08-18'],
    [SHA_B, '2026-09-06']
  ]),
  lineCount: () => 50,
  topLevel: new Set(['skills', 'hooks', 'package.json', 'dev-docs', 'bin', 'src', '.claude'])
};

const run = body => verifyClaims(extractClaims(body), FACTS);
const details = r => r.findings.map(f => `${f.cat}: ${f.detail}`);

test('paths: present, gone, never, untracked-but-present, foreign, bare, line refs', () => {
  const r = run(
    [
      'Ranking lives in `skills/vault/tag-distance.mjs`; `src/` holds the engine.',
      'The old entry point `bin/old.js` was retired; `bin/new.js` is next; `.claude/INVARIANTS.md` is untracked.',
      'Pairs like `sat/unsat` and `JS/TS` are prose; `projects/x/queue.md` is a vault note; `package.json` and `state.md` name a file anywhere.',
      'See `hooks/test/x.sh:120` and `hooks/test/x.sh:12`.'
    ].join('\n')
  );
  assert.deepEqual(details(r), [
    'path: `bin/old.js` — gone; last seen 2026-07-01',
    'path: `bin/new.js` — never existed in this repository',
    'path: `hooks/test/x.sh:120` — the file has 50 lines'
  ]);
});

test('a path pairs with a date only in one-statement shapes; then it must have existed', () => {
  assert.deepEqual(
    details(run('Added `skills/vault/` (2026-08-17), three days before the catalogs.')),
    ['date: `skills/vault` paired with 2026-08-17, first committed 2026-09-01']
  );
  assert.deepEqual(details(run('Added `skills/vault/` (2026-09-02).')), []);
  assert.deepEqual(details(run('2026-08-17 (`skills/vault/`) is one statement too.')), [
    'date: `skills/vault` paired with 2026-08-17, first committed 2026-09-01'
  ]);
  assert.deepEqual(
    details(run('Filed 2026-08-17 by the sweep, later moved into `skills/vault/` with the rest.')),
    []
  );
  assert.deepEqual(
    details(run('revisions for 2026-08-17). `skills/vault/` came later.')),
    [],
    'a sentence boundary is not a pairing'
  );
});

test('commits: 7 or 40 hex only; unknown, dated, tolerant', () => {
  const r = run(
    [
      'Shipped in `3f66c92` (2026-08-18) and `bb146c6` (2026-09-05).',
      'Session `1bbd5284` and fragment `5ef4c36dbb22` are ids, not commits; `abcdef1` never existed.',
      'Pushed 2026-09-01; the fix landed in `bb146c6` later.'
    ].join('\n')
  );
  assert.deepEqual(details(r), [
    'commit: `abcdef1` — no such commit in this repository or any sibling checkout'
  ]);
  assert.equal(r.findings[0].sha, 'abcdef1');
  assert.deepEqual(details(run('Landed 2026-08-25 (`3f66c92`).')), [
    'commit: `3f66c92` is dated 2026-08-18, the note pairs it with 2026-08-25'
  ]);
});

test('versions: a release verb makes the claim; tags and package.json history answer it', () => {
  const r = run(
    'Release 1.8.0 (2026-08-18) shipped; version 1.9.0 is next; released 0.0.1 first; tagged 1.8.0 on 2026-08-30.'
  );
  assert.deepEqual(details(r), [
    'version: 1.9.0 — never a tag nor a package.json version here',
    'version: 1.8.0 was tagged 2026-08-18, the note pairs it with 2026-08-30'
  ]);
  assert.deepEqual(
    details(run('Node 22 bundles npm 10.9.8; date-fns 4.4.0 and `1.9.4` are other packages.')),
    []
  );
  const bare = verifyClaims(extractClaims('version 1.0.0 is out'), {
    ...FACTS,
    tags: new Map(),
    versions: new Set()
  });
  assert.equal(bare.findings.length, 0);
  assert.match(bare.unchecked[0].detail, /no tags and no package.json/);
});

test('counts: files in a directory and lines in a file, else unchecked', () => {
  const r = run(
    'The doc set is 3 files in `dev-docs/`; `src/core.js` (40 lines); seventeen fragments, 40 tests and 26 commits elsewhere; 8 files in `other/`.'
  );
  assert.deepEqual(details(r), [
    'count: 3 files in `dev-docs/` — git tracks 2',
    'count: 40 lines in `src/core.js` — the file has 50'
  ]);
  assert.deepEqual(
    r.unchecked.map(u => u.detail),
    ['26 commits — nothing to count it against']
  );
});

test('fenced blocks are examples, not claims, unless asked', () => {
  const body = 'Run:\n```bash\nnode bin/gone.js\n```\nThen `bin/also-gone.js`.';
  assert.deepEqual(details(run(body)), [
    'path: `bin/also-gone.js` — never existed in this repository'
  ]);
  assert.equal(verifyClaims(extractClaims(body, {fenced: true}), FACTS).findings.length, 1);
});
