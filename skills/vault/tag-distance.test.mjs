// Pins the 2026-09-01 nearest-tag ranking fix: alias-or-mint is a nearest-string
// question, so usage must never outrank closeness. Run: node --test skills/vault/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {editDistance, nearestTags, NEIGHBOR_KEEP} from './tag-distance.mjs';

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
