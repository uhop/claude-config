// A SKILL.md body past 3,000 words: swe_guidelines' bound, not measured here (D72, 6e).
// Run: node --test skill-size.test.mjs

import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';

const BOUND = 3000;
// Postponed by his ruling (the 2026-11-02 plan); the test fails once it is under, so the exception goes.
const EXCEPTIONS = new Set(['fleet-status']);

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
  if (EXCEPTIONS.has(name)) {
    test(`${name} is still past the bound, so its exception still holds`, () =>
      assert.ok(words > BOUND, `${words} words: drop ${name} from EXCEPTIONS`));
    continue;
  }
  test(`${name}'s SKILL.md body is at most ${BOUND} words`, () =>
    assert.ok(
      words <= BOUND,
      `${words} words: move a procedure or lookup material to a reference, keeping what must change behavior (D72)`
    ));
}
