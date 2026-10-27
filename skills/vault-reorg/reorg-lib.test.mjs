// Pins /vault-reorg's pure layer against the shapes the 2026-10-27 reorganization of apodict's
// learnings met. Run: node --test skills/vault-reorg/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  splitNote,
  splitPiece,
  shardRows,
  checkResult,
  mergeResults,
  buildPieces,
  homeOf,
  settleOf,
  archivePathOf
} from './reorg-lib.mjs';

const NOTE = `---
title: x — Learnings
tags:
  - x
---
Reusable patterns. See [[projects/x/decisions]].

- **A preamble lesson (2026-07-20).** Kept in unit 0.

## 2026-08-01 — first session

- one

## A dated lesson in its heading (2026-08-05, D12)

\`\`\`markdown
## not a heading: inside a fence
\`\`\`

## A heading with no date

- inherits 2026-08-05
`;

test('splitNote: the opening block is unit 0, a fenced heading splits nothing, dates inherit', () => {
  const {frontmatter, rows} = splitNote(NOTE);
  assert.match(frontmatter, /^---\ntitle: x — Learnings\n/);
  assert.deepEqual(
    rows.map(r => [r.n, r.date]),
    [
      [0, '2026-07-20'],
      [1, '2026-08-01'],
      [2, '2026-08-05'],
      [3, '2026-08-05']
    ]
  );
  assert.equal(rows[0].head, '(opening block)');
  assert.match(rows[2].text, /## not a heading: inside a fence/);
  assert.equal(rows[1].bytes, Buffer.byteLength(rows[1].text));
});

test('splitNote: an empty opening block is no unit', () => {
  const {rows} = splitNote('---\ntitle: t\n---\n\n## 2026-09-01 only\n\n- a\n');
  assert.deepEqual(
    rows.map(r => r.n),
    [1]
  );
});

const PIECE = `---
title: "x learnings: harvester"
---
Live lessons on the harvester.

- First lesson, two lines
  continued here. *(§12, 2026-08-08; half-saved: corpus note (a dated report))*
- Second lesson with a fence:
  \`\`\`js
  - not a bullet
  \`\`\`
  *(§40, 2026-09-01; §41, 2026-09-02)*
- Third, no tail, dated 2026-10-01.
`;

test('splitPiece: bullets with continuations, fences masked, tails kept for provenance', () => {
  const {intro, rows} = splitPiece(PIECE);
  assert.equal(intro, 'Live lessons on the harvester.');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].tail, '§12, 2026-08-08; half-saved: corpus note (a dated report)');
  assert.equal(rows[0].date, '2026-08-08');
  assert.match(rows[1].text, /- not a bullet/);
  assert.equal(rows[1].tail, '§40, 2026-09-01; §41, 2026-09-02');
  assert.equal(rows[2].tail, null);
  assert.equal(rows[2].date, '2026-10-01');
});

test('shardRows: contiguous, disjoint, complete, and bounded unless one unit is larger', () => {
  const rows = [5, 5, 5, 12, 3, 3].map((bytes, n) => ({n, bytes}));
  const shards = shardRows(rows, 10);
  assert.deepEqual(
    shards.map(s => s.map(r => r.n)),
    [[0, 1], [2], [3], [4, 5]]
  );
  assert.deepEqual(shards.flat(), rows);
});

const result = (over = {}) => ({
  sections: 2,
  bullets: 3,
  counts: {A: 1, A_weak: 0, B: 0, C: 1, D: 1, E: 0},
  bytes: {A: 10, A_weak: 0, B: 0, C: 20, D: 30, E: 0},
  keep: [
    {
      n: 4,
      date: '2026-09-01',
      class: 'D',
      subject: 'harvester',
      text: 'Lesson.',
      evidence: 'none found'
    }
  ],
  defects: ['a.js:1 is stale'],
  ...over
});

