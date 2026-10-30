// Pure layer of /vault-reorg: splitting a rolling note or a folder piece into units, sharding the
// units for read-only triage agents, checking and merging what the agents return, and building
// the current view's pieces from the agent's plan. No I/O here; reorg-batch.mjs does the requests.

const DATE = /20\d\d-\d\d-\d\d/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
export const KEEP_CLASSES = new Set(['D', 'A_weak', 'E']);
export const CLASSES = ['A', 'A_weak', 'B', 'C', 'D', 'E'];
export const TEXT_MAX = 600;

/** The raw frontmatter block (with its `---` lines) and the body after it. */
export const splitFrontmatter = text => {
  if (!text.startsWith('---\n')) return {frontmatter: '', body: text};
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return {frontmatter: '', body: text};
  return {frontmatter: text.slice(0, end + 5), body: text.slice(end + 5)};
};

/** Each line with whether it sits inside a fenced code block, the fence lines themselves included. */
const fencedLines = body => {
  let open = null;
  return body.split('\n').map(line => {
    const m = FENCE.exec(line);
    if (open === null) {
      if (m) open = m[1];
      return {line, inside: open !== null};
    }
    if (m && m[1][0] === open[0] && m[1].length >= open.length && !line.trim().slice(m[1].length)) {
      open = null;
      return {line, inside: true};
    }
    return {line, inside: true};
  });
};

const bytesOf = text => Buffer.byteLength(text, 'utf8');

/**
 * A rolling note's units: the text before its first `## ` heading as unit 0 (when it holds more
 * than whitespace), then each `## ` section, a heading inside a code fence not counted. A unit's
 * date is the first ISO date in its heading, else in its first 600 characters, else the previous
 * unit's.
 */
export const splitNote = text => {
  const {frontmatter, body} = splitFrontmatter(text);
  const units = [];
  let current = {head: '', lines: []};
  for (const {line, inside} of fencedLines(body)) {
    if (!inside && line.startsWith('## ')) {
      units.push(current);
      current = {head: line.slice(3).trim(), lines: [line]};
    } else current.lines.push(line);
  }
  units.push(current);
  let last = null;
  const rows = [];
  units.forEach((unit, i) => {
    const text = unit.lines.join('\n').replace(/\s+$/, '');
    if (i === 0 && !text.trim()) return;
    const found = DATE.exec(unit.head) ?? DATE.exec(text.slice(0, 600));
    if (found) last = found[0];
    rows.push({
      n: i,
      head: i === 0 ? '(opening block)' : unit.head,
      date: last,
      bytes: bytesOf(text),
      text
    });
  });
  return {frontmatter, rows};
};

const tailOf = text => {
  const at = text.lastIndexOf(' *(');
  return at >= 0 && text.endsWith(')*') ? text.slice(at + 3, -2) : null;
};

/**
 * A folder piece's units: its intro (everything before the first bullet) and each top-level `- `
 * bullet with its continuation lines. A bullet's `tail` is the source citation a reorganization
 * wrote at its end, `*(§n, date; …)*`, kept so a second pass keeps the bullet's provenance.
 */
export const splitPiece = text => {
  const {frontmatter, body} = splitFrontmatter(text);
  const intro = [];
  const bullets = [];
  for (const {line, inside} of fencedLines(body)) {
    if (!inside && line.startsWith('- ')) bullets.push([line]);
    else if (bullets.length) bullets.at(-1).push(line);
    else intro.push(line);
  }
  const rows = bullets.map((lines, i) => {
    const text = lines.join('\n').replace(/\s+$/, '');
    const tail = tailOf(text);
    const date = (tail && DATE.exec(tail)?.[0]) ?? DATE.exec(text)?.[0] ?? null;
    return {n: i + 1, head: `bullet ${i + 1}`, date, bytes: bytesOf(text), text, tail};
  });
  return {frontmatter, intro: intro.join('\n').trim(), rows};
};

