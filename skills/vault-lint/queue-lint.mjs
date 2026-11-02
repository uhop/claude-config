#!/usr/bin/env node
// A queue's rule that outlived the one-note format: an item whose title says the work is finished
// is still open to every list until it is archived. vault-lint's QUEUE category and the session-start
// brief both ask it, the brief through its stdin: a JSON array of titles in, of findings out.
// Filed 2026-08-18 from the fleet audit that found ~95 stranded items across five projects;
// calibrated 2026-09-06 on all 53 queues.

// Shouted markers anywhere in the title; a plain one only next to a date, so "fixed the flaky test"
// stays open and "fixed 2026-07-29" does not. The body is not read: house style narrates partial
// progress there, and the 2026-09-06 fleet run found both body hits false and all six title hits
// real. A plain marker before the word it modifies is an adjective, so "a closed enum (2026-09-29)"
// stays open, as do "a fixed −5" and "a fixed 30-second cap"; a connector may follow it ("published
// to npm 2026-04-20"). Measured 2026-09-29 (vault-storage D98).
const SHOUTED_RE = /\b(?:SHIPPED|DONE|COMPLETED?|CLOSED|FIXED|PUBLISHED)\b/;
const PLAIN =
  '\\b(?:shipped|done|completed|fixed|closed|published)\\b(?![\\s-]+(?:(?!(?:on|in|to)\\b)[a-z]|[−+]\\d|\\d+-[a-z]))';
const DATE = '\\d{4}-\\d{2}-\\d{2}';
const DATED_RE = new RegExp(`${PLAIN}[^\\n]{0,24}?${DATE}|${DATE}[^\\n]{0,24}?${PLAIN}`, 'i');

const withoutCode = text => text.replace(/`[^`\n]*`/g, m => ' '.repeat(m.length));

/** The words in a title that say its work is finished, or null. */
export const completionMarker = title => {
  const text = withoutCode(title);
  const m = SHOUTED_RE.exec(text) ?? DATED_RE.exec(text);
  return m ? m[0] : null;
};

const short = text => (text.length > 72 ? `${text.slice(0, 69)}…` : text);

/** One finding for each open item's title that says its work is finished. */
export const markerFindings = titles =>
  titles.flatMap(title => {
    const marker = completionMarker(title);
    return marker === null
      ? []
      : [`"${short(title)}": completion marker '${marker}' on an open item; archive it`];
  });

if (import.meta.main) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  console.log(JSON.stringify(markerFindings(JSON.parse(input))));
}
