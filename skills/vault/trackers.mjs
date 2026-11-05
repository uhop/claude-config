// A project's tracker declaration: where its work is tracked and which tracker is primary
// (vault-storage D95, 11d-2c). Declared in `trackers:` in its `queue/_about.md` frontmatter, since
// the queue is the vault's own tracker and the declaration says what stands beside it; absent, the
// vault is primary. The server stores it and resolves links by it; what it means is here.

export const TRACKER_KINDS = ['vault', 'github', 'linear', 'jira'];
const KINDS = new Set(TRACKER_KINDS);
const ROLES = new Set(['primary', 'secondary']);
const CREATE = new Set(['here', 'none']);
// How a secondary tracker's items reach the vault's queue (2026-09-30): reflected as items with a
// link, taken through the Inbox for triage, or not at all. A primary outside tracker takes none:
// the vault records the item in flight (D108), never a mirror.
const INTAKE = new Set(['none', 'reflect', 'triage']);

const VAULT_PRIMARY = {
  kind: 'vault',
  ref: null,
  role: 'primary',
  create: 'here',
  intake: 'none',
  write: [],
  url: null
};

const urlFor = (kind, ref, given) => {
  if (typeof given === 'string' && /^https?:\/\//.test(given)) return given;
  if (kind === 'github' && ref && /^[\w.-]+\/[\w.-]+$/.test(ref)) {
    return `https://github.com/${ref}/issues`;
  }
  return null;
};

const stringIn = (set, value) => (typeof value === 'string' && set.has(value) ? value : null);

/** One declared entry, or null with the reason in `problems`. */
const entryOf = (entry, i, problems) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    problems.push(`trackers[${i}] must be a map`);
    return null;
  }
  const kind = typeof entry.kind === 'string' ? entry.kind : '';
  if (!KINDS.has(kind)) {
    problems.push(
      `trackers[${i}].kind must be one of ${TRACKER_KINDS.join(', ')} (got ${JSON.stringify(entry.kind ?? null)})`
    );
    return null;
  }
  const ref = typeof entry.ref === 'string' && entry.ref.trim() ? entry.ref.trim() : null;
  if (kind !== 'vault' && ref === null) {
    problems.push(`trackers[${i}] (${kind}) needs a ref`);
    return null;
  }
  // `mirror` was the name until 2026-09-30; read, and named as stale.
  if (entry.role === 'mirror') problems.push(`trackers[${i}].role mirror is called secondary now`);
  const role = entry.role === 'mirror' ? 'secondary' : stringIn(ROLES, entry.role);
  if (entry.role !== undefined && role === null) {
    problems.push(`trackers[${i}].role must be primary or secondary`);
    return null;
  }
  const create = stringIn(CREATE, entry.create);
  if (entry.create !== undefined && create === null) {
    problems.push(`trackers[${i}].create must be here or none`);
    return null;
  }
  const intake = stringIn(INTAKE, entry.intake);
  if (entry.intake !== undefined && intake === null) {
    problems.push(`trackers[${i}].intake must be none, reflect, or triage`);
    return null;
  }
  if (intake !== null && intake !== 'none' && kind === 'vault') {
    problems.push(`trackers[${i}] (vault) takes no intake; it is the queue`);
  }
  return {
    kind,
    ref,
    role: role ?? 'secondary',
    create: create ?? (role === 'primary' ? 'here' : 'none'),
    intake: kind === 'vault' ? 'none' : (intake ?? 'none'),
    write: Array.isArray(entry.write)
      ? entry.write.filter(w => typeof w === 'string' && w.length > 0)
      : [],
    url: urlFor(kind, ref, entry.url)
  };
};

/** The declaration as written, validated; `raw` is the frontmatter's `trackers` value. */
export const readTrackers = (project, raw) => {
  if (raw === undefined || raw === null) {
    return {
      project,
      declared: false,
      trackers: [VAULT_PRIMARY],
      primary: VAULT_PRIMARY,
      problems: []
    };
  }
  const problems = [];
  const trackers = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry, i) => {
      const tracker = entryOf(entry, i, problems);
      if (tracker !== null) trackers.push(tracker);
    });
  } else {
    problems.push('trackers must be a list');
  }
  const primaries = trackers.filter(t => t.role === 'primary');
  if (primaries.length > 1) {
    problems.push(`${primaries.length} trackers are primary; the first one counts`);
    for (const t of primaries.slice(1)) t.role = 'secondary';
  }
  // A primary outside the vault takes no intake: its items are not copied in; the vault records
  // the item in flight (D108).
  const first = primaries[0];
  if (first !== undefined && first.kind !== 'vault' && first.intake !== 'none') {
    problems.push(
      `the primary (${first.kind} ${first.ref}) takes no intake: the vault records the item in flight, not a mirror`
    );
    first.intake = 'none';
  }
  if (primaries.length === 0) {
    problems.push('no tracker is primary; the vault is');
    const vault = trackers.find(t => t.kind === 'vault');
    if (vault === undefined) trackers.unshift({...VAULT_PRIMARY});
    else vault.role = 'primary';
  }
  const primary = trackers.find(t => t.role === 'primary') ?? VAULT_PRIMARY;
  return {project, declared: true, trackers, primary, problems};
};

/** The one line a person reads: `linear ENG (primary)`, or `vault`. */
export const trackerLine = view => {
  const p = view.primary;
  const name = p.kind === 'vault' ? 'vault' : `${p.kind} ${p.ref}`;
  const secondaries = view.trackers
    .filter(t => t.role === 'secondary')
    .map(t =>
      t.kind === 'vault'
        ? 'vault'
        : `${t.kind} ${t.ref}${t.intake === 'none' ? '' : ` (${t.intake})`}`
    );
  return secondaries.length ? `${name} (primary); secondary: ${secondaries.join(', ')}` : name;
};