/** Contiguous shards of at most maxBytes each (a unit larger than that gets a shard of its own). */
export const shardRows = (rows, maxBytes) => {
  const shards = [];
  let current = [];
  let size = 0;
  for (const row of rows) {
    if (current.length && size + row.bytes > maxBytes) {
      shards.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += row.bytes;
  }
  if (current.length) shards.push(current);
  return shards;
};

/** A shard's file: each unit headed by its number and date, as the triage brief reads them. */
export const shardText = (rows, unit) =>
  rows.map(r => `=== ${unit} ${r.n} (${r.date ?? 'undated'}) ===\n${r.text}\n`).join('\n');

/**
 * The units a note gained by appends alone since `plannedText`, numbered after `last` (vault-storage
 * 3e, D546): what a split planned before the appends still lacks. A RangeError when the note changed
 * otherwise, or when an append continues the last section or bullet, which only a new prepare
 * re-plans.
 */
export const tailRows = (mode, plannedText, currentText, last) => {
  const planned = splitFrontmatter(plannedText).body.replace(/\s+$/, '');
  const current = splitFrontmatter(currentText).body;
  if (!current.startsWith(planned))
    throw new RangeError('the note changed in place since prepare, not by appends alone');
  const tail = current.slice(planned.length);
  const split = mode === 'piece' ? splitPiece(tail) : splitNote(tail);
  const opening = mode === 'piece' ? split.intro : (split.rows.find(r => r.n === 0)?.text ?? '');
  if (opening.trim())
    throw new RangeError(`an append continues the last ${mode === 'piece' ? 'bullet' : 'section'}`);
  return split.rows
    .filter(r => mode === 'piece' || r.n !== 0)
    .map((r, i) => ({...r, n: last + i + 1}));
};

/** What is wrong with one shard's result, as messages; an empty list means it can be merged. */
export const checkResult = (result, name) => {
  const problems = [];
  const where = `${name}:`;
  if (!result || typeof result !== 'object') return [`${where} not a JSON object`];
  for (const key of ['sections', 'bullets', 'counts', 'bytes', 'keep']) {
    if (!(key in result)) problems.push(`${where} missing \`${key}\``);
  }
  if (problems.length) return problems;
  const counts = CLASSES.reduce((sum, c) => sum + (result.counts[c] ?? 0), 0);
  if (counts !== result.bullets)
    problems.push(`${where} counts sum to ${counts}, bullets say ${result.bullets}`);
  if (!Array.isArray(result.keep)) return [...problems, `${where} \`keep\` is not a list`];
  result.keep.forEach((item, i) => {
    const at = `${where} keep[${i}]`;
    if (!Number.isInteger(item.n)) problems.push(`${at} has no integer \`n\``);
    if (!KEEP_CLASSES.has(item.class))
      problems.push(`${at} class ${item.class} is not D, A_weak, or E`);
    if (typeof item.text !== 'string' || !item.text.trim()) problems.push(`${at} has no text`);
    else if (item.text.length > TEXT_MAX)
      problems.push(`${at} text is ${item.text.length} characters, over ${TEXT_MAX}`);
    if (typeof item.subject !== 'string' || !item.subject) problems.push(`${at} has no subject`);
  });
  return problems;
};

/** The shards' results summed, with every keep item numbered by its position (`id`). */
export const mergeResults = results => {
  const problems = results.flatMap(({name, result}) => checkResult(result, name));
  if (problems.length) throw new RangeError(`shard results rejected:\n${problems.join('\n')}`);
  const counts = Object.fromEntries(CLASSES.map(c => [c, 0]));
  const bytes = Object.fromEntries(CLASSES.map(c => [c, 0]));
  const keep = [];
  const defects = [];
  let sections = 0;
  let bullets = 0;
  for (const {name, result} of results) {
    sections += result.sections;
    bullets += result.bullets;
    for (const c of CLASSES) {
      counts[c] += result.counts[c] ?? 0;
      bytes[c] += result.bytes?.[c] ?? 0;
    }
    for (const item of result.keep) keep.push({...item, shard: name, id: keep.length});
    for (const defect of result.defects ?? []) defects.push({shard: name, defect});
  }
  return {sections, bullets, counts, bytes, keep, defects};
};

const clip = (text, max) =>
  text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + ' …';

/** Where a half-saved lesson's only other copy lives, from its evidence. */
export const homeOf = evidence => {
  const ev = evidence.replace(/\s+/g, ' ').trim();
  const found = /[Oo]nly homes?:\s*(.*)/.exec(ev);
  const text = (found ? found[1] : ev).split(/(?<=[^.])\. |; /)[0].replace(/\.$/, '');
  return clip(text, 170);
};

/** What would settle an unsure lesson, from its evidence. */
export const settleOf = evidence => {
  const ev = evidence.replace(/\s+/g, ' ').trim();
  const first = text => text.split(/(?<=[^.])\. |; /)[0].replace(/\.$/, '');
  const found = /\b[Ss]ettle(?:s|d)?(?: it| this)?\s+(by|when|with)\s+(.*)/.exec(ev);
  if (found) return clip(`settled ${found[1]} ${first(found[2])}`, 200);
  return clip(first(ev.replace(/^Unsure (?:whether|if)\s*/, '')), 200);
};

/** The source part of a kept unit's tail: `§n, date`, or a piece bullet's own citation. */
const sourceOf = (item, sources) => {
  const original = sources?.[item.n]?.tail;
  if (original) return original.split(/; (?:half-saved|unsure):/)[0].trim();
  return `§${item.n}, ${item.date}`;
};

/** The archive path a supersede in place gives a note: `<dir>/archive/<YYYY>/<name>`. */
export const archivePathOf = (path, year) => {
  const slash = path.lastIndexOf('/');
  return `${path.slice(0, slash)}/archive/${year}/${path.slice(slash + 1)}`;
};

/**
 * The current view's pieces from the agent's plan. Every keep item lands in exactly one piece or
 * is merged into another item (`merges`: `{drop, into}`); a merged item's source joins its
 * partner's tail, and `texts` rewrites an item. Throws when an item is placed twice or not at all.
 * `sources` maps a unit number to its row (piece mode keeps each bullet's own citation); `intro`
 * opens every piece's body.
 */
export const buildPieces = (keep, plan, {sources = null, intro = ''} = {}) => {
  const byId = new Map(keep.map(k => [k.id, k]));
  const placed = new Map();
  const place = (id, where) => {
    if (!byId.has(id)) throw new RangeError(`plan names item ${id}, which the keep list lacks`);
    if (placed.has(id))
      throw new RangeError(`item ${id} is placed twice: ${placed.get(id)} and ${where}`);
    placed.set(id, where);
  };
  const extra = new Map();
  for (const {drop, into} of plan.merges ?? []) {
    place(drop, `merged into ${into}`);
    if (!byId.has(into)) throw new RangeError(`merge target ${into} is not in the keep list`);
    const list = extra.get(into) ?? [];
    list.push(sourceOf(byId.get(drop), sources));
    extra.set(into, list);
  }
  for (const piece of plan.pieces) for (const id of piece.items) place(id, `piece ${piece.name}`);
  const missing = keep.filter(k => !placed.has(k.id)).map(k => k.id);
  if (missing.length) throw new RangeError(`items placed nowhere: ${missing.join(', ')}`);
  const texts = plan.texts ?? {};
  return plan.pieces.map(piece => {
    const items = piece.items
      .map(id => byId.get(id))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.n - b.n);
    const lines = items.map(item => {
      const parts = [sourceOf(item, sources), ...(extra.get(item.id) ?? [])];
      let tail = parts.join('; ');
      if (item.class === 'A_weak') tail += `; half-saved: ${homeOf(item.evidence ?? '')}`;
      if (item.class === 'E') tail += `; unsure: ${settleOf(item.evidence ?? '')}`;
      const text = (texts[item.id] ?? item.text).trim().replace(/\s*\n\s*/g, ' ');
      return `- ${text} *(${tail})*`;
    });
    const body = (intro ? `${intro.trim()}\n\n` : '') + lines.join('\n') + '\n';
    return {name: piece.name, items: items.length, bytes: bytesOf(body), body};
  });
};
