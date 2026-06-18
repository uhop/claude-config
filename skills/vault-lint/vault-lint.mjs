#!/usr/bin/env node
// vault-lint — vault hygiene linter. Surfaces FRONTMATTER / WIKILINKS /
// DENSITY / CURRENCY / DUPLICATES findings against the policy at
// topics/vault-hygiene-policy.md. Read-only: it reports, never fixes.
// Exit 1 if any finding, 0 if clean, 2 on API error.
//
// Data source is vault-storage's /sections (bulk records incl. body), reached
// through `vault-curl` — same auth path as every other vault skill. The only
// required FM key not on /sections is `tags` (separate membership table); it is
// out of scope for v1 (documented in SKILL.md).
//
// Usage:
//   vault-lint.mjs                  full report
//   vault-lint.mjs --quiet          tab-separated data lines only (greppable)
//   vault-lint.mjs --category=a,b   subset of: frontmatter,wikilinks,density,currency,duplicates
//   vault-lint.mjs --max=N          per-category cap in the full report (default 40)
//   vault-lint.mjs --no-fetch       skip the per-note raw fetch that confirms density (faster, may over-flag)

import {execFileSync} from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  for (const a of args) {
    if (a === name) return true;
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return fallback;
};

const QUIET = flag('--quiet', false) === true;
const NO_FETCH = flag('--no-fetch', false) === true;
const MAX = Number(flag('--max', '40'));
const ALL_CATS = ['frontmatter', 'wikilinks', 'density', 'currency', 'duplicates'];
const catArg = flag('--category', null);
const CATS = catArg ? catArg.split(',').map(s => s.trim()).filter(Boolean) : ALL_CATS;
for (const c of CATS) {
  if (!ALL_CATS.includes(c)) {
    console.error(`unknown --category '${c}' (known: ${ALL_CATS.join(', ')})`);
    process.exit(2);
  }
}

// --- policy thresholds (topics/vault-hygiene-policy.md is source of truth) ---
const RETENTION_DAYS = {log: 90, query: 90, fleeting: 30, project: 180, permanent: 365};
const REQUIRED_FM = ['title', 'type', 'status', 'created', 'updated'];
const TYPE_EXEMPT_BASENAMES = new Set(['_index.md', '_about.md']);
const DENSITY_SKIP_STATUS = new Set(['archived', 'archive', 'done']);
const ARCHIVE_RE = /(^|\/)archive\//;
const FETCH_CAP = NO_FETCH ? 0 : 300;

// --- API via vault-curl --------------------------------------------------
const api = path => {
  const out = execFileSync('vault-curl', [path, '-s'], {encoding: 'utf8', maxBuffer: 512 * 1024 * 1024});
  return JSON.parse(out);
};
const apiText = path => execFileSync('vault-curl', [path, '-s'], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

let all;
try {
  const first = api('/sections?limit=100&offset=0');
  const total = first.total ?? first.items.length;
  all = [...first.items];
  for (let off = 100; off < total; off += 100) all.push(...api(`/sections?limit=100&offset=${off}`).items);
} catch (e) {
  console.error(`vault-lint: failed to load /sections via vault-curl — ${e.message.split('\n')[0]}`);
  process.exit(2);
}

// Archived notes are frozen history: links to them must still resolve (so they
// stay in the resolution sets) but they generate no findings of their own.
const active = all.filter(r => !ARCHIVE_RE.test(r.file_path));

// --- wikilink primitives -------------------------------------------------
const WIKILINK_RE = /\[\[([^\]]+?)\]\]/g;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|mp4|mov|webm|ico|zip)$/i;
const norm = p => p.replace(/\.md$/i, '');
// These are dev notes dense with code: `[[x]]` and bare `[[` appear constantly
// as literal examples inside code fences / inline spans. Strip code first or the
// linter drowns in false "broken links" (and one stray `[[` runs the non-greedy
// match across half a document to the next `]]`).
const stripCode = s => s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
const linkTargets = text => {
  if (!text) return [];
  const out = [];
  for (const m of stripCode(text).matchAll(WIKILINK_RE)) {
    const t = m[1].split('|')[0].split('#')[0].trim();
    if (!t || t.startsWith('#') || t.length > 200 || t.includes('\n') || ASSET_EXT.test(t)) continue;
    out.push(norm(t.replace(/^\/+/, '')));
  }
  return out;
};

