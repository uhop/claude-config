// Pins `enrich-batch show`'s reader (vault-storage 0an): every chunk, piece, and body whole, and
// pages that join back into the whole item. Run: node --test skills/vault-enrich-all/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PAGE_CHARS, pageOf, renderIndex, renderItem} from './worksheet-view.mjs';

const tail = 'D526 shipped. Next: 0ab-3b-1b-2.';
const chunk = (index, text) => ({index, text});
const delta = {
  file_path: 'projects/p/plans/plan.md',
  title: 'A plan',
  type: 'plan',
  read: 'delta',
  reason: 'possibly_stale',
  existing_tags: ['plan'],
  current_agent: {
    summary: 'A plan through D521.',
    key_concepts: ['plan'],
    derived_from_hash: 'h',
    derived_at: 't'
  },
  body_wikilinks: ['[[a]]'],
  related_candidates: [],
  delta: {
    body_bytes: 9000,
    chunks: {total: 9, added: 2, removed: 0},
    added_bytes: 1400,
    removed_bytes: 0,
    changed_fraction: 0.15,
    added_chunks: [chunk(7, 'x'.repeat(600) + ' D525.'), chunk(8, 'y'.repeat(700) + ' ' + tail)]
  }
};

test('renderItem: a delta item shows every added chunk whole, its tail included', () => {
  const text = renderItem(delta, 1, 1);
  assert.ok(text.includes(tail), 'the newest entry, past any head cut');
  assert.ok(text.includes('x'.repeat(600) + ' D525.'));
  assert.ok(text.includes('--- added chunk 2 of 2 (index 8) ---'));
  assert.ok(text.includes('--- current summary ---\nA plan through D521.'));
  assert.ok(text.includes('reason: possibly_stale'));
  assert.ok(!text.includes('derived_from_hash'), 'the hash is no judgment input');
  assert.ok(text.endsWith('--- end of item 1 ---'));
});

test('renderItem: full, folder-delta, and outline reads', () => {
  const body = 'line 1\n'.repeat(50) + tail;
  assert.ok(renderItem({file_path: 'a.md', read: 'full', body}, 2, 3).includes(body));
  const pieces = [
    {file_path: 'f/one.md', updated: '2026-10-28', body: 'one'},
    {file_path: 'f/two.md', updated: '2026-10-29', body: tail}
  ];
  const folder = renderItem(
    {file_path: 'f.md', read: 'folder-delta', changed_pieces: pieces},
    1,
    1
  );
  assert.ok(folder.includes(`--- changed piece 2 of 2: f/two.md (2026-10-29) ---\n${tail}`));
  const outline = renderItem(
    {file_path: 'o.md', read: 'outline', outline: {body_bytes: 99, headings: ['# A', '## B']}},
    1,
    1
  );
  assert.ok(outline.includes('--- outline of 99 bytes ---\n# A\n## B'));
});

test('renderIndex: a line an item, numbered as show --item takes them', () => {
  const index = renderIndex({items: [delta, {file_path: 'b.md', read: 'full', body: 'abc'}]});
  assert.deepEqual(index.split('\n'), [
    '1. projects/p/plans/plan.md · read: delta · reason: possibly_stale · 2 added chunks',
    '2. b.md · read: full · 3 characters of body'
  ]);
});

const pages = (text, size) => {
  const out = [];
  for (let from = 0; from !== null;) {
    const {page, next, total} = pageOf(text, from, size);
    assert.equal(total, text.length);
    out.push(page);
    from = next;
  }
  return out;
};

test('pageOf: pages join back into the whole text', () => {
  const text = Array.from({length: 400}, (_, i) => `line ${i} ${'z'.repeat(i % 37)}`).join('\n');
  const parts = pages(text, 500);
  assert.equal(parts.join(''), text);
  for (const part of parts.slice(0, -1)) assert.ok(part.endsWith('\n'), 'a page ends at a line');
  for (const part of parts) assert.ok(part.length <= 500);
});

test('pageOf: a line longer than a page is cut at the page size, never inside a pair', () => {
  const line = 'a'.repeat(9) + '🙂' + 'b'.repeat(30);
  const parts = pages(line, 10);
  assert.equal(parts.join(''), line);
  assert.equal(parts[0], 'a'.repeat(9), 'the pair is left whole for the next page');
  assert.equal(parts[1], '🙂' + 'b'.repeat(8));
});

test('pageOf: a text that fits is one page', () => {
  assert.deepEqual(pageOf('short', 0), {page: 'short', next: null, total: 5});
  assert.equal(PAGE_CHARS, 24000);
});
