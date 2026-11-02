// The pure layer of queue-items.mjs. Run: node --test skills/vault/queue-items.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {
  archiveItem,
  convertQueue,
  isConverted,
  missingWords,
  openFields,
  owedItems,
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

test('remainderOf drops a date heading with nothing left under it, and keeps one with text', () => {
  const text = `Closed items.

## 2026-05-05

- **One.** Shipped.

## 2026-08-20

**A paragraph entry.** It has no bullet.

## 2026-09-01

- **Two.** Shipped.
`;
  const lines = text.split('\n');
  const at = title => lines.findIndex(l => l.startsWith(`- **${title}`)) + 1;
  const rest = remainderOf(text, [at('One'), at('Two')]);
  assert.equal(rest, 'Closed items.\n\n## 2026-08-20\n\n**A paragraph entry.** It has no bullet.');
});

test('missingWords counts each word, and leaves out the note shape', () => {
  const text =
    '---\ntitle: Frontmatter words\n---\nLead.\n\n## Backlog\n\n- [x] **One.** Two two.\n';
  assert.deepEqual(missingWords(text, ['Lead.', 'One.\nTwo two.']), []);
  assert.deepEqual(missingWords(text, ['Lead.', 'One.\nTwo.']), ['two']);
  assert.deepEqual(missingWords(text, ['One.\nTwo two.']), ['Lead']);
});

// A vault in memory, as much of the API as the script calls.
const fakeVault = ({queue, archive, open, closed = []}) => {
  const notes = new Map();
  const real = new Map([['projects/p/queue.md', queue]]);
  if (archive !== undefined) real.set('projects/p/queue-archive.md', archive);
  const moved = [];
  const old = {};
  const call = async (method, url, {json} = {}) => {
    if (method === 'GET' && url === '/queue/projects/p') return Response.json({items: open});
    if (method === 'GET' && url === '/queue/projects/p/archive') {
      return Response.json({items: closed});
    }
    if (method === 'POST' && url === '/notes/query') {
      const prefix = `${json.folder}/`;
      const items = [...notes]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, note]) => ({path, record_id: path, ...note}));
      return Response.json({items});
    }
    if (method === 'GET' && url.startsWith('/sections?')) {
      const path = decodeURIComponent(url.match(/file_path=([^&]+)/)[1]);
      return Response.json({items: [{record_id: path, file_path: path}]});
    }
    if (method === 'GET' && url.startsWith('/sections/')) {
      return Response.json({
        frontmatter: {title: 'Carried', tags: ['t'], trackers: ['x'], agent: {}}
      });
    }
    if (method === 'PATCH') {
      const id = url.match(/^\/sections\/(.+)\/fm$/)[1];
      const note = notes.get(id) ?? (old[id] ??= {frontmatter: {}});
      for (const {op, path, value} of json.ops) {
        if (op === 'set') note.frontmatter[path.slice(1)] = value;
        else delete note.frontmatter[path.slice(1)];
      }
      return Response.json({});
    }
    if (method === 'POST' && url === '/vault/edit') {
      notes.get(json.path).body += json.text;
      return Response.json({});
    }
    if (method === 'POST' && url === '/vault/move') {
      moved.push(json);
      if (real.has(json.from)) real.delete(json.from);
      else {
        notes.set(json.to, notes.get(json.from));
        notes.delete(json.from);
      }
      return Response.json({});
    }
    const path = url.slice('/vault/'.length);
    if (method === 'PUT') {
      notes.set(path, {frontmatter: json.frontmatter, body: json.body});
      return Response.json({});
    }
    if (real.has(path)) {
      return new Response(real.get(path), {headers: {etag: `"${path}"`}});
    }
    if (notes.has(path.replace(/\.md$/, '/_about.md'))) {
      return new Response('composed', {
        headers: {etag: '"composed"', 'x-program-clerk-composed': 'true'}
      });
    }
    return new Response('', {status: 404});
  };
  return {call, notes, moved, old};
};

test('convert keeps closed items, and the text outside them, in queue-archive/', async () => {
  const queue = '- **One.** Text.\n';
  const archive =
    'Closed.\n\n## 2026-08-06\n\n- **Two.** Done.\n\n## 2026-08-20\n\n**Entry.** Prose.\n';
  const vault = fakeVault({
    queue,
    archive,
    open: [{title: 'One.', section: 'backlog', source_line: 1, body: 'Text.', blocked_by: []}],
    closed: [{title: 'Two.', source_line: 5, body: 'Done.', closed_at: '2026-08-06'}]
  });
  const result = await convertQueue('p', {}, vault.call);
  assert.equal(result.lostWords, 0);
  assert.equal(vault.notes.get('projects/p/queue-archive/two.md').frontmatter.status, 'archived');
  assert.equal(
    vault.notes.get('projects/p/queue-archive/_lead.md').body,
    'Closed.\n\n## 2026-08-20\n\n**Entry.** Prose.\n'
  );
  assert.deepEqual(vault.notes.get('projects/p/queue-archive/_about.md').frontmatter, {
    title: 'Carried',
    tags: ['t'],
    trackers: ['x'],
    type: 'meta',
    status: 'active'
  });
  assert.deepEqual(
    vault.moved.map(m => m.from),
    ['projects/p/queue.md', 'projects/p/queue-archive.md']
  );
  assert.equal(vault.old['projects/p/queue.md'].frontmatter.status, 'superseded');
  assert.equal(vault.old['projects/p/queue-archive.md'].frontmatter.status, 'superseded');
});

