// His ruling, 2026-11-05 (6e): a SKILL.md body past 3,000 words is considered for a split, and one
// past 5,000 is split. A consideration that keeps a skill whole is recorded in KEPT, with why.
// Run: node --test skill-size.test.mjs

import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';

// openai/skills' skill-creator: a body under about 5k words.
const SPLIT = 5000;
// swe_guidelines' bound, which D72's split used.
const CONSIDER = 3000;
// Fails once a skill is back under CONSIDER, so an entry cannot outlive its reason.
const KEPT = new Map([
  ['fleet-status', 'postponed with the other fleet-status work (the 2026-11-02 plan)']
]);

const root = new URL('./skills/', import.meta.url);

const wordsOf = text =>
  text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .split(/\s+/)
    .filter(Boolean).length;

test('a count leaves out the frontmatter and splits words on whitespace', () => {
  assert.equal(wordsOf('---\nname: x\ndescription: a b c\n---\none two\nthree\n'), 3);
  assert.equal(wordsOf('no frontmatter here'), 3);
});

for (const name of readdirSync(root)) {
  const words = wordsOf(readFileSync(new URL(`${name}/SKILL.md`, root), 'utf8'));
  test(`${name}'s SKILL.md body is at most ${SPLIT} words`, () =>
    assert.ok(
      words <= SPLIT,
      `${words} words: split it, moving a procedure or lookup material to a reference (D72)`
    ));
  if (KEPT.has(name)) {
    test(`${name} is still past ${CONSIDER} words, so its entry in KEPT holds`, () =>
      assert.ok(words > CONSIDER, `${words} words: drop ${name} from KEPT`));
    continue;
  }
  test(`${name}'s SKILL.md body is at most ${CONSIDER} words, or considered for a split`, () =>
    assert.ok(
      words <= CONSIDER,
      `${words} words: consider a split (D72); to keep it whole, add it to KEPT with why`
    ));
}
