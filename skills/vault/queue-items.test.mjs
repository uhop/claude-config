// The pure layer of queue-items.mjs. Run: node --test skills/vault/queue-items.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_RE,
  archiveItem,
  fileItem,
  listFleet,
  listItems,
  openNotes,
  openFields,
  slugOf,
  uniqueName,
  trackersOf
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

test('fleet lists the projects kept as item notes, in the order the convention gives', async () => {
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
    assert.fail(`unexpected call ${url}`);
  };
  const titles = items => items.map(i => `${i.project} ${i.title}`);
  assert.deepEqual(titles(await listFleet({}, call)), [
    'new new to triage',
    'new now',
    'new boosted',
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

test('a source names a tracker and its ticket, in each form the skills prescribe', () => {
  for (const source of [
    'github uhop/deep6#123',
    'github denoland/deno#37090',
    'github uhop/stream.json_x#1',
    'github uhop/deep6 discussion#7',
    'github uhop/deep6 GHSA-528h-abcd-9xyz',
    'linear ENG-123',
    'jira VS-7'
  ]) {
    assert.ok(SOURCE_RE.test(source), source);
  }
});

test('a source refuses provenance text and an incomplete ticket', () => {
  for (const source of [
    'blog 2026-11-02 size-bound pass',
    'apodict arc 2b, 2026-11-02',
    'apodict 2026-11-02 declines',
    'apodict L 2026-11-02 walks',
    'apodict declines',
    'github',
    'github uhop/deep6',
    'github deep6#1',
    'github uhop/deep6#0',
    'github uhop/deep6 #1',
    'github uhop/deep6 discussion',
    'github uhop/deep6 GHSA-528h',
    'linear eng-123',
    'jira VS',
    'gitlab uhop/deep6#1'
  ]) {
    assert.equal(SOURCE_RE.test(source), false, source);
  }
});

test('file refuses a source that names no ticket and writes nothing', async () => {
  const fake = fakeVault({queue: '', open: []});
  const vault = {
    ...fake,
    call: async (method, url, options) =>
      url === '/resolve'
        ? Response.json({items: [{file_path: 'projects/p/queue/_about.md'}]})
        : fake.call(method, url, options)
  };
  await assert.rejects(
    fileItem(
      'p',
      {title: 'New.', body: 'Text.', source: 'blog 2026-11-02 size-bound pass'},
      vault.call
    ),
    RangeError
  );
  assert.equal(vault.notes.size, 0);
});

test('file replaces the open item with the same ticket, under a new title', async () => {
  const fake = fakeVault({queue: '', open: []});
  const vault = {
    ...fake,
    call: async (method, url, options) =>
      url === '/resolve'
        ? Response.json({items: [{file_path: 'projects/p/queue/_about.md'}]})
        : fake.call(method, url, options)
  };
  const source = 'github uhop/deep6#123';
  const {path} = await fileItem('p', {title: 'Old.', body: 'Text.', source}, vault.call);
  const again = await fileItem('p', {title: 'Renamed.', body: 'More.', source}, vault.call);
  assert.deepEqual(again, {path, replaced: true});
  assert.equal(vault.notes.get(path).frontmatter.title, 'Renamed.');
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

test('file starts a queue for a project with none, and refuses a real queue.md', async () => {
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
  assert.ok(vault.notes.has('projects/p/queue/second.md'), 'the folder takes it');
  answer = 'projects/p/queue.md';
  await assert.rejects(fileItem('p', {title: 'Third.', body: 'Text.'}, call), /one note/);
  assert.ok(!vault.notes.has('projects/p/queue/third.md'), 'nothing written');
});

test('trackersOf asks for the folder note alone and reads its declaration', async () => {
  const about = {
    path: 'projects/p/queue/_about.md',
    frontmatter: {type: 'meta', trackers: [{kind: 'github', ref: 'o/r', role: 'secondary'}]}
  };
  const lead = {path: 'projects/p/queue/_lead.md', frontmatter: {type: 'meta'}};
  const asked = [];
  const call = async (method, url, {json} = {}) => {
    asked.push({url, match: json.match});
    return Response.json({items: [about, lead]});
  };
  const view = await trackersOf('p', call);
  assert.equal(view.declared, true);
  assert.equal(view.trackers.find(t => t.kind === 'github').ref, 'o/r');
  assert.deepEqual(asked, [{url: '/notes/query', match: {type: 'meta'}}]);
});
