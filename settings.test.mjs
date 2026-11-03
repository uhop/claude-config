// Run: node --test settings.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('settings.json stays in the form the plugin CLI writes through its symlink', () => {
  const text = readFileSync(new URL('./settings.json', import.meta.url), 'utf8');
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
});
