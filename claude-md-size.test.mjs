// The global CLAUDE.md loads into every session beside the project's imported AGENTS.md (D89).
// Run: node --test claude-md-size.test.mjs

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

// Claude Code's total for instruction files on a 200k-token window, read from its 2.1.332 binary.
const TOTAL = 120000;
// The fleet imports AGENTS.md only below this many bytes (D81).
const AGENTS_MD = 30000;
const LIMIT = TOTAL - AGENTS_MD;

const text = readFileSync(new URL('./CLAUDE.md', import.meta.url), 'utf8');

test(`CLAUDE.md leaves room for an imported AGENTS.md: at most ${LIMIT} characters`, () =>
  assert.ok(
    text.length <= LIMIT,
    `${text.length} characters: move reasons and history to the origins notes (D89)`
  ));
