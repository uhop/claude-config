// The pure layer of queue-items.mjs. Run: node --test skills/vault/queue-items.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {
  archiveItem,
  convertQueue,
  fileItem,
  isConverted,
  listFleet,
  listItems,
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
    filed: '2026-09-30',
    priority: -1,
    source: 'github a/b#1',
    blockedBy: ['x']
  });
  assert.equal(all.filed, '2026-09-30');
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
        frontmatter: {title: 'Carried', tags: ['t'], trackers: ['x'], stalls: 'file', agent: {}}
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
    open: [
      {
        title: 'One.',
        section: 'backlog',
        source_line: 1,
        body: 'Text.',
        blocked_by: [],
        created_at: '2026-09-30T20:36:23.000Z'
      }
    ],
    closed: [
      {
        title: 'Two.',
        source_line: 5,
        body: 'Done.',
        closed_at: '2026-08-06',
        created_at: '2026-08-01T01:00:00.000Z'
      }
    ]
  });
  const result = await convertQueue('p', {}, vault.call);
  assert.equal(result.lostWords, 0);
  assert.equal(vault.notes.get('projects/p/queue/one.md').frontmatter.filed, '2026-09-30');
  assert.equal(vault.notes.get('projects/p/queue-archive/two.md').frontmatter.filed, '2026-08-01');
  assert.equal(vault.notes.get('projects/p/queue-archive/two.md').frontmatter.status, 'archived');
  assert.equal(
    vault.notes.get('projects/p/queue-archive/_lead.md').body,
    'Closed.\n\n## 2026-08-20\n\n**Entry.** Prose.\n'
  );
  assert.deepEqual(vault.notes.get('projects/p/queue-archive/_about.md').frontmatter, {
    title: 'Carried',
    tags: ['t'],
    trackers: ['x'],
    stalls: 'file',
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

test('owed places a Backlog item by the day it was filed, and never the stall item', async () => {
  const vault = fakeVault({queue: '', open: []});
  const item = (section, filed) => ({
    frontmatter: {title: `${section} ${filed}`, section, filed, created: '2026-11-01'},
    body: 'Text.\n'
  });
  vault.notes.set('projects/p/queue/_about.md', {
    frontmatter: {created: '2026-11-01'},
    body: 'A.\n'
  });
  vault.notes.set('projects/p/queue/older.md', item('backlog', '2026-01-05'));
  vault.notes.set('projects/p/queue/old.md', item('backlog', '2026-11-02'));
  vault.notes.set('projects/p/queue/new.md', item('backlog', '2026-11-20'));
  vault.notes.set('projects/p/queue/watch.md', item('watching', '2026-11-20'));
  vault.notes.set('projects/p/queue/in.md', item('inbox', '2026-11-02'));
  vault.notes.set('projects/p/queue/loop-stalls.md', {
    frontmatter: {
      title: 'Loop stalls recorded through 2026-11-20T00:00:00.000Z.',
      section: 'backlog',
      created: '2026-11-20'
    },
    body: 'Filed by the server.\n'
  });
  vault.notes.set('projects/p/queue/no-field.md', {
    frontmatter: {title: 'No field', section: 'backlog', created: '2026-11-21'},
    body: 'Text.\n'
  });
  const owed = await owedItems('p', '2026-11-10T12:00:00Z', vault.call);
  assert.deepEqual(
    owed.map(i => [i.kind, i.title]),
    [
      ['triage', 'inbox 2026-11-02'],
      ['place', 'backlog 2026-11-20'],
      ['place', 'No field']
    ]
  );
  assert.equal(owed[1].filed, '2026-11-20', 'an item says when it was filed');
  assert.equal(owed[2].filed, '2026-11-21', 'by its note where it has no field');
  const early = await owedItems('p', '2026-10-01T00:00:00Z', vault.call);
  assert.deepEqual(
    early.filter(i => i.kind === 'place').map(i => i.title),
    ['backlog 2026-11-02', 'backlog 2026-11-20', 'No field'],
    'a conversion moves an item, and files nothing'
  );
});

test('the script runs by its path, as the vault skill calls it', () => {
  assert.ok(statSync(new URL('./queue-items.mjs', import.meta.url)).mode & 0o100);
});

test('fleet lists every project, of either shape, in the order the convention gives', async () => {
  const item = (title, section, priority, sequence_key) => ({
    path: `projects/new/queue/${title}.md`,
    record_id: title,
    frontmatter: {title, section, sequence_key, ...(priority ? {priority} : {})}
  });
  const call = async (method, url, {json} = {}) => {
    if (url === '/vault/projects/')
      return Response.json({files: ['new/', 'old/', 'none/', 'a-file.md']});
    if (url === '/resolve') {
      assert.deepEqual(json.wikilinks, [
        'projects/new/queue.md',
        'projects/old/queue.md',
        'projects/none/queue.md'
      ]);
      return Response.json({
        items: [
          {file_path: 'projects/new/queue/_about.md'},
          {file_path: 'projects/old/queue.md'},
          {file_path: null}
        ]
      });
    }
    if (url === '/notes/query') {
      assert.equal(json.folder, 'projects/new/queue');
      return Response.json({
        items: [
          {path: 'projects/new/queue/_about.md', frontmatter: {}},
          item('demoted', 'backlog', -1, 1),
          item('now', 'active', 0, 2),
          item('boosted', 'backlog', 2, 3),
          item('waits', 'watching', 0, 4),
          item('new to triage', 'inbox', 0, 5)
        ]
      });
    }
    assert.equal(url, '/queue/projects/old');
    return Response.json({
      items: [{title: 'old one', section: 'backlog', priority: 0, source: null, blocked_by: []}]
    });
  };
  const titles = items => items.map(i => `${i.project} ${i.title}`);
  assert.deepEqual(titles(await listFleet({}, call)), [
    'new new to triage',
    'new now',
    'new boosted',
    'old old one',
    'new demoted',
    'new waits'
  ]);
  assert.deepEqual(titles(await listFleet({section: 'active'}, call)), ['new now']);
  assert.deepEqual(titles(await listFleet({priority: 2}, call)), ['new boosted']);
  assert.deepEqual(titles(await listFleet({limit: 1}, call)), ['new new to triage']);
});

test('file dates a new item, and a replaced one keeps its date', async () => {
  const fake = fakeVault({queue: '', open: []});
  const vault = {
    ...fake,
    call: async (method, url, options) =>
      url === '/resolve'
        ? Response.json({items: [{file_path: 'projects/p/queue/_about.md'}]})
        : fake.call(method, url, options)
  };
  const {path} = await fileItem('p', {title: 'New.', body: 'Text.'}, vault.call);
  assert.equal(vault.notes.get(path).frontmatter.filed, new Date().toISOString().slice(0, 10));
  vault.notes.get(path).frontmatter.filed = '2026-01-05';
  const again = await fileItem('p', {title: 'New.', body: 'More text.'}, vault.call);
  assert.equal(again.replaced, true);
  assert.equal(vault.notes.get(path).frontmatter.filed, '2026-01-05');
  assert.equal(vault.notes.get(path).body, 'More text.\n');
});

test('list reads in the same order after items move', async () => {
  const vault = fakeVault({queue: '', open: []});
  const note = (section, priority, sequence_key) => ({
    frontmatter: {title: `${section} ${priority}`, section, priority, sequence_key},
    body: 'Text.\n'
  });
  vault.notes.set('projects/p/queue/_about.md', {frontmatter: {}, body: 'A.\n'});
  vault.notes.set('projects/p/queue/a.md', note('watching', 0, 1));
  vault.notes.set('projects/p/queue/b.md', note('backlog', -1, 2));
  vault.notes.set('projects/p/queue/c.md', note('backlog', 1, 3));
  vault.notes.set('projects/p/queue/d.md', note('active', 0, 4));
  const call = async (method, url, options) =>
    url === '/resolve'
      ? Response.json({items: [{file_path: 'projects/p/queue/_about.md'}]})
      : vault.call(method, url, options);
  assert.deepEqual(
    (await listItems('p', {}, call)).map(i => i.title),
    ['active 0', 'backlog 1', 'backlog -1', 'watching 0']
  );
});

test('file starts a queue for a project with none, and refuses one still kept as one note', async () => {
  const vault = fakeVault({queue: '', open: []});
  let answer = null;
  const call = async (method, url, options) =>
    url === '/resolve'
      ? Response.json({items: [{file_path: answer}]})
      : vault.call(method, url, options);
  const {path} = await fileItem('p', {title: 'First.', body: 'Text.'}, call);
  assert.equal(path, 'projects/p/queue/first.md');
  assert.equal(vault.notes.get('projects/p/queue/_about.md').frontmatter.title, 'p — Queue');
  assert.equal(
    vault.notes.get('projects/p/queue-archive/_about.md').frontmatter.title,
    'p — Queue Archive'
  );
  answer = 'projects/p/queue/_about.md';
  await fileItem('p', {title: 'Second.', body: 'Text.'}, call);
  assert.ok(vault.notes.has('projects/p/queue/second.md'), 'a converted queue takes it');
  answer = 'projects/p/queue.md';
  await assert.rejects(fileItem('p', {title: 'Third.', body: 'Text.'}, call), /convert/);
  assert.ok(!vault.notes.has('projects/p/queue/third.md'), 'nothing written');
});
