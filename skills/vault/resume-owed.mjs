#!/usr/bin/env node
// What a resume owes (vault-storage 1h, 11d-2b): the actions the resume bundle's blocks and a
// project's queue call for, each with what its call takes and why, in the order the vault skill
// takes them. The server keeps the blocks; these rules are the skill's.
//
//   resume-owed.mjs <project>

import {client, expectJson, owedItems} from './queue-items.mjs';

/** A note under this size is read whole when its summary may be stale; a larger one, by section (D287). */
export const POSSIBLY_STALE_READ_BYTES = 64 * 1024;

/** Where the server's loop stalls are filed while the server does not file them itself (D177). */
export const STALL_ITEM = 'projects/vault-storage/queue/loop-stalls.md';

const FIRST_LINE_MAX = 120;

/** What a note's writes since changed, as a reason to read it; none when they set only frontmatter. */
const contentChange = changed => {
  if (changed === null) return 'written since the last session, what changed unknown';
  if ('created' in changed) return 'made since the last session';
  return changed.body ? 'its body changed since the last session' : null;
};

const itemWhy = {
  upstream: i => `it mirrors ${i.source}: ${i.title}`,
  triage: i => `it waits in the Inbox: ${i.title}`,
  place: i => `it entered the Backlog on ${i.filed}: ${i.title}`
};

const slugOfPath = path => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

const owedByProject = (p, items, owe) => {
  for (const s of p.sessions.unlogged) {
    owe(
      'log',
      {path: s.file, holder: s.holder, ended: s.ended},
      `ended ${s.ended} by ${s.reason} with no log`
    );
  }
  for (const h of p.handoffs.open) {
    owe(
      'handoff',
      h.id,
      `a ${h.kind} from ${h.from}, open since ${h.created}: ${h.body_first_line.slice(0, FIRST_LINE_MAX)}`
    );
  }
  for (const h of p.handoffs.returned) {
    owe('rework', h.id, `a ${h.kind} to ${h.to}, returned ${h.updated}`);
  }
  for (const i of items) owe(i.kind, slugOfPath(i.path), itemWhy[i.kind](i));
  for (const notice of p.notices) {
    if (notice.by.file_path !== null) {
      owe('read', notice.by.file_path, `it ${notice.type} projects/${p.name}/${notice.file}.md`);
    }
  }
  const changed = p.changes?.notes ?? [];
  // feedback.md's rules arrive whole, in the bundle or from the session-start hook.
  for (const [name, file] of Object.entries(p.files)) {
    if (file === null || name === 'feedback') continue;
    const path = file.file_path;
    if (file.summary_stale) owe('read', path, 'its summary predates its body');
    if (
      file.summaryPossiblyStale &&
      file.summaryUnchanged !== undefined &&
      file.body_bytes < POSSIBLY_STALE_READ_BYTES
    ) {
      owe(
        'read',
        path,
        `its summary has stood through ${file.summaryUnchanged.writes} writes since ${file.summaryUnchanged.since}`
      );
    }
    const folder = path.replace(/\.md$/, '/');
    for (const note of changed) {
      if (note.path !== path && !note.path.startsWith(folder)) continue;
      const why = contentChange(note.changed);
      if (why !== null) owe('read', path, why);
    }
  }
  for (const log of p.logs) {
    if (log.summary_stale && log.file_path !== null) {
      owe('read', log.file_path, 'its summary predates its body');
    }
  }
  if (p.trackers.problems.length > 0) {
    owe(
      'fix-trackers',
      `projects/${p.name}/queue/_about.md`,
      `its trackers: ${p.trackers.problems.join('; ')}`
    );
  }
};

/**
 * Each action a resume owes, one entry per action and target, in the order the skill takes them,
 * which is the order the rules run in: the project's, when the bundle names one, then the stalls',
 * which any project's resume files. `items` is what `owedItems` answers for the project's queue.
 */
export const owedOf = (bundle, items = []) => {
  const byKey = new Map();
  const owe = (kind, target, why) => {
    const key = `${kind}\t${JSON.stringify(target)}`;
    const known = byKey.get(key);
    if (known === undefined) byKey.set(key, {kind, target, why});
    else if (!known.why.split('; ').includes(why)) known.why += `; ${why}`;
  };
  if (bundle.project !== null) owedByProject(bundle.project, items, owe);
  const {stalls} = bundle;
  if (stalls !== null && stalls.filedBy !== 'server') {
    owe(
      'file-stalls',
      STALL_ITEM,
      `${stalls.count} loop stalls in the past week, the latest at ${stalls.latestAt}`
    );
  }
  return [...byKey.values()];
};

const main = async () => {
  const project = process.argv[2];
  if (!project) throw new Error('usage: resume-owed.mjs <project>');
  const call = client();
  const bundle = await expectJson(
    await call('POST', `/system/resume-bundle?project=${encodeURIComponent(project)}`, {json: {}}),
    `the resume bundle of ${project}`
  );
  const since = bundle.project.changes?.since.ended ?? null;
  const items = await owedItems(project, since, call);
  console.log(JSON.stringify(owedOf(bundle, items), null, 2));
};

if (import.meta.main) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
