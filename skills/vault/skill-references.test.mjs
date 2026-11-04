import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';

const skill = readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');

test('the skill names every reference file, and each one it names exists', () => {
  const named = new Set([...skill.matchAll(/`references\/([\w-]+\.md)`/g)].map(m => m[1]));
  assert.deepEqual(
    [...named].sort(),
    readdirSync(new URL('./references/', import.meta.url)).sort()
  );
});
