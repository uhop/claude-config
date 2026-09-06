// verify-claims.mjs — the claim extractor and verifier behind /vault verify,
// kept pure so verify-claims.test.mjs pins them. A vault note about a project
// asserts things git and the working tree can refute: a path exists, a commit
// exists and carries a date, a version was tagged or committed, a directory
// holds N files, a file has N lines. check-drift compares the repository
// against a recorded baseline and cannot see a claim the repository never
// supported; this reads the notes and asks the repository. Extraction is by
// pattern — cheap, deterministic, and blind to prose claims, which stay the
// agent's read (agent-workflow queue, filed 2026-08-20). Calibrated 2026-09-06
// on apodict's 102 notes and claude-config's 4; the rules below carry the
// numbers that set them.

const FENCE_RE = /```[\s\S]*?```/g;
const SPAN_RE = /`([^`\n]+)`/g;
const DATE = '\\d{4}-\\d{2}-\\d{2}';
// Only a 7- or 40-hex span is a commit: measured, 8-hex spans are session ids
// and 12-hex are fragment ids (0 of 171 resolved), 7-hex resolve 194 of 291.
const SHA_RE = /^(?:[0-9a-f]{7}|[0-9a-f]{40})$/;
const SEMVER = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?';
// A version is a claim only beside a release verb; "npm 10.9.8" and another
// package's "date-fns 4.4.0" are prose.
const VERSION_CUE_RE = new RegExp(
  `\\b(?:version|released?|publish(?:ed)?|tag(?:ged)?|shipped(?: in)?|cut|bump(?:ed)? to)\\s+v?(${SEMVER})\\b|\\b(${SEMVER})\\s+(?:published|released|tagged|shipped)\\b`,
  'g'
);
// "N files in `dir/`", "`dir/` (N files)", "`file` (N lines)", "N lines in `file`".
const COUNT_BEFORE_RE = /(\d[\d,]*)\s+(files?|lines?)\s+(?:in|under|inside)\s+`([^`\n]+)`/g;
const COUNT_AFTER_RE =
  /`([^`\n]+)`\s*(?:\(|holds\s+|has\s+|contains\s+|[—–-]\s*)(\d[\d,]*)\s+(files?|lines?)\b/g;
const COUNT_LOOSE_RE = /\b(\d{1,3}(?:,\d{3})*|\d+)\s+(files?|commits?|lines?)\b/g;
const EXT_RE =
  /\.(?:m?[cj]s|[cm]?ts|json|md|mdx|sh|bash|py|ya?ml|toml|txt|html?|css|hpp|cpp|cc|h|c|rs|go|java|lock|svg|png|jpe?g|gif|sql|proto|wasm|tsx|jsx)$/i;
// A date pairs with a span only in the shapes that make one statement:
// "`x` (2026-09-02)", "`x` (added 2026-09-02)", "`x`, 2026-09-02",
// "tagged 1.8.0 on 2026-09-02", "2026-09-02 (`x`)". Measured: the nearest date within four characters
// crossed a sentence boundary on the one finding it produced.
const PAIR_AFTER_RE = new RegExp(
  `^\\s*(?:[(,—–:-]\\s*|(?:on|at|dated)\\s+)(?:[a-z]+\\s+){0,2}(${DATE})`
);
const PAIR_BEFORE_RE = new RegExp(`(${DATE})\\s*(?:[a-z]+\\s+){0,2}[(,—–:-]?\\s*$`);

const blankFences = s => s.replace(FENCE_RE, m => m.replace(/[^\n]/g, ' '));
const pairedDate = (line, at, end) => {
  const after = PAIR_AFTER_RE.exec(line.slice(end, end + 40));
  if (after) return after[1];
  const before = PAIR_BEFORE_RE.exec(line.slice(Math.max(0, at - 40), at));
  return before ? before[1] : null;
};

// A path claim carries a slash: bare basenames name a file in some repository
// (`package.json`, `state.md`), and 560 of 622 first-run path findings were
// exactly those.
const looksLikePath = span => {
  if (!span.includes('/')) return false;
  if (
    /[\s*?{}<>|&;=$"'()]/.test(span) ||
    /^(?:https?:|~|\/|\.\.)/.test(span) ||
    span.includes('//')
  )
    return false;
  const body = span.replace(/:\d+$/, '').replace(/\/$/, '');
  return /^[\w.@+-]+(?:\/[\w.@+-]+)*$/.test(body);
};

export const extractClaims = (body, {fenced = false} = {}) => {
  const text = fenced ? (body ?? '') : blankFences(body ?? '');
  const claims = [];
  text.split('\n').forEach((line, i) => {
    const ln = i + 1;
    const add = c => claims.push({line: ln, ...c});
    for (const m of line.matchAll(SPAN_RE)) {
      const span = m[1];
      const at = m.index,
        end = at + m[0].length;
      const date = pairedDate(line, at, end);
      if (SHA_RE.test(span) && /[a-f]/.test(span) && /\d/.test(span))
        add({kind: 'commit', col: at, value: span, date});
      else if (looksLikePath(span)) {
        const lineRef = /:(\d+)$/.exec(span);
        const path = span.replace(/:\d+$/, '').replace(/^\.\//, '');
        add({
          kind: 'path',
          col: at,
          value: path.replace(/\/$/, ''),
          dir: path.endsWith('/'),
          line_ref: lineRef ? Number(lineRef[1]) : null,
          date
        });
      }
    }
    const stripped = line.replace(SPAN_RE, m => ' '.repeat(m.length));
    for (const m of stripped.matchAll(VERSION_CUE_RE)) {
      const v = m[1] ?? m[2];
      const at = m.index + m[0].indexOf(v);
      add({kind: 'version', col: m.index, value: v, date: pairedDate(line, at, at + v.length)});
    }
    const counted = new Set();
    const addCount = (col, n, noun, target) => {
      counted.add(col);
      add({
        kind: 'count',
        col,
        value: Number(n.replace(/,/g, '')),
        noun: noun.replace(/s$/, ''),
        target: target.replace(/\/$/, '')
      });
    };
    for (const m of line.matchAll(COUNT_BEFORE_RE))
      if (looksLikePath(m[3])) addCount(m.index, m[1], m[2], m[3]);
    for (const m of line.matchAll(COUNT_AFTER_RE))
      if (looksLikePath(m[1]))
        addCount(m.index + m[0].indexOf(m[2] + ' ' + m[3]), m[2], m[3], m[1]);
    for (const m of stripped.matchAll(COUNT_LOOSE_RE)) {
      if (counted.has(m.index)) continue;
      add({
        kind: 'count',
        col: m.index,
        value: Number(m[1].replace(/,/g, '')),
        noun: m[2].replace(/s$/, ''),
        target: null
      });
    }
  });
  return claims.sort((a, b) => a.line - b.line || a.col - b.col);
};

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const TOLERANCE = 1; // a commit's author date is the day the work was done, give or take a timezone

// facts: {tracked: Set<path>, exists(path) → bool, history: Map<path, {first, last}>,
//         tags: Map<name, date>, versions: Set<semver>, commits: Map<sha, date>,
//         lineCount(path) → n|null, topLevel: Set<dir>} — one git run each.
export const verifyClaims = (claims, facts) => {
  const findings = [];
  const unchecked = [];
  const under = (set, prefix) => [...set].filter(p => p === prefix || p.startsWith(prefix + '/'));
  const historyFirst = prefix => {
    let first = null;
    for (const p of under(facts.history.keys(), prefix)) {
      const h = facts.history.get(p);
      if (!first || h.first < first) first = h.first;
    }
    return first;
  };
  const push = (cat, c, detail, extra = {}) => findings.push({cat, line: c.line, detail, ...extra});
  for (const c of claims) {
    if (c.kind === 'path') {
      const top = c.value.split('/')[0];
      if (!facts.topLevel.has(top)) continue; // another repository's path, or prose with a slash
      const present = under(facts.tracked, c.value).length > 0 || facts.exists(c.value);
      if (present) {
        if (c.line_ref) {
          const n = facts.lineCount(c.value);
          if (n !== null && c.line_ref > n)
            push('path', c, `\`${c.value}:${c.line_ref}\` — the file has ${n} lines`);
        }
        if (c.date) {
          const first = historyFirst(c.value);
          if (first && dayDiff(first, c.date) > TOLERANCE)
            push('date', c, `\`${c.value}\` paired with ${c.date}, first committed ${first}`);
        }
        continue;
      }
      const past = under(facts.history.keys(), c.value);
      if (past.length) {
        const last = past
          .map(p => facts.history.get(p).last)
          .sort()
          .pop();
        push('path', c, `\`${c.value}\` — gone; last seen ${last}`);
      } else push('path', c, `\`${c.value}\` — never existed in this repository`);
    } else if (c.kind === 'commit') {
      const hits = [...facts.commits.keys()].filter(sha => sha.startsWith(c.value));
      if (hits.length === 0)
        push(
          'commit',
          c,
          `\`${c.value}\` — no such commit in this repository or any sibling checkout`,
          {sha: c.value}
        );
      else if (hits.length > 1)
        unchecked.push({
          cat: 'commit',
          line: c.line,
          detail: `\`${c.value}\` — ambiguous, ${hits.length} commits match`
        });
      else if (c.date) {
        const date = facts.commits.get(hits[0]);
        if (Math.abs(dayDiff(date, c.date)) > TOLERANCE)
          push('commit', c, `\`${c.value}\` is dated ${date}, the note pairs it with ${c.date}`);
      }
    } else if (c.kind === 'version') {
      if (facts.tags.size === 0 && facts.versions.size === 0) {
        unchecked.push({
          cat: 'version',
          line: c.line,
          detail: `${c.value} — no tags and no package.json to check against`
        });
        continue;
      }
      const tag = [...facts.tags.keys()].find(
        t => t === c.value || t === 'v' + c.value || t.endsWith('-' + c.value)
      );
      if (tag) {
        if (c.date && Math.abs(dayDiff(facts.tags.get(tag), c.date)) > TOLERANCE)
          push(
            'version',
            c,
            `${c.value} was tagged ${facts.tags.get(tag)}, the note pairs it with ${c.date}`
          );
      } else if (!facts.versions.has(c.value))
        push('version', c, `${c.value} — never a tag nor a package.json version here`);
    } else if (c.kind === 'count') {
      if (!c.target) {
        unchecked.push({
          cat: 'count',
          line: c.line,
          detail: `${c.value} ${c.noun}s — nothing to count it against`
        });
        continue;
      }
      if (!facts.topLevel.has(c.target.split('/')[0])) continue;
      if (c.noun === 'file') {
        const n = under(facts.tracked, c.target).length;
        if (n !== c.value)
          push('count', c, `${c.value} files in \`${c.target}/\` — git tracks ${n}`);
      } else {
        const n = facts.lineCount(c.target);
        if (n !== null && n !== c.value)
          push('count', c, `${c.value} lines in \`${c.target}\` — the file has ${n}`);
      }
    }
  }
  return {findings, unchecked};
};
