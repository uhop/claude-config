// Pins the 2026-09-01 nearest-tag ranking fix: alias-or-mint is a nearest-string
// question, so usage must never outrank closeness, and (2026-09-06) shared words
// must outrank shared letters. Run: node --test skills/vault/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  editDistance,
  tokenDistance,
  neighborPrefixes,
  nearestTags,
  NEIGHBOR_KEEP
} from './tag-distance.mjs';

// A `con`-prefix window the way /tags returns it: ordered by usage, the rare
// singular/plural twin last. record_count values are illustrative.
const CON_WINDOW = [
  {tag: 'conventions', record_count: 90},
  {tag: 'context', record_count: 60},
  {tag: 'container', record_count: 50},
  {tag: 'control', record_count: 40},
  {tag: 'contract-testing', record_count: 30},
  {tag: 'config-file', record_count: 20},
  {tag: 'consistency', record_count: 15},
  {tag: 'concurrency', record_count: 12},
  {tag: 'configuration', record_count: 5},
  {tag: 'contracts', record_count: 2},
  {tag: 'css', record_count: 300},
  {tag: 'cli', record_count: 250},
  {tag: 'api', record_count: 400}
];

test('edit distance', () => {
  assert.equal(editDistance('contract', 'contracts'), 1);
  assert.equal(editDistance('config', 'configuration'), 7);
  assert.equal(editDistance('same', 'same'), 0);
  assert.equal(editDistance('', 'abc'), 3);
});

test('contract: the rarely used plural ranks first, not tenth', () => {
  const ranked = nearestTags('contract', CON_WINDOW);
  assert.equal(ranked[0].tag, 'contracts');
  assert.equal(ranked[0].edits, 1);
  assert.ok(ranked.length <= NEIGHBOR_KEEP);
});

test('config: the suffix family beats unrelated short tags', () => {
  const ranked = nearestTags('config', CON_WINDOW).map(r => r.tag);
  assert.ok(
    ranked.indexOf('configuration') < 3,
    `configuration at ${ranked.indexOf('configuration')}`
  );
  for (const short of ['css', 'cli', 'api']) {
    const at = ranked.indexOf(short);
    assert.ok(at === -1 || at > ranked.indexOf('configuration'), `${short} ranked ${at}`);
  }
});

test('ties break on usage, then on the tag name', () => {
  const ranked = nearestTags('abc', [
    {tag: 'abd', record_count: 1},
    {tag: 'abe', record_count: 9},
    {tag: 'abf', record_count: 9}
  ]);
  assert.deepEqual(
    ranked.map(r => r.tag),
    ['abe', 'abf', 'abd']
  );
});

// The `ado` and `bui` windows for `adopt-vs-build`, as /tags returned them on
// 2026-09-06. `build-vs-buy` already carried `build-vs-adopt` as an alias, but
// /tags lists canonicals only and a single 3-char window never fetched it.
const ADOPT_WINDOWS = [
  {tag: 'adoption', record_count: 1},
  {tag: 'build', record_count: 7},
  {tag: 'build-vs-buy', record_count: 6},
  {tag: 'build-pipelines', record_count: 4},
  {tag: 'build-archive', record_count: 1},
  {tag: 'build-artifacts', record_count: 1},
  {tag: 'build-hygiene', record_count: 1},
  {tag: 'build-verification', record_count: 1},
  {tag: 'builder', record_count: 1},
  {tag: 'builtin', record_count: 1}
];

test('token distance is Jaccard on the token multisets', () => {
  assert.equal(tokenDistance('adopt-vs-build', 'build-vs-adopt'), 0);
  assert.equal(tokenDistance('adopt-vs-build', 'build-vs-buy'), 0.5);
  assert.equal(tokenDistance('adopt-vs-build', 'adoption'), 1);
  assert.equal(tokenDistance('a-a-b', 'a-b-b'), 0.5);
  assert.equal(tokenDistance('same', 'same'), 0);
});

test('neighbour prefixes: one window per word, deduplicated', () => {
  assert.deepEqual(neighborPrefixes('adopt-vs-build'), ['ado', 'bui']);
  assert.deepEqual(neighborPrefixes('build-vs-buy'), ['bui', 'buy']);
  assert.deepEqual(neighborPrefixes('js-build'), ['js-', 'bui']);
  assert.deepEqual(neighborPrefixes('ml'), ['ml']);
  assert.deepEqual(neighborPrefixes('contract'), ['con']);
});

test('adopt-vs-build: the canonical sharing two words ranks first with no shared prefix', () => {
  const ranked = nearestTags('adopt-vs-build', ADOPT_WINDOWS);
  assert.equal(ranked[0].tag, 'build-vs-buy');
  assert.equal(ranked[0].token_distance, 0.5);
  assert.ok(ranked[0].distance > 0.5, `edit distance alone: ${ranked[0].distance}`);
  assert.equal(ranked.find(r => r.tag === 'adoption').token_distance, 1);
});

test('a word-order variant scores 0 and outranks the shared-word canonical', () => {
  const ranked = nearestTags('adopt-vs-build', [
    ...ADOPT_WINDOWS,
    {tag: 'build-vs-adopt', record_count: 0}
  ]);
  assert.equal(ranked[0].tag, 'build-vs-adopt');
  assert.equal(ranked[0].token_distance, 0);
  assert.equal(ranked[1].tag, 'build-vs-buy');
});

test('a suffix pair still wins on edit distance when no word is shared', () => {
  const ranked = nearestTags('contract', CON_WINDOW);
  assert.equal(ranked[0].tag, 'contracts');
  assert.equal(ranked[0].token_distance, 1);
});
