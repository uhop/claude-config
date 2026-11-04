// What a resume lists (vault-storage 1h, 11d-2b, 12a): what the resume bundle's blocks and a
// project's queue say is waiting on someone, each with what its call takes and why, in the order
// the vault skill names them. The server keeps the blocks; these rules are the skill's, and
// `resume.mjs` prints them.

/** Where the server's loop stalls are filed while the server does not file them itself (D177). */
export const STALL_ITEM = 'projects/vault-storage/queue/loop-stalls.md';

const FIRST_LINE_MAX = 120;

const itemWhy = {
  upstream: i => `it mirrors ${i.source}: ${i.title}`,
  triage: i => `it waits in the Inbox: ${i.title}`,
  place: i => `it entered the Backlog on ${i.filed}: ${i.title}`
};

const slugOfPath = path => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

const owedByProject = (p, items, owe) => {
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
  if (p.trackers.problems.length > 0) {
    owe(
      'fix-trackers',
      `projects/${p.name}/queue/_about.md`,
      `its trackers: ${p.trackers.problems.join('; ')}`
    );
  }
};

/**
 * Each thing waiting, in the order the skill names them: the project's, when the bundle names one,
 * then the stalls', which any project's resume files. `items` is what `owedItems` answers for the
 * project's queue.
 */
export const owedOf = (bundle, items = []) => {
  const owed = [];
  const owe = (kind, target, why) => owed.push({kind, target, why});
  if (bundle.project !== null) owedByProject(bundle.project, items, owe);
  const {stalls} = bundle;
  if (stalls !== null && stalls.filedBy !== 'server') {
    owe(
      'file-stalls',
      STALL_ITEM,
      `${stalls.count} loop stalls in the past week, the latest at ${stalls.latestAt}`
    );
  }
  return owed;
};
