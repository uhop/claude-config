// The pure layer of queue-items.mjs. Run: node --test skills/vault/queue-items.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  convertQueue,
  isConverted,
  openFields,
  remainderOf,
  slugOf,
  uniqueName
} from './queue-items.mjs';

test('slugOf names a file as the server names a piece', () => {
  assert.equal(
    slugOf('Draw the search window (filed 2026-09-30).'),
    'draw-the-search-window-filed-2026-09-30'
  );
  assert.equal(slugOf('`vault_append`: a café'), 'vault-append-a-cafe');
  assert.equal(slugOf('!!!'), 'item');
  const long = slugOf('word '.repeat(40));
  assert.ok(long.length <= 80 && !long.endsWith('-'));
});

test('uniqueName never repeats a name', () => {
  const taken = new Set();
  assert.equal(uniqueName('a', taken), 'a.md');
  assert.equal(uniqueName('a', taken), 'a-2.md');
  assert.equal(uniqueName('a', taken), 'a-3.md');
});

test('openFields writes the optional fields only when set', () => {
  assert.deepEqual(openFields({title: 'T', section: 'backlog', sequence: 3}), {
    title: 'T',
    type: 'queue-item',
    status: 'active',
    section: 'backlog',
    sequence_key: 3
  });
  const all = openFields({
    title: 'T',
    section: 'active',
    sequence: 1,
    priority: -1,
    source: 'github a/b#1',
    blockedBy: ['x']
  });
  assert.equal(all.priority, -1);
  assert.equal(all.source, 'github a/b#1');
  assert.deepEqual(all.blocked_by, ['x']);
});

const QUEUE = `---
title: A queue
---
Outstanding work, read this first.

## Active

(empty)

## Backlog

### Priority 0

- **One.** Its text.
  - source: github a/b#1

- **Two.** Its text.

\`\`\`
## not a heading
- not an item
\`\`\`

## See also

- [[topics/a]]

## Watching

- **Three.** Its text.
`;

test('remainderOf keeps what is outside the items and drops the shape', () => {
  const lines = QUEUE.split('\n');
  const at = title => lines.findIndex(l => l.startsWith(`- **${title}`)) + 1;
  const rest = remainderOf(QUEUE, [at('One'), at('Two'), at('Three')]);
  assert.match(rest, /^Outstanding work, read this first\./);
  assert.match(rest, /## See also\n\n- \[\[topics\/a\]\]/);
  assert.doesNotMatch(rest, /## Active|## Backlog|## Watching|Priority 0|\(empty\)/);
  assert.doesNotMatch(rest, /One\.|Two\.|Three\./);
  assert.doesNotMatch(rest, /not a heading/, 'a fence inside an item stays with the item');
  assert.doesNotMatch(rest, /title: A queue/, 'the frontmatter is not body text');
});

const resolving =
  filePath =>
  async (method, path, {json}) => {
    assert.equal(method, 'POST');
    assert.equal(path, '/resolve');
    assert.deepEqual(json, {wikilinks: ['projects/p/queue.md']});
    return Response.json({items: [{record_id: filePath && 'id', file_path: filePath}]});
  };

test('isConverted is false for an older folder beside a real queue.md', async () => {
  assert.equal(await isConverted('p', resolving('projects/p/queue.md')), false);
  assert.equal(await isConverted('p', resolving('projects/p/queue/_about.md')), true);
  assert.equal(await isConverted('p', resolving(null)), false);
});

test('convert refuses a folder of older pieces beside a real queue.md', async () => {
  const call = async (method, path) => {
    if (path === '/vault/projects/p/queue.md') return new Response('- **One.** Text.\n');
    if (path === '/queue/projects/p') {
      return Response.json({items: [{title: 'One', section: 'backlog', source_line: 1}]});
    }
    if (path === '/queue/projects/p/archive') return Response.json({items: []});
    if (path === '/notes/query') {
      return Response.json({
        items: [{path: 'projects/p/queue/old.md', frontmatter: {title: 'Old'}}]
      });
    }
    assert.fail(`nothing writes before the refusal: ${method} ${path}`);
  };
  await assert.rejects(convertQueue('p', {}, call), /1 older note.*projects\/p\/queue/);
});
