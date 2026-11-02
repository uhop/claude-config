#!/usr/bin/env node
// A project's queue kept one item to a note (vault-storage 11d-1): the skill defines the folder, the
// fields, and what archiving does, and the server only stores and queries them. An open item is
// projects/<p>/queue/<slug>.md with `section` and `sequence_key`, and `priority`, `source`, and
// `blocked_by` when set; a closed one is projects/<p>/queue-archive/<slug>.md, `status: archived`,
// with `closed_at` and `close_reason`. Each folder composes at its old path, so links to `queue.md`
// and `queue-archive.md` keep working. `list` reads both shapes while the fleet is mixed.
//
//   queue-items.mjs list <project> [--section S] [--json]
//   queue-items.mjs file <project> --title T [--section S] [--priority N] [--source S]
//                        [--blocked-by B] (--body B | --body-file F)
//   queue-items.mjs move <project> <title or slug> --section S [--priority N]
//   queue-items.mjs archive <project> <title or slug> --reason R [--trail T]
//   queue-items.mjs owed <project> --since ISO
//   queue-items.mjs convert <project> [--dry-run]

import {readFileSync} from 'node:fs';
import {vaultSettings} from './vault-settings.mjs';

export const SECTIONS = ['inbox', 'active', 'backlog', 'watching'];
export const CLOSE_REASONS = ['shipped', 'rejected', 'parked', 'deferred'];
const SPECIAL = new Set(['_about.md', '_lead.md']);
const PAGE = 500;
const SLUG_MAX = 80;

/** A title as a file-name stem, as the server names a section's piece. */
export const slugOf = title => {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length <= SLUG_MAX) return slug || 'item';
  const cut = slug.slice(0, SLUG_MAX);
  const dash = cut.lastIndexOf('-');
  return dash > 0 ? cut.slice(0, dash) : cut;
};

/** The first of `slug`, `slug-2`, … not in `taken`, added to it. */
export const uniqueName = (slug, taken) => {
  let name = `${slug}.md`;
  for (let n = 2; taken.has(name); ++n) name = `${slug}-${n}.md`;
  taken.add(name);
  return name;
};

const STRUCTURE_RE =
  /^(?:##\s+(?:inbox|active|backlog|watching)\s*|###\s+priority\s+[-+]?\d+\s*|\(empty\)\s*)$/i;
const DATE_HEADING_RE = /^##\s+\d{4}-\d{2}-\d{2}\s*$/;
const CHECKBOX_RE = /^\s*[-*+]\s+\[[ x]\]\s/i;

const bodyStart = lines => {
  if (lines[0] !== '---') return 0;
  const end = lines.indexOf('---', 1);
  return end > 0 ? end + 1 : 0;
};

/**
 * What a queue note's text holds outside its items: each item runs from its `source_line` (1-based,
 * counted in the whole file) to the next column-0 bullet or heading, fences masked, and the
 * section headings and `(empty)` placeholders are the shape the fields replace, as is a date heading
 * with nothing left under it, which `closed_at` holds.
 */
export const remainderOf = (text, sourceLines) => {
  const lines = text.split('\n');
  const start = bodyStart(lines);
  const starts = new Set(sourceLines.map(n => n - 1));
  const kept = [];
  let inItem = false;
  let fenced = false;
  for (let i = start; i < lines.length; ++i) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)/.test(line);
    if (starts.has(i)) inItem = true;
    else if (!fenced && (/^- /.test(line) || /^#{1,6} /.test(line))) inItem = false;
    if (fence) fenced = !fenced;
    if (!inItem && !STRUCTURE_RE.test(line)) kept.push(line);
  }
  return kept
    .filter((line, i) => {
      if (!DATE_HEADING_RE.test(line)) return true;
      let next = i + 1;
      while (next < kept.length && !kept[next].trim()) ++next;
      return next < kept.length && !/^#{1,2} /.test(kept[next]);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const wordsOf = text => text.match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * The words of a note's body that `kept`, the texts written in its place, do not hold, each word
 * counted: counts and titles cannot show text a conversion would lose. The note's shape is left out.
 */
export const missingWords = (text, kept) => {
  const have = new Map();
  for (const word of wordsOf(kept.join('\n'))) have.set(word, (have.get(word) ?? 0) + 1);
  const lines = text.split('\n');
  const missing = [];
  for (const line of lines.slice(bodyStart(lines))) {
    if (STRUCTURE_RE.test(line) || DATE_HEADING_RE.test(line)) continue;
    for (const word of wordsOf(line.replace(CHECKBOX_RE, ''))) {
      const left = have.get(word) ?? 0;
      if (left === 0) missing.push(word);
      else have.set(word, left - 1);
    }
  }
  return missing;
};

/** An open item's frontmatter: the fields a reader wants, the optional ones only when set. */
export const openFields = ({
  title,
  section,
  sequence,
  priority = 0,
  source = null,
  blockedBy = []
}) => ({
  title,
  type: 'queue-item',
  status: 'active',
  section,
  sequence_key: sequence,
  ...(priority ? {priority} : {}),
  ...(source ? {source} : {}),
  ...(blockedBy.length > 0 ? {blocked_by: blockedBy} : {})
});

const today = () => new Date().toISOString().slice(0, 10);

const client = () => {
  const {base, token, problem} = vaultSettings();
  if (problem) throw new Error(problem);
  return async (method, path, {json, headers = {}} = {}) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json === undefined ? {} : {'Content-Type': 'application/json'}),
        ...headers
      },
      ...(json === undefined ? {} : {body: JSON.stringify(json)})
    });
    return r;
  };
};

