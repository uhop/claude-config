// queue-lint.mjs — the queue-hygiene checks behind vault-lint's QUEUE category,
// kept pure so queue-lint.test.mjs pins them. They mechanize
// topics/project-queue-convention § Sections outside the schema, § Archiving
// mechanics and § Malformations the parser can't warn about: the queue_items
// parser reads only the three schema H2s and drops the rest without a word,
// an item edited to say SHIPPED is still an open item to every fleet view,
// and a heading glued to the previous line is a paragraph. Filed 2026-08-18
// from the fleet audit that found ~95 stranded items across five projects;
// calibrated 2026-09-06 on all 53 queues (see vault-lint's SKILL.md).

export const SCHEMA_H2 = ['Active', 'Backlog', 'Watching'];
// Sanctioned prose sections beside the schema: rationale and cross-references,
// never work (ruled 2026-08-17). Bullets under them are not findings.
const PROSE_H2 = [
  /^see also\b/i,
  /^scope guardrails\b/i,
  /^deferred\b/i,
  /^design constraints\b/i,
  /^tooling notes\b/i
];

// Fences blank to spaces rather than vanish so line numbers survive; a
// `## Done` inside a fenced example is not a section.
const stripCode = s =>
  s
    .replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length));

const H2_RE = /^## +(.+?)\s*$/;
// The queue_items parser counts every column-0 `-`/`*` bullet in a schema
// section as an item, bolded or not (measured 2026-09-06: all seven fleet
// count mismatches were unbolded bullets); the same rule here keeps the
// server comparison exact.
const BULLET_RE = /^[-*] +(?:\[([ xX~])\] +)?(.*)$/;
const TITLE_RE = /^\*\*(.+?)\*\*/;
const GLUED_RE = /\S\s*#{2,3} +(Active|Backlog|Watching)\b/;

export const parseQueue = body => {
  const preamble = {heading: null, line: 0, known: false, prose: false, items: []};
  const sections = [];
  const glued = [];
  let current = preamble;
  const raw = (body ?? '').split('\n');
  stripCode(body ?? '')
    .split('\n')
    .forEach((line, i) => {
      const h2 = H2_RE.exec(line);
      if (h2) {
        const heading = h2[1];
        current = {
          heading,
          line: i + 1,
          known: SCHEMA_H2.includes(heading),
          prose: PROSE_H2.some(re => re.test(heading)),
          items: []
        };
        sections.push(current);
        return;
      }
      if (/^#{1,6} /.test(line)) return;
      if (GLUED_RE.test(line)) glued.push({line: i + 1, text: raw[i].trim()});
      const b = BULLET_RE.exec(line);
      if (!b) return;
      // Structure comes from the code-stripped line; the title shown is the
      // author's, with its code spans.
      const t = TITLE_RE.exec(b[2]);
      const first = BULLET_RE.exec(raw[i])[2];
      current.items.push({
        line: i + 1,
        checkbox: b[1] ?? null,
        title: t ? first.slice(2, 2 + t[1].length) : null,
        first
      });
    });
  return {preamble, sections, glued};
};

const schemaItems = parsed => parsed.sections.filter(s => s.known).flatMap(s => s.items);
export const itemCount = parsed => schemaItems(parsed).length;

// Shouted markers anywhere in the title; a plain one only next to a date, so
// "fixed the flaky test" stays open and "fixed 2026-07-29" does not. The
// description is not read: house style narrates partial progress there
// ("deprecation SHIPPED 2026-06-07; only the removal remains"), and the
// 2026-09-06 fleet run found both description hits false and all six title
// hits real.
const SHOUTED_RE = /\b(?:SHIPPED|DONE|COMPLETED?|CLOSED|FIXED|PUBLISHED)\b/;
const DATED_RE =
  /\b(?:shipped|done|completed|fixed|closed|published)\b[^\n]{0,24}?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}[^\n]{0,24}?\b(?:shipped|done|completed|fixed|closed|published)\b/i;

export const completionMarker = item => {
  if (item.checkbox && item.checkbox.toLowerCase() === 'x') return '[x]';
  const title = stripCode(item.title ?? item.first);
  const m = SHOUTED_RE.exec(title) ?? DATED_RE.exec(title);
  return m ? m[0] : null;
};

const short = s => (s.length > 72 ? s.slice(0, 69) + '…' : s);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const workShaped = item => item.title !== null || item.checkbox !== null;

export const queueFindings = parsed => {
  const out = [];
  const above = parsed.preamble.items.filter(workShaped).length;
  if (above)
    out.push(
      `${plural(above, 'item')} above the first schema H2 — the parser drops them; move under Backlog`
    );
  for (const s of parsed.sections) {
    if (s.known || s.prose) continue;
    const work = s.items.filter(workShaped).length;
    if (!work) continue;
    out.push(
      `## ${s.heading}: ${plural(work, 'item')} under a non-schema H2 — invisible to every queue view; archive the closed, fold the open into Backlog`
    );
  }
  for (const s of parsed.sections) {
    if (!s.known) continue;
    for (const i of s.items) {
      const m = completionMarker(i);
      if (m)
        out.push(
          `${s.heading} "${short(i.title ?? i.first)}": completion marker '${m}' on an open item — move it to queue-archive`
        );
    }
    const plain = s.items.filter(i => i.title === null);
    if (plain.length)
      out.push(
        `${s.heading}: ${plural(plain.length, 'unbolded column-0 bullet')} counted as ${plain.length === 1 ? 'an item' : 'items'}, first "${short(plain[0].first)}" — bold a title, or indent detail under its item`
      );
  }
  for (const g of parsed.glued)
    out.push(
      `line ${g.line}: heading glued to prose — "${short(g.text)}"; a heading starts its line, so everything below lands in the previous section`
    );
  return out;
};

// The convention's cheap check, both directions: the served slice and the
// markdown must agree exactly once both count column-0 bullets.
export const countMismatch = (expected, served) => {
  if (served === expected) return null;
  return `queue_items holds ${served} item${served === 1 ? '' : 's'}, the markdown ${expected} column-0 bullet${expected === 1 ? '' : 's'} in schema sections — stale slice or parser drift; run vault_queue_reindex and re-lint`;
};
