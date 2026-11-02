// queue-lint.mjs's rule, pinned on the titles it was calibrated on. Run:
// node --test skills/vault-lint/queue-lint.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completionMarker, markerFindings} from './queue-lint.mjs';

test('completion markers: shouted or dated in the title', () => {
  assert.equal(completionMarker('Phase 8 — MERGE SHIPPED 2026-07-29: all executed.'), 'SHIPPED');
  assert.equal(
    completionMarker('Goedecke read — filed and closed 2026-08-16.'),
    'closed 2026-08-16'
  );
  assert.equal(completionMarker('Fix the flaky test.'), null);
  assert.equal(completionMarker('Fixed the flaky test, again.'), null, 'a plain one needs a date');
  assert.equal(completionMarker('Emit `DONE` events.'), null, 'code spans are stripped');
});

// The 2026-09-29 false positive and the fleet titles the narrowed rule was measured on.
test('a plain marker before the word it modifies is an adjective, not a marker', () => {
  assert.equal(
    completionMarker('Report stored frontmatter values outside a closed enum (2026-09-29).'),
    null
  );
  assert.equal(completionMarker('Unlinked mentions of published posts — ruled 2026-09-15.'), null);
  assert.equal(completionMarker('A fixed-width column for the pager (2026-09-27).'), null);
  assert.equal(completionMarker('Filed 2026-09-29: closed enums go unreported.'), null);
  assert.equal(
    completionMarker('Staging trees ingested — fixed on 2026-07-28.'),
    'fixed on 2026-07-28'
  );
  assert.equal(
    completionMarker('v0.1.0 published to npm 2026-04-20.'),
    'published to npm 2026-04-20'
  );
  assert.equal(completionMarker('1.2.2 release shipped (2026-05-07).'), 'shipped (2026-05-07');
  assert.equal(
    completionMarker('Audit follow-ups (2026-08-10) — shipped'),
    '2026-08-10) — shipped'
  );
  assert.equal(completionMarker('Both 2026-06-20 gaps shipped.'), '2026-06-20 gaps shipped');
  assert.equal(completionMarker('Staging fixed 2026-07-29.'), 'fixed 2026-07-29');
});

// Filed 2026-10-31 from the resume's lint: a modifier that starts with a sign or a count.
test('a plain marker before a signed or counted modifier is an adjective too', () => {
  assert.equal(
    completionMarker('Local days: `tz_offset_hours` is a fixed −5 (filed 2026-10-31)'),
    null
  );
  assert.equal(completionMarker('A fixed 30-second cap (filed 2026-10-31)'), null);
  assert.equal(
    completionMarker('Release shipped 1.2.0 (2026-05-07).'),
    'shipped 1.2.0 (2026-05-07'
  );
});

test('markerFindings says which title, and says nothing of a clean one', () => {
  assert.deepEqual(markerFindings(['Fix the flaky test.', 'Release SHIPPED.']), [
    '"Release SHIPPED.": completion marker \'SHIPPED\' on an open item; archive it'
  ]);
  assert.deepEqual(markerFindings([]), []);
});