const expectJson = async (r, what) => {
  const text = await r.text();
  if (!r.ok) throw new Error(`${what}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

const folderOf = project => `projects/${project}/queue`;
const closedFolderOf = project => `projects/${project}/queue-archive`;

/**
 * Whether the project's queue is a folder of item notes yet. The path decides, since an older split
 * folder with its own `_about.md` can sit beside a real `queue.md`, which then takes the path.
 */
export const isConverted = async (project, call = client()) => {
  const {items} = await expectJson(
    await call('POST', '/resolve', {json: {wikilinks: [`projects/${project}/queue.md`]}}),
    `resolve the queue of ${project}`
  );
  return items[0].file_path === `${folderOf(project)}/_about.md`;
};

const queryAll = async (call, folder, match) => {
  const items = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await expectJson(
      await call('POST', '/notes/query', {
        json: {folder, sort: 'sequence_key', limit: PAGE, offset, ...(match ? {match} : {})}
      }),
      `query ${folder}`
    );
    items.push(...page.items);
    if (page.items.length < PAGE) return items;
  }
};

const itemNotes = async (call, folder, match) =>
  (await queryAll(call, folder, match)).filter(
    n => !SPECIAL.has(n.path.slice(n.path.lastIndexOf('/') + 1))
  );

const openNotes = (call, project, match) => itemNotes(call, folderOf(project), match);

const shaped = n => ({
  title: n.frontmatter.title ?? n.title,
  section: n.frontmatter.section ?? null,
  priority: n.frontmatter.priority ?? 0,
  source: n.frontmatter.source ?? null,
  blocked_by: n.frontmatter.blocked_by ?? [],
  path: n.path
});

/** The project's open items in order, from either shape. */
export const listItems = async (project, {section} = {}, call = client()) => {
  if (await isConverted(project, call)) {
    return (await openNotes(call, project, section ? {section} : undefined)).map(shaped);
  }
  const {items} = await expectJson(
    await call('GET', `/queue/projects/${encodeURIComponent(project)}`),
    `queue of ${project}`
  );
  return items
    .filter(i => !section || i.section === section)
    .map(i => ({
      title: i.title,
      section: i.section,
      priority: i.priority,
      source: i.source,
      blocked_by: i.blocked_by,
      path: null
    }));
};

const findNote = async (call, project, ref) => {
  const notes = await openNotes(call, project);
  const hits = notes.filter(
    n =>
      (n.frontmatter.title ?? n.title) === ref ||
      n.path.endsWith(`/${ref}`) ||
      n.path.endsWith(`/${ref}.md`)
  );
  if (hits.length !== 1) {
    throw new Error(`${hits.length} open items of ${project} match "${ref}"`);
  }
  return hits[0];
};

/**
 * Files an item on a converted queue. An open item with the same source or the same title is
 * replaced where it stands, so a repeated call files nothing twice. Answers its path and what it did.
 */
export const fileItem = async (
  project,
  {title, section = 'backlog', priority = 0, source = null, blockedBy = [], body},
  call = client()
) => {
  if (!SECTIONS.includes(section)) throw new Error(`--section is one of ${SECTIONS.join(', ')}`);
  if (!title || !body?.trim()) throw new Error('an item needs a title and a body');
  const notes = await openNotes(call, project);
  const same = notes.find(
    n => (source && n.frontmatter.source === source) || (n.frontmatter.title ?? n.title) === title
  );
  const folder = folderOf(project);
  const sequence = same
    ? same.frontmatter.sequence_key
    : Math.max(0, ...notes.map(n => n.frontmatter.sequence_key ?? 0)) + 1;
  const path =
    same?.path ??
    `${folder}/${uniqueName(slugOf(title), new Set(notes.map(n => n.path.slice(folder.length + 1))))}`;
  const r = await call('PUT', `/vault/${path}`, {
    json: {
      frontmatter: openFields({title, section, sequence, priority, source, blockedBy}),
      body: `${body.trim()}\n`
    }
  });
  await expectJson(r, `write ${path}`);
  return {path, replaced: same !== undefined};
};

const patchScalars = async (call, recordId, fields) => {
  const ops = Object.entries(fields).map(([key, value]) =>
    value === null ? {op: 'remove', path: `/${key}`} : {op: 'set', path: `/${key}`, value}
  );
  await expectJson(
    await call('PATCH', `/sections/${recordId}/fm`, {json: {ops}}),
    `patch ${recordId}`
  );
};

/** Moves an open item to another section. */
export const moveItem = async (project, ref, {section, priority}, call = client()) => {
  if (!SECTIONS.includes(section)) throw new Error(`--section is one of ${SECTIONS.join(', ')}`);
  const note = await findNote(call, project, ref);
  await patchScalars(call, note.record_id, {
    section,
    ...(priority === undefined ? {} : {priority: priority === 0 ? null : priority})
  });
  return {path: note.path, section};
};

/** Closes an open item: its trail appended, its fields set, and the note moved to the archive. */
export const archiveItem = async (project, ref, {reason, trail}, call = client()) => {
  if (!CLOSE_REASONS.includes(reason)) {
    throw new Error(`--reason is one of ${CLOSE_REASONS.join(', ')}`);
  }
  const note = await findNote(call, project, ref);
  const date = today();
  const name = reason[0].toUpperCase() + reason.slice(1);
  await expectJson(
    await call('POST', '/vault/edit', {
      json: {
        path: note.path,
        op: 'append',
        text: `**${name}** ${date}.${trail ? ` ${trail}` : ''}\n`
      }
    }),
    `trail on ${note.path}`
  );
  const folder = closedFolderOf(project);
  const closed = await itemNotes(call, folder);
  await patchScalars(call, note.record_id, {
    status: 'archived',
    closed_at: date,
    close_reason: reason,
    section: null,
    sequence_key: Math.max(0, ...closed.map(n => n.frontmatter.sequence_key ?? 0)) + 1
  });
  const taken = new Set(closed.map(n => n.path.slice(folder.length + 1)));
  const to = `${folder}/${uniqueName(slugOf(note.frontmatter.title ?? note.title), taken)}`;
  await expectJson(
    await call('POST', '/vault/move', {json: {from: note.path, to}}),
    `move ${note.path}`
  );
  return {path: to};
};

/**
 * What a resume owes for a converted queue, which the server's `owed` cannot see: Inbox items to
 * triage, items that entered the Backlog since `since`, and items mirroring a ticket, to read
 * upstream.
 */
export const owedItems = async (project, since, call = client()) => {
  const notes = (await openNotes(call, project)).map(shaped);
  const changes = await expectJson(
    await call(
      'GET',
      `/projects/${encodeURIComponent(project)}/changes?since=${encodeURIComponent(since)}`
    ),
    `changes of ${project}`
  );
  const created = new Set((changes.notes ?? []).filter(n => n.changed?.created).map(n => n.path));
  return [
    ...notes.filter(i => i.section === 'inbox').map(i => ({kind: 'triage', ...i})),
    ...notes
      .filter(i => i.section === 'backlog' && created.has(i.path))
      .map(i => ({kind: 'place', ...i})),
    ...notes.filter(i => i.source).map(i => ({kind: 'upstream', ...i}))
  ];
};

const CARRIED = ['title', 'tags', 'related', 'edges', 'trackers', 'key'];

const carriedFields = async (call, path) => {
  const record = await expectJson(
    await call('GET', `/sections?file_path=${encodeURIComponent(path)}&fields=record_id,file_path`),
    `the record of ${path}`
  );
  const {frontmatter} = await expectJson(
    await call('GET', `/sections/${record.items[0].record_id}/fm?exclude=body`),
    `the frontmatter of ${path}`
  );
  return Object.fromEntries(
    CARRIED.filter(k => frontmatter[k] !== undefined).map(k => [k, frontmatter[k]])
  );
};

// A note cannot be empty, and an item with no text past its title has the title to say.
const itemText = item => `${item.body.trim() || item.title}\n`;
const writtenText = ({frontmatter, body}) => `${frontmatter.title}\n${body}`;

const archiveSlot = async (call, project, name) => {
  const year = new Date().getUTCFullYear();
  const dir = `projects/${project}/archive/${year}`;
  const plain = `${dir}/${name}.md`;
  const r = await call('GET', `/vault/${plain}`);
  await r.text();
  return r.status === 404 ? plain : `${dir}/${name}-${today()}.md`;
};

// A note's text, or none where it has no note.
const readNote = async (call, path) => {
  const r = await call('GET', `/vault/${path}`);
  const text = await r.text();
  if (r.status === 404) return {text: '', etag: null, exists: false};
  if (!r.ok) throw new Error(`read ${path}: ${r.status} ${text.slice(0, 300)}`);
  return {text, etag: r.headers.get('etag'), exists: true};
};

const titlesMatch = (notes, items) => {
  const have = notes.map(n => n.frontmatter.title).sort();
  const want = items.map(i => i.title).sort();
  return have.length === want.length && have.every((t, i) => t === want[i]);
};

/**
 * Moves a project's queue and archive to item notes from the server's own parse: every item written,
 * every word of the old notes accounted for, counts and titles compared, and only then the old notes
 * moved to the archive with their record ids. A failure before the move leaves the queue as it was,
 * and a run again writes the same paths.
 */
export const convertQueue = async (project, {dryRun = false} = {}, call = client()) => {
  const queuePath = `projects/${project}/queue.md`;
  const archivePath = `projects/${project}/queue-archive.md`;
  const folder = folderOf(project);
  const closedFolder = closedFolderOf(project);
  const read = await call('GET', `/vault/${queuePath}`);
  if (!read.ok) throw new Error(`read ${queuePath}: ${read.status}`);
  if (read.headers.get('x-program-clerk-composed')) {
    await read.text();
    return {project, already: true};
  }
  const etag = read.headers.get('etag');
  const text = await read.text();
  const older = (await openNotes(call, project)).filter(n => n.frontmatter.section == null);
  if (older.length > 0) {
    throw new Error(
      `${older.length} older note(s) in ${folder}/ beside a real queue.md: merge them first`
    );
  }
  const {items: open} = await expectJson(
    await call('GET', `/queue/projects/${encodeURIComponent(project)}`),
    'open items'
  );
  const {items: closed} = await expectJson(
    await call('GET', `/queue/projects/${encodeURIComponent(project)}/archive`),
    'archived items'
  );
  const lines = text.split('\n');
  for (const item of open) {
    if (!lines[item.source_line - 1]?.startsWith('- ')) {
      throw new Error(`line ${item.source_line} of ${queuePath} is not the item "${item.title}"`);
    }
  }
  const lead = remainderOf(
    text,
    open.map(i => i.source_line)
  );
  const taken = new Set(SPECIAL);
  const writes = open.map((item, i) => ({
    path: `${folder}/${uniqueName(slugOf(item.title), taken)}`,
    frontmatter: openFields({
      title: item.title,
      section: item.section,
      sequence: i + 1,
      priority: item.priority,
      source: item.source,
      blockedBy: item.blocked_by
    }),
    body: itemText(item)
  }));
  const archive = await readNote(call, archivePath);
  const closedLead = remainderOf(
    archive.text,
    closed.map(i => i.source_line)
  );
  const lost = [
    ...missingWords(text, [...writes.map(writtenText), lead]),
    ...missingWords(archive.text, [...closed.map(i => `${i.title}\n${itemText(i)}`), closedLead])
  ];
  const takenClosed = new Set(SPECIAL);
  const closedWrites = closed.map((item, i) => ({
    path: `${closedFolder}/${uniqueName(slugOf(item.title), takenClosed)}`,
    frontmatter: {
      title: item.title,
      type: 'queue-item',
      status: 'archived',
      sequence_key: i + 1,
      ...(item.closed_at ? {closed_at: item.closed_at} : {}),
      ...(item.close_reason ? {close_reason: item.close_reason} : {})
    },
    body: itemText(item)
  }));
  const plan = {
    project,
    open: open.length,
    closed: closed.length,
    leadBytes: lead.length,
    closedLeadBytes: closedLead.length,
    lostWords: lost.length
  };
  if (dryRun) return {...plan, dryRun: true, lost: lost.slice(0, 12), lead: lead.slice(0, 400)};
  if (lost.length > 0) {
    throw new Error(
      `the conversion would lose ${lost.length} words: ${lost.slice(0, 12).join(' ')}`
    );
  }

  const carried = await carriedFields(call, queuePath);
  const closedCarried = archive.exists
    ? await carriedFields(call, archivePath)
    : {title: `${project} — Queue Archive`, tags: [project, 'queue', 'archive']};
  for (const {path, frontmatter: fm, body} of [...writes, ...closedWrites]) {
    await expectJson(
      await call('PUT', `/vault/${path}`, {json: {frontmatter: fm, body}}),
      `write ${path}`
    );
  }
  for (const [dir, text, title] of [
    [folder, lead, `${project}: queue notes outside its items`],
    [closedFolder, closedLead, `${project}: archive notes outside its items`]
  ]) {
    if (!text) continue;
    await expectJson(
      await call('PUT', `/vault/${dir}/_lead.md`, {
        json: {frontmatter: {title, type: 'meta'}, body: `${text}\n`}
      }),
      `the lead of ${dir}`
    );
  }
  const wroteOpen = await openNotes(call, project);
  if (!titlesMatch(wroteOpen, open)) {
    throw new Error(`${wroteOpen.length} open notes read back against ${open.length} planned`);
  }
  const wroteClosed = await itemNotes(call, closedFolder);
  if (!titlesMatch(wroteClosed, closed)) {
    throw new Error(
      `${wroteClosed.length} archived notes read back against ${closed.length} planned`
    );
  }
  for (const [dir, fields, body] of [
    [
      folder,
      carried,
      `One note per queue item, read with \`queue-items.mjs list ${project}\` or by the frontmatter query; closed items are in \`queue-archive/\`. The vault skill says how to file, move, and archive one.\n`
    ],
    [
      closedFolder,
      closedCarried,
      'One note per closed queue item, read by the frontmatter query; open items are in `queue/`. The vault skill says how to close one.\n'
    ]
  ]) {
    await expectJson(
      await call('PUT', `/vault/${dir}/_about.md`, {
        json: {frontmatter: {...fields, type: 'meta', status: 'active'}, body}
      }),
      `the folder note of ${dir}`
    );
  }
  const again = await readNote(call, queuePath);
  const archiveAgain = await readNote(call, archivePath);
  if (again.etag !== etag || archiveAgain.etag !== archive.etag) {
    throw new Error(`${queuePath} or its archive changed during the conversion; run it again`);
  }
  const queueTo = await archiveSlot(call, project, 'queue');
  await expectJson(
    await call('POST', '/vault/move', {json: {from: queuePath, to: queueTo}}),
    "the queue note's move"
  );
  let archivedTo = null;
  if (archive.exists) {
    archivedTo = await archiveSlot(call, project, 'queue-archive');
    await expectJson(
      await call('POST', '/vault/move', {json: {from: archivePath, to: archivedTo}}),
      "the archive note's move"
    );
  }
  return {...plan, queueTo, archivedTo};
};