const pathSet = new Set();
const byBase = new Map();
for (const r of all) {
  const n = norm(r.file_path);
  pathSet.add(n);
  const b = n.split('/').pop();
  if (!byBase.has(b)) byBase.set(b, []);
  byBase.get(b).push(n);
}
// Path-qualified targets resolve by path; bare names by basename (Obsidian's
// shortest-path rule, also the policy's stated behaviour).
const resolves = t => (t.includes('/') ? pathSet.has(t) : byBase.has(t));

// inbound link graph (body links only) — feeds project-isolation + query currency
const inbound = new Map();
for (const r of all) {
  const from = norm(r.file_path);
  for (const t of new Set(linkTargets(r.body))) {
    const targets = t.includes('/') ? (pathSet.has(t) ? [t] : []) : (byBase.get(t) || []);
    for (const tg of targets) if (tg !== from) inbound.set(tg, (inbound.get(tg) || 0) + 1);
  }
}
const inboundOf = r => inbound.get(norm(r.file_path)) || 0;

// --- date helpers --------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const parseDate = s => {
  if (typeof s !== 'string' || !s) return null;
  const d = new Date(DATE_RE.test(s) ? s + 'T00:00:00Z' : s);
  return isNaN(d.getTime()) ? null : d;
};
const NOW = Date.now();
const ageDays = d => Math.floor((NOW - d.getTime()) / 86400000);

const lev = (a, b) => {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({length: n + 1}, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};

// --- findings ------------------------------------------------------------
const F = [], W = [], D = [], C = [], U = [];
const want = c => CATS.includes(c);

// raw full-file link count (FM `related:` + body), bounded by FETCH_CAP
let fetches = 0, fetchCapped = false;
const fullLinkCount = path => {
  if (fetches >= FETCH_CAP) {
    fetchCapped = true;
    return null;
  }
  ++fetches;
  try {
    return new Set(linkTargets(apiText('/vault/' + path))).size;
  } catch {
    return null;
  }
};

if (want('frontmatter')) {
  for (const r of active) {
    if (r.type === 'state') continue; // managed by /vault check, not lint
    const base = r.file_path.split('/').pop();
    const missing = REQUIRED_FM.filter(k => {
      if (k === 'type' && TYPE_EXEMPT_BASENAMES.has(base)) return false;
      return r[k] === null || r[k] === undefined || r[k] === '';
    });
    const probs = [];
    if (missing.length) probs.push(`missing ${missing.join(',')}`);
    const cd = parseDate(r.created), ud = parseDate(r.updated);
    if (r.created && !cd) probs.push(`unparseable created '${r.created}'`);
    if (r.updated && !ud) probs.push(`unparseable updated '${r.updated}'`);
    if (cd && ud && cd.getTime() > ud.getTime()) probs.push(`created > updated (${r.created} > ${r.updated})`);
    if (probs.length) F.push({path: r.file_path, detail: probs.join('; ')});
  }
}

if (want('wikilinks')) {
  for (const r of active) {
    const broken = [...new Set(linkTargets(r.body))].filter(t => !resolves(t));
    if (broken.length) W.push({path: r.file_path, detail: broken.map(t => `[[${t}]]`).join(', ')});
  }
}

if (want('density')) {
  for (const r of active) {
    if (DENSITY_SKIP_STATUS.has(r.status)) continue;
    const bodyOut = new Set(linkTargets(r.body)).size;
    if (r.type === 'permanent') {
      if (bodyOut >= 2) continue;
      const total = bodyOut < 2 ? (fullLinkCount(r.file_path) ?? bodyOut) : bodyOut;
      if (total < 2) D.push({path: r.file_path, detail: `topic: ${total} outbound wikilink${total === 1 ? '' : 's'} (< 2)`});
    } else if (r.type === 'project') {
      if (bodyOut > 0 || inboundOf(r) > 0) continue;
      const total = fullLinkCount(r.file_path) ?? 0;
      if (total === 0 && inboundOf(r) === 0)
        D.push({path: r.file_path, detail: 'project: isolated (0 outbound, 0 inbound)'});
    }
  }
}

if (want('currency')) {
  for (const r of active) {
    if (r.type === 'state' || r.type === 'index' || r.type === 'meta') continue;
    const thr = RETENTION_DAYS[r.type];
    if (!thr) continue; // types without a retention rule (design/research/queue-item/idea)
    const ud = parseDate(r.updated);
    if (!ud) continue;
    const age = ageDays(ud);
    if (age <= thr) continue;
    if (r.type === 'query' && inboundOf(r) > 0) continue; // archive only if zero inbound
    const action =
      r.type === 'log' ? 'archive → logs/archive/<YYYY>/'
      : r.type === 'query' ? 'archive (0 inbound)'
      : r.type === 'fleeting' ? 'ingest or retire'
      : 'verify still current';
    C.push({path: r.file_path, detail: `${r.type}: updated ${r.updated} (${age}d > ${thr}d) — ${action}`});
  }
}

if (want('duplicates')) {
  const projFolders = new Set();
  for (const r of all) {
    const parts = r.file_path.split('/');
    if (parts[0] === 'projects' && parts.length > 2) projFolders.add(parts[1]);
  }
  // Compare on a case/separator-stripped form so punctuation variants of the
  // SAME name collide (tape-six ↔ tapesix) without flagging the many legitimate
  // sibling families that merely share a prefix (stream-chain ↔ stream-json).
  // Conservative by design — misses digit-vs-word splits (tape6 ↔ tape-six);
  // tune empirically per the policy's open question.
  const folders = [...projFolders].sort();
  const fn = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let i = 0; i < folders.length; i++)
    for (let j = i + 1; j < folders.length; j++) {
      const a = folders[i], b = folders[j], d = lev(fn(a), fn(b));
      if (d <= 1) U.push({path: `projects/{${a},${b}}`, detail: `near-identical folder names (lev ${d} ignoring case/separators)`});
    }

  // near-duplicate titles within a folder — merge candidates. Excludes types
  // that are legitimately repetitive/dated (logs, state, queue items, meta).
  const TITLE_DUP_SKIP = new Set(['log', 'state', 'queue-item', 'index', 'meta']);
  const byDir = new Map();
  for (const r of active) {
    // A date in the title means a dated series (reports, dated queries) — a
    // time sequence, not merge candidates; skip regardless of type.
    if (!r.title || TITLE_DUP_SKIP.has(r.type) || /\d{4}-\d{2}-\d{2}/.test(r.title)) continue;
    const dir = r.file_path.split('/').slice(0, -1).join('/') || '.';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(r);
  }
  for (const [dir, recs] of byDir)
    for (let i = 0; i < recs.length; i++)
      for (let j = i + 1; j < recs.length; j++) {
        const ta = recs[i].title.toLowerCase().trim(), tb = recs[j].title.toLowerCase().trim();
        if (ta === tb || lev(ta, tb) <= 2)
          U.push({path: dir, detail: `near-duplicate titles: "${recs[i].title}" ~ "${recs[j].title}"`});
      }
}

