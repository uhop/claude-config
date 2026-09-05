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
export const NEIGHBOR_WINDOW = 100;
export const NEIGHBOR_KEEP = 10;

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

// Normalized by the longer string, because raw edit count carries a length
// bias that buries the suffix and compound families duplicate detection is
// looking for: `config` -> `configuration` is 7 edits, worse than three
// unrelated short tags, while 0.54 ranks it second (measured 2026-09-01).
export const nearestTags = (tag, tags) =>
  tags
    .map(entry => {
      const edits = editDistance(tag, entry.tag);
      return {
        ...entry,
        edits,
        distance: Number((edits / Math.max(tag.length, entry.tag.length)).toFixed(2))
      };
    })
    .sort(
      (x, y) =>
        x.distance - y.distance || y.record_count - x.record_count || (x.tag < y.tag ? -1 : 1)
    )
    .slice(0, NEIGHBOR_KEEP);
