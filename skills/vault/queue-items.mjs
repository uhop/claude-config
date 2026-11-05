#!/usr/bin/env node
// A project's queue kept one item to a note (vault-storage 11d-1): the skill defines the folder, the
// fields, and what archiving does, and the server only stores and queries them. An open item is
// projects/<p>/queue/<slug>.md with `section`, `sequence_key`, and `filed`, the day it entered the
// queue, and `priority`, `source`, and `blocked_by` when set; a closed one is projects/<p>/queue-archive/<slug>.md, `status: archived`,
// with `closed_at` and `close_reason`. Each folder composes at its old path, so links to `queue.md`
// and `queue-archive.md` keep working.
//
//   queue-items.mjs list <project> [--section S] [--json]
//   queue-items.mjs fleet [--section S] [--priority N] [--limit N] [--json]
//   queue-items.mjs file <project> --title T [--section S] [--priority N] [--source S]
//                        [--blocked-by B] (--body B | --body-file F)
//   queue-items.mjs move <project> <title or slug> --section S [--priority N]
//   queue-items.mjs archive <project> <title or slug> --reason R [--trail T]
//   queue-items.mjs trackers <project> [--json]

import {readFileSync} from 'node:fs';
import {readTrackers, trackerLine} from './trackers.mjs';
import {vaultSettings} from './vault-settings.mjs';