test('convert gives a project with no archive note its folder note all the same', async () => {
  const vault = fakeVault({
    queue: '- **One.** Text.\n',
    open: [{title: 'One.', section: 'backlog', source_line: 1, body: 'Text.', blocked_by: []}]
  });
  const result = await convertQueue('p', {}, vault.call);
  assert.equal(result.archivedTo, null);
  assert.equal(vault.notes.get('projects/p/queue-archive/_about.md').frontmatter.tags[1], 'queue');
});

test('convert runs again over its own folder note where no archive note ever was', async () => {
  const vault = fakeVault({
    queue: '- **One.** Text.\n',
    open: [{title: 'One.', section: 'backlog', source_line: 1, body: 'Text.', blocked_by: []}]
  });
  vault.notes.set('projects/p/queue-archive/_about.md', {
    frontmatter: {},
    body: 'From a first run.\n'
  });
  const result = await convertQueue('p', {}, vault.call);
  assert.equal(result.archivedTo, null);
  assert.equal(vault.notes.get('projects/p/queue-archive/_about.md').frontmatter.tags[1], 'queue');
});

test('convert refuses to lose text the parse and the lead do not hold', async () => {
  const vault = fakeVault({
    queue: '- **One.** Text.\n',
    open: [{title: 'One.', section: 'backlog', source_line: 1, body: '', blocked_by: []}]
  });
  await assert.rejects(convertQueue('p', {}, vault.call), /would lose 1 words: Text/);
  assert.equal(vault.notes.size, 0, 'nothing written');
});

test('archive closes an item last in queue-archive/', async () => {
  const vault = fakeVault({queue: '', open: []});
  vault.notes.set('projects/p/queue/one.md', {
    frontmatter: {title: 'One.', section: 'active', status: 'active', sequence_key: 2},
    body: 'Text.\n'
  });
  vault.notes.set('projects/p/queue-archive/_about.md', {frontmatter: {}, body: 'A folder.\n'});
  vault.notes.set('projects/p/queue-archive/old.md', {
    frontmatter: {title: 'Old.', sequence_key: 7},
    body: 'Old.\n'
  });
  const {path} = await archiveItem('p', 'One.', {reason: 'shipped', trail: 'D1.'}, vault.call);
  assert.equal(path, 'projects/p/queue-archive/one.md');
  const closed = vault.notes.get(path);
  assert.equal(closed.frontmatter.sequence_key, 8);
  assert.equal(closed.frontmatter.status, 'archived');
  assert.equal(closed.frontmatter.section, undefined);
  assert.match(closed.body, /\*\*Shipped\*\* \d{4}-\d{2}-\d{2}\. D1\.\n$/);
});

test('owed places a Backlog item filed since, and no item the conversion itself wrote', async () => {
  const vault = fakeVault({queue: '', open: []});
  const item = (section, created) => ({
    frontmatter: {title: `${section} ${created}`, section, created},
    body: 'Text.\n'
  });
  vault.notes.set('projects/p/queue/_about.md', {
    frontmatter: {created: '2026-11-01'},
    body: 'A.\n'
  });
  vault.notes.set('projects/p/queue/moved.md', item('backlog', '2026-11-01'));
  vault.notes.set('projects/p/queue/old.md', item('backlog', '2026-11-02'));
  vault.notes.set('projects/p/queue/new.md', item('backlog', '2026-11-20'));
  vault.notes.set('projects/p/queue/watch.md', item('watching', '2026-11-20'));
  vault.notes.set('projects/p/queue/in.md', item('inbox', '2026-11-02'));
  const owed = await owedItems('p', '2026-11-10T12:00:00Z', vault.call);
  assert.deepEqual(
    owed.map(i => [i.kind, i.title]),
    [
      ['triage', 'inbox 2026-11-02'],
      ['place', 'backlog 2026-11-20']
    ]
  );
  const early = await owedItems('p', '2026-10-01T00:00:00Z', vault.call);
  assert.deepEqual(
    early.filter(i => i.kind === 'place').map(i => i.title),
    ['backlog 2026-11-02', 'backlog 2026-11-20'],
    'a session before the conversion is owed only what was filed after it'
  );
});

test('the script runs by its path, as the vault skill calls it', () => {
  assert.ok(statSync(new URL('./queue-items.mjs', import.meta.url)).mode & 0o100);
});
