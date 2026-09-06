// Pins the QUEUE category's rules against the shapes the 2026-08-17 fleet
// audit found and the 2026-09-06 calibration kept. Run: node --test skills/vault-lint/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  parseQueue,
  itemCount,
  completionMarker,
  queueFindings,
  countMismatch
} from './queue-lint.mjs';

const QUEUE = `Intro paragraph mentioning \`## Done\` in code.

- **Stray item above the schema.** Dropped by the parser.

## Design constraints

- **Not work.** Rationale lives here by convention.

## Active

- [x] **Checked item — _implemented 2026-08-18, unreleased._** Done but never moved.
- **Phase 8 — MERGE SHIPPED 2026-07-29: all executed.** Real run.

## Backlog

### Priority +1

- **Remove the deprecated \`utils\` re-exports — next major.** Delegation **SHIPPED** 2026-06-07; only the removal remains.
- **Fix the flaky test.** Filed 2026-08-01; fixed the harness, not the test.
- **Goedecke read — filed and closed 2026-08-16.** Moved to the archive already.
- [ ] Peer-dep bump: wait for parent 3.3.0.
- \`src/index.js\` — default \`keyFromPath\` change.
  - indented detail is not an item
- **Item whose \`code\` title survives.** With a \`span\`.

\`\`\`markdown
## Done

- **Fenced example.** Not a section.
\`\`\`

## Done

- **Shipped thing.** Left under an invented heading.
- [x] checked but unbolded

## See also

- [[projects/x/decisions]]

## Watching

- **~~Locate the proposal~~ — CLOSED 2026-07-21.** Nothing to find.
- **Upstream release.** Waiting.
`;

test('sections, items and the preamble parse the way queue_items counts them', () => {
  const parsed = parseQueue(QUEUE);
  assert.deepEqual(
    parsed.sections.map(s => [s.heading, s.known, s.prose, s.items.length]),
    [
      ['Design constraints', false, true, 1],
      ['Active', true, false, 2],
      ['Backlog', true, false, 6],
      ['Done', false, false, 2],
      ['See also', false, true, 1],
      ['Watching', true, false, 2]
    ]
  );
  assert.equal(parsed.preamble.items.length, 1);
  assert.equal(itemCount(parsed), 10);
  const code = parsed.sections[2].items[5];
  assert.equal(code.title, 'Item whose `code` title survives.');
});

test('completion markers: shouted or dated in the title, checked box, never the description', () => {
  const backlog = parseQueue(QUEUE).sections[2].items;
  assert.equal(
    completionMarker(backlog[0]),
    null,
    'SHIPPED in the description is progress, not closure'
  );
  assert.equal(completionMarker(backlog[1]), null, 'a plain "fixed" with no date is prose');
  assert.equal(completionMarker(backlog[2]), 'closed 2026-08-16');
  const active = parseQueue(QUEUE).sections[1].items;
  assert.equal(completionMarker(active[0]), '[x]');
  assert.equal(completionMarker(active[1]), 'SHIPPED');
  assert.equal(
    completionMarker({checkbox: null, title: 'Emit `DONE` events.', first: ''}),
    null,
    'code spans are stripped'
  );
});

test('findings: the invented heading, the preamble, the markers, the unbolded bullets', () => {
  const out = queueFindings(parseQueue(QUEUE));
  const has = re =>
    assert.ok(
      out.some(d => re.test(d)),
      `missing ${re}\n${out.join('\n')}`
    );
  has(/^1 item above the first schema H2/);
  has(/^## Done: 2 items under a non-schema H2/);
  has(/^Active "Checked item — _implemented 2026-08-18, unreleased._": completion marker '\[x\]'/);
  has(/^Active "Phase 8 — MERGE SHIPPED 2026-07-29: all executed.": completion marker 'SHIPPED'/);
  has(
    /^Backlog "Goedecke read — filed and closed 2026-08-16.": completion marker 'closed 2026-08-16'/
  );
  has(/^Watching "~~Locate the proposal~~ — CLOSED 2026-07-21.": completion marker 'CLOSED'/);
  has(/^Backlog: 2 unbolded column-0 bullets counted as items, first "Peer-dep bump/);
  assert.ok(!out.some(d => /Design constraints|See also|Fenced example/.test(d)), out.join('\n'));
  assert.ok(!out.some(d => /Remove the deprecated|Fix the flaky/.test(d)), out.join('\n'));
  assert.equal(out.length, 7, out.join('\n'));
});

test('a heading glued to the previous line is reported, not treated as a section', () => {
  const parsed = parseQueue(
    '## Active\n\n- **A.** then archive this item.## Backlog\n\n- **B.** open\n'
  );
  assert.equal(parsed.sections.length, 1);
  assert.equal(itemCount(parsed), 2);
  const out = queueFindings(parsed);
  assert.equal(out.length, 1);
  assert.match(
    out[0],
    /^line 3: heading glued to prose — "- \*\*A\.\*\* then archive this item\.## Backlog"/
  );
});

test('a clean queue has no findings and an exact count', () => {
  const parsed = parseQueue(
    '## Active\n\n(empty)\n\n## Backlog\n\n- **One.** Open.\n\n## Watching\n\n(empty)\n'
  );
  assert.deepEqual(queueFindings(parsed), []);
  assert.equal(itemCount(parsed), 1);
  assert.equal(countMismatch(1, 1), null);
  assert.match(countMismatch(1, 0), /^queue_items holds 0 items, the markdown 1 column-0 bullet/);
  assert.match(countMismatch(2, 5), /^queue_items holds 5 items, the markdown 2 column-0 bullets/);
});