export const SECTIONS = ['inbox', 'active', 'backlog', 'watching'];
export const CLOSE_REASONS = ['shipped', 'rejected', 'parked', 'deferred'];
// A resume reads a source as a ticket to check, and `file` replaces the open item that holds it.
export const SOURCE_RE =
  /^(?:github [\w.-]+\/[\w.-]+(?:#[1-9]\d*| discussion#[1-9]\d*| GHSA-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})|(?:linear|jira) [A-Z][A-Z0-9]{1,9}-[1-9]\d*)$/;
export const SOURCE_HELP =
  "--source names a ticket: 'github owner/repo#15', 'github owner/repo discussion#15', 'github owner/repo GHSA-xxxx-xxxx-xxxx', 'linear ENG-123', or 'jira VS-7'; where an item came from goes in its body";
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

/** An open item's frontmatter: the fields a reader wants, the optional ones only when set. */
export const openFields = ({
  title,
  section,
  sequence,
  filed = null,
  priority = 0,
  source = null,
  blockedBy = []
}) => ({
  title,
  type: 'queue-item',
  status: 'active',
  section,
  sequence_key: sequence,
  ...(filed ? {filed} : {}),
  ...(priority ? {priority} : {}),
  ...(source ? {source} : {}),
  ...(blockedBy.length > 0 ? {blocked_by: blockedBy} : {})
});

const today = () => new Date().toISOString().slice(0, 10);

export const client = () => {
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

export const expectJson = async (r, what) => {
  const text = await r.text();
  if (!r.ok) throw new Error(`${what}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

const folderOf = project => `projects/${project}/queue`;
const closedFolderOf = project => `projects/${project}/queue-archive`;

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

const isItem = n => !SPECIAL.has(n.path.slice(n.path.lastIndexOf('/') + 1));

const itemNotes = async (call, folder, match) =>
  (await queryAll(call, folder, match)).filter(isItem);

export const openNotes = (call, project, match) => itemNotes(call, folderOf(project), match);

const declarationIn = (project, notes) =>
  readTrackers(
    project,
    notes.find(n => n.path === `${folderOf(project)}/_about.md`)?.frontmatter.trackers
  );

/** The open notes and the tracker declaration, from the one query a resume makes. */
export const queueOf = async (call, project) => {
  const notes = await queryAll(call, folderOf(project));
  return {notes: notes.filter(isItem), trackers: declarationIn(project, notes)};
};

/** A project's tracker declaration, validated; `type: meta` leaves the items out of the query. */
export const trackersOf = async (project, call = client()) =>
  declarationIn(project, await queryAll(call, folderOf(project), {type: 'meta'}));

const shaped = n => ({
  title: n.frontmatter.title ?? n.title,
  section: n.frontmatter.section ?? null,
  priority: n.frontmatter.priority ?? 0,
  source: n.frontmatter.source ?? null,
  blocked_by: n.frontmatter.blocked_by ?? [],
  filed: n.frontmatter.filed ?? n.frontmatter.created ?? null,
  path: n.path
});

// The convention's order: by section, then the higher priority first; a sort keeps the order within.
const inOrder = items =>
  items.sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || b.priority - a.priority
  );

/** Open notes as a listing shows them, in order. */
export const itemsFrom = notes => inOrder(notes.map(shaped));

/** The project's open items in order. */
export const listItems = async (project, {section} = {}, call = client()) =>
  itemsFrom(await openNotes(call, project, section ? {section} : undefined));

/** Every project's open items, in the convention's order. */
export const listFleet = async ({section, priority, limit} = {}, call = client()) => {
  const {files} = await expectJson(await call('GET', '/vault/projects/'), 'the projects');
  const names = files.filter(f => f.endsWith('/')).map(f => f.slice(0, -1));
  const {items: resolved} = await expectJson(
    await call('POST', '/resolve', {json: {wikilinks: names.map(n => `projects/${n}/queue.md`)}}),
    'the queues'
  );
  const all = [];
  for (const [i, project] of names.entries()) {
    if (resolved[i].file_path !== `${folderOf(project)}/_about.md`) continue;
    const items = (await openNotes(call, project)).map(shaped);
    all.push(...items.map(item => ({project, ...item})));
  }
  const picked = inOrder(
    all.filter(
      i =>
        (!section || i.section === section) && (priority === undefined || i.priority === priority)
    )
  );
  return limit === undefined ? picked : picked.slice(0, limit);
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

const writeFolderNotes = async (call, project, fields, closedFields) => {
  for (const [dir, about, body] of [
    [
      folderOf(project),
      fields,
      `One note per queue item, read with \`queue-items.mjs list ${project}\` or by the frontmatter query; closed items are in \`queue-archive/\`. The vault skill says how to file, move, and archive one.\n`
    ],
    [
      closedFolderOf(project),
      closedFields,
      'One note per closed queue item, read by the frontmatter query; open items are in `queue/`. The vault skill says how to close one.\n'
    ]
  ]) {
    await expectJson(
      await call('PUT', `/vault/${dir}/_about.md`, {
        json: {frontmatter: {...about, type: 'meta', status: 'active'}, body}
      }),
      `the folder note of ${dir}`
    );
  }
};

const closedDefaults = project => ({
  title: `${project} — Queue Archive`,
  tags: [project, 'queue', 'archive']
});

// A project with no queue starts in this shape.
const readyToFile = async (call, project) => {
  const {items} = await expectJson(
    await call('POST', '/resolve', {json: {wikilinks: [`projects/${project}/queue.md`]}}),
    `resolve the queue of ${project}`
  );
  const path = items[0].file_path;
  if (path === `${folderOf(project)}/_about.md`) return;
  if (path !== null) throw new Error(`${path} is one note, which this script does not read`);
  await writeFolderNotes(
    call,
    project,
    {title: `${project} — Queue`, tags: [project, 'queue']},
    closedDefaults(project)
  );
};

/**
 * Files an item on a project's queue. An open item with the same source or the same title is
 * replaced where it stands, so a repeated call files nothing twice. Answers its path and what it did.
 */
export const fileItem = async (
  project,
  {title, section = 'backlog', priority = 0, source = null, blockedBy = [], body},
  call = client()
) => {
  if (!SECTIONS.includes(section)) {
    throw new RangeError(`--section is one of ${SECTIONS.join(', ')}`);
  }
  if (!title || !body?.trim()) throw new TypeError('an item needs a title and a body');
  if (source && !SOURCE_RE.test(source)) throw new RangeError(`${SOURCE_HELP}; got: ${source}`);
  await readyToFile(call, project);
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
      frontmatter: openFields({
        title,
        section,
        sequence,
        filed: same?.frontmatter.filed ?? today(),
        priority,
        source,
        blockedBy
      }),
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
  if (!SECTIONS.includes(section)) {
    throw new RangeError(`--section is one of ${SECTIONS.join(', ')}`);
  }
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
    throw new RangeError(`--reason is one of ${CLOSE_REASONS.join(', ')}`);
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
 * What a resume lists for a project's queue (`resume-owed.mjs`): items mirroring a ticket, to read
 * upstream, Inbox items to triage, and items filed into the Backlog on or after `since`'s day, none
 * when `since` is null.
 */
export const owedItems = async (project, since, call = client()) =>
  owedFrom(await openNotes(call, project), since);

/** `owedItems`, from open notes already read. */
export const owedFrom = (notes, since) => {
  const day = since?.slice(0, 10);
  // The server files its own stall item, so nobody places it.
  const filedSince = n =>
    day !== undefined &&
    String(shaped(n).filed) >= day &&
    !String(n.frontmatter.title).startsWith('Loop stalls recorded through ');
  const owed = (kind, picked) => picked.map(n => ({kind, ...shaped(n)}));
  return [
    ...owed(
      'upstream',
      notes.filter(n => n.frontmatter.source)
    ),
    ...owed(
      'triage',
      notes.filter(n => n.frontmatter.section === 'inbox')
    ),
    ...owed(
      'place',
      notes.filter(n => n.frontmatter.section === 'backlog' && filedSince(n))
    )
  ];
};

const parseArgs = argv => {
  const opts = {_: []};
  for (let i = 0; i < argv.length; ++i) {
    const a = argv[i];
    if (a === '--json') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else opts._.push(a);
  }
  return opts;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  const [command, project, ref] = opts._;
  if (!command || (!project && command !== 'fleet')) {
    throw new Error('usage: queue-items.mjs list|file|move|archive|trackers <project> …, or fleet');
  }
  const priority = opts.priority === undefined ? undefined : Number(opts.priority);
  const show = value => console.log(JSON.stringify(value, null, 2));
  if (command === 'fleet') {
    const limit = opts.limit === undefined ? undefined : Number(opts.limit);
    const items = await listFleet({section: opts.section, priority, limit});
    if (opts.json) return show(items);
    for (const i of items) {
      console.log(`${i.project}\t${i.section ?? '(no section)'}\t${i.priority}\t${i.title}`);
    }
    console.log(`${items.length} items`);
    return undefined;
  }
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
    case 'trackers': {
      const view = await trackersOf(project);
      if (opts.json) return show(view);
      console.log(trackerLine(view));
      for (const problem of view.problems) console.log(`problem: ${problem}`);
      return undefined;
    }
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