const parseArgs = argv => {
  const opts = {_: []};
  for (let i = 0; i < argv.length; ++i) {
    const a = argv[i];
    if (a === '--json' || a === '--dry-run') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else opts._.push(a);
  }
  return opts;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  const [command, project, ref] = opts._;
  if (!command || !project) {
    throw new Error('usage: queue-items.mjs list|file|move|archive|owed|convert <project> …');
  }
  const priority = opts.priority === undefined ? undefined : Number(opts.priority);
  const show = value => console.log(JSON.stringify(value, null, 2));
  switch (command) {
    case 'list': {
      const items = await listItems(project, {section: opts.section});
      if (opts.json) return show(items);
      for (const i of items) {
        console.log(`${i.section ?? '(no section)'}\t${i.priority}\t${i.title}`);
      }
      console.log(`${items.length} items`);
      return undefined;
    }
    case 'file':
      return show(
        await fileItem(project, {
          title: opts.title,
          section: opts.section,
          priority,
          source: opts.source ?? null,
          blockedBy: opts['blocked-by'] ? [opts['blocked-by']] : [],
          body: opts['body-file'] ? readFileSync(opts['body-file'], 'utf8') : opts.body
        })
      );
    case 'move':
      return show(await moveItem(project, ref, {section: opts.section, priority}));
    case 'archive':
      return show(await archiveItem(project, ref, {reason: opts.reason, trail: opts.trail}));
    case 'owed':
      if (!opts.since) throw new Error('owed needs --since ISO');
      return show(await owedItems(project, opts.since));
    case 'convert':
      return show(await convertQueue(project, {dryRun: opts['dry-run'] === true}));
    default:
      throw new Error(`unknown command: ${command}`);
  }
};

if (import.meta.main) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
