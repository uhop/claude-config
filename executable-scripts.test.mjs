// Run: node --test executable-scripts.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, statSync} from 'node:fs';

const root = new URL('.', import.meta.url);

test('every tracked script with a shebang runs by its path', () => {
  const tracked = execFileSync('git', ['ls-files', '--', '*.mjs', '*.sh'], {
    cwd: root,
    encoding: 'utf8'
  })
    .trim()
    .split('\n');
  const scripts = tracked.filter(path =>
    readFileSync(new URL(path, root), 'utf8').startsWith('#!')
  );
  assert.ok(scripts.length > 0);
  assert.deepEqual(
    scripts.filter(path => !(statSync(new URL(path, root)).mode & 0o100)),
    []
  );
});
