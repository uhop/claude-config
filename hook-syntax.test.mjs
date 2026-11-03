// Run: node --test hook-syntax.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root = new URL('.', import.meta.url);

// Bash 3.2, macOS's /bin/bash, can fail to parse a heredoc inside `$( … )` or `<( … )`, depending
// on its text. The syntax error exits 2, which a PreToolUse hook's contract reads as a block on
// every call, and no Linux run shows it: ca3f3a5 did this on 2026-10-30.
const HEREDOC_IN_SUBSTITUTION = /[$<]\([^)\n]*<<-?\s*['"]?[A-Za-z_]/;

test('the pattern finds both forms, and leaves a function call alone', () => {
  assert.ok(HEREDOC_IN_SUBSTITUTION.test(`v=$(python3 - <<'PY' 2>/dev/null`));
  assert.ok(
    HEREDOC_IN_SUBSTITUTION.test(`done < <(CMD="$cmd" python3 - "$lib" <<'PY' 2>/dev/null`)
  );
  assert.equal(HEREDOC_IN_SUBSTITUTION.test(`  python3 - "$lib" <<'PY' 2>/dev/null`), false);
  assert.equal(HEREDOC_IN_SUBSTITUTION.test(`found=$(reserved_verbs)`), false);
});

test('no hook puts a heredoc inside a substitution', () => {
  const files = execFileSync('git', ['ls-files', '--', 'hooks/*.sh', 'hooks/lib/*.sh'], {
    cwd: root,
    encoding: 'utf8'
  })
    .trim()
    .split('\n')
    .filter(f => !f.includes('/test/'));
  assert.ok(files.length > 0);
  const found = files.flatMap(file =>
    readFileSync(new URL(file, root), 'utf8')
      .split('\n')
      .flatMap((line, i) => (HEREDOC_IN_SUBSTITUTION.test(line) ? [`${file}:${i + 1}`] : []))
  );
  assert.deepEqual(found, []);
});
