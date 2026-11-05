// A reference file no SKILL.md names goes unread, and a name with no file sends an agent nowhere.
// Run: node --test skill-references.test.mjs

import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';

const root = new URL('./skills/', import.meta.url);

for (const name of readdirSync(root)) {
  const references = new URL(`${name}/references/`, root);
  if (!existsSync(references)) continue;
  test(`${name} names every reference file, and each one it names exists`, () => {
    const skill = readFileSync(new URL(`${name}/SKILL.md`, root), 'utf8');
    const named = new Set([...skill.matchAll(/`references\/([\w-]+\.md)`/g)].map(m => m[1]));
    assert.deepEqual([...named].sort(), readdirSync(references).sort());
  });
}