test('checkResult: counts must sum to bullets, keep items need class, text, subject', () => {
  assert.deepEqual(checkResult(result(), 's'), []);
  assert.match(checkResult(result({bullets: 4}), 's')[0], /counts sum to 3, bullets say 4/);
  const bad = result({keep: [{n: 1, class: 'A', text: 'x'.repeat(601), subject: ''}]});
  const problems = checkResult(bad, 's').join('\n');
  assert.match(problems, /class A is not/);
  assert.match(problems, /601 characters/);
  assert.match(problems, /no subject/);
});

test('mergeResults: sums shards, numbers keep items, refuses a bad shard', () => {
  const merged = mergeResults([
    {name: 'light-1', result: result()},
    {name: 'light-2', result: result()}
  ]);
  assert.equal(merged.bullets, 6);
  assert.equal(merged.counts.D, 2);
  assert.equal(merged.bytes.C, 40);
  assert.deepEqual(
    merged.keep.map(k => [k.id, k.shard]),
    [
      [0, 'light-1'],
      [1, 'light-2']
    ]
  );
  assert.equal(merged.defects.length, 2);
  assert.throws(() => mergeResults([{name: 'x', result: result({bullets: 9})}]), RangeError);
});

const KEEP = [
  {id: 0, n: 30, date: '2026-09-20', class: 'D', text: 'Later lesson.', evidence: ''},
  {
    id: 1,
    n: 7,
    date: '2026-08-04',
    class: 'A_weak',
    text: 'Half-saved.',
    evidence: 'Only home: tests/a.test.js:9. Not elsewhere.'
  },
  {
    id: 2,
    n: 8,
    date: '2026-08-05',
    class: 'E',
    text: 'Unsure.',
    evidence: 'Unsure whether live. Settled when the queue item ships (then B).'
  },
  {id: 3, n: 31, date: '2026-09-21', class: 'D', text: 'Same as 0.', evidence: ''}
];

test('buildPieces: dated order, merged sources cited, half-saved and unsure annotated', () => {
  const plan = {pieces: [{name: 'core', items: [0, 1, 2]}], merges: [{drop: 3, into: 0}]};
  const [piece] = buildPieces(KEEP, plan, {intro: 'Intro line.'});
  assert.equal(piece.items, 3);
  assert.equal(
    piece.body,
    'Intro line.\n\n' +
      '- Half-saved. *(§7, 2026-08-04; half-saved: tests/a.test.js:9)*\n' +
      '- Unsure. *(§8, 2026-08-05; unsure: settled when the queue item ships (then B))*\n' +
      '- Later lesson. *(§30, 2026-09-20; §31, 2026-09-21)*\n'
  );
});

test('buildPieces: an item placed twice or nowhere is refused', () => {
  assert.throws(
    () => buildPieces(KEEP, {pieces: [{name: 'a', items: [0, 1, 2, 3, 0]}]}),
    /placed twice/
  );
  assert.throws(
    () => buildPieces(KEEP, {pieces: [{name: 'a', items: [0, 1]}]}),
    /placed nowhere: 2, 3/
  );
});

test('buildPieces: piece mode keeps a bullet’s own citation and replaces its annotation', () => {
  const sources = {1: {tail: '§12, 2026-08-08; half-saved: corpus note'}};
  const keep = [{id: 0, n: 1, date: '2026-08-08', class: 'D', text: 'Now live.', evidence: ''}];
  const [piece] = buildPieces(keep, {pieces: [{name: 'p', items: [0]}]}, {sources});
  assert.equal(piece.body, '- Now live. *(§12, 2026-08-08)*\n');
});

test('homeOf and settleOf read the evidence the triage agents write', () => {
  assert.equal(
    homeOf('Only homes: the comment at bin/a.js:3; and D9.'),
    'the comment at bin/a.js:3'
  );
  assert.equal(
    settleOf('Settle by timing one run: minutes means B.'),
    'settled by timing one run: minutes means B'
  );
  assert.equal(settleOf('Unsure whether it is live'), 'it is live');
});

test('archivePathOf mirrors the server’s supersede-in-place archive slot', () => {
  assert.equal(
    archivePathOf('projects/apodict/learnings.md', 2026),
    'projects/apodict/archive/2026/learnings.md'
  );
});
