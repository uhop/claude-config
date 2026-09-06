// tag-distance.mjs — the nearest-tag ranking behind vault-triage's `new_tag`
// worksheet, kept pure so tag-distance.test.mjs pins the ranking.
//
// The alias-vs-new call is a nearest-string question, but `/tags` orders by
// `record_count`, so the canonical a new candidate most likely duplicates --
// itself rarely used -- sorts last and truncates first: `contract` saw
// `contracts` at rank 10 of 10, surviving on a tie-break (filed 2026-09-01).
// Take the whole prefix window and rank it here. Sizing measured the same day:
// 1725 canonical tags, worst 3-char bucket 28, server caps `limit` at 100 --
// so one call covers every window today, and `total` says when that stops
// holding rather than silently dropping the neighbour that mattered.
//
// One window per word, not one per candidate (2026-09-06): no prefix reaches
// `build-vs-buy` from `adopt-vs-build`, and `/tags` lists canonicals only, so
// the word-order alias the taxonomy already carried was invisible to every
// prefix query. Each hyphen token of the candidate opens its own window, and
// a second distance on the token multiset ranks what shares words ahead of
// what merely shares letters.
export const NEIGHBOR_WINDOW = 100;
export const NEIGHBOR_KEEP = 10;
const PREFIX = 3; // a 2-char prefix is a bucket, not a neighbourhood

const round = x => Number(x.toFixed(2));

export const editDistance = (a, b) => {
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; ++i) {
    const row = [i];
    for (let j = 1; j <= b.length; ++j)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
};

const tokens = tag => tag.split('-').filter(Boolean);

// The candidate's own prefix (the original window) plus one per token long
// enough to be a word, deduplicated: `build-vs-buy` opens `bui` and `buy`.
export const neighborPrefixes = tag => {
  const prefixes = new Set([tag.slice(0, PREFIX)]);
  for (const token of tokens(tag)) if (token.length >= PREFIX) prefixes.add(token.slice(0, PREFIX));
  return [...prefixes];
};

// Jaccard distance on the token multisets: 0 for a reordering, 1 when no
// token is shared.
export const tokenDistance = (a, b) => {
  const left = new Map();
  for (const token of tokens(a)) left.set(token, (left.get(token) ?? 0) + 1);
  let shared = 0,
    size = 0;
  for (const token of tokens(b)) {
    ++size;
    const n = left.get(token) ?? 0;
    if (n > 0) {
      ++shared;
      left.set(token, n - 1);
    }
  }
  for (const n of left.values()) size += n;
  return size ? 1 - shared / size : 0;
};

// Normalized by the longer string, because raw edit count carries a length
// bias that buries the suffix and compound families duplicate detection is
// looking for: `config` -> `configuration` is 7 edits, worse than three
// unrelated short tags, while 0.54 ranks it second (measured 2026-09-01).
const nearness = entry => Math.min(entry.distance, entry.token_distance);

export const nearestTags = (tag, tags) =>
  tags
    .map(entry => {
      const edits = editDistance(tag, entry.tag);
      return {
        ...entry,
        edits,
        distance: round(edits / Math.max(tag.length, entry.tag.length)),
        token_distance: round(tokenDistance(tag, entry.tag))
      };
    })
    .sort(
      (x, y) =>
        nearness(x) - nearness(y) || y.record_count - x.record_count || (x.tag < y.tag ? -1 : 1)
    )
    .slice(0, NEIGHBOR_KEEP);