// --- output --------------------------------------------------------------
const CATEGORIES = [['FRONTMATTER', F], ['WIKILINKS', W], ['DENSITY', D], ['CURRENCY', C], ['DUPLICATES', U]];
const ABBREV = {FRONTMATTER: 'fm', WIKILINKS: 'links', DENSITY: 'density', CURRENCY: 'currency', DUPLICATES: 'dups'};
const selected = CATEGORIES.filter(([n]) => want(n.toLowerCase()));
const totalFindings = selected.reduce((s, [, arr]) => s + arr.length, 0);

if (QUIET) {
  for (const [name, arr] of selected)
    for (const f of arr) console.log(`${name.toLowerCase()}\t${f.path}\t${f.detail}`);
} else {
  const skipped = all.length - active.length;
  console.log(`vault-lint — ${active.length} active records (${all.length} total, ${skipped} archived/skipped)`);
  if (totalFindings === 0) {
    console.log('clean — no findings.');
  } else {
    for (const [name, arr] of selected) {
      if (!arr.length) continue;
      console.log(`\n${name} (${arr.length})`);
      for (const f of arr.slice(0, MAX)) console.log(`  ${f.path}: ${f.detail}`);
      if (arr.length > MAX) console.log(`  (+${arr.length - MAX} more — --quiet for the full list)`);
    }
    const tally = selected.map(([n, a]) => `${ABBREV[n]}:${a.length}`).join(' ');
    console.log(`\n${totalFindings} findings — ${tally}`);
  }
  if (fetchCapped) console.log(`note: density raw-fetch hit the ${FETCH_CAP} cap; some density flags are body-link-only (may over-flag related:-heavy notes).`);
}

process.exit(totalFindings > 0 ? 1 : 0);
