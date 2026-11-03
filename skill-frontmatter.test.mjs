// Run: node --test skill-frontmatter.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root = new URL('.', import.meta.url);

// Claude Code reads past these; Codex, Gemini CLI, and other strict YAML parsers do not.
const INVALID_PLAIN_SCALAR = /: |:$| #|^(?:[,[\]{}#&*!|>'"%@`]|[-?:] )/;

const problemOf = value => {
  if (/^[|>]/.test(value)) return null;
  if (/^'.*'$/.test(value)) return null;
  if (value.startsWith('"')) {
    try {
      JSON.parse(value);
      return null;
    } catch {
      return 'a double-quoted value that does not parse';
    }
  }
  return INVALID_PLAIN_SCALAR.test(value) ? 'a plain value a strict parser refuses' : null;
};

const problemsIn = text => {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return frontmatter
    .split('\n')
    .map(line => /^[A-Za-z][\w-]*: (.+)$/.exec(line))
    .filter(match => match !== null)
    .map(match => ({key: match[0].split(':')[0], problem: problemOf(match[1])}))
    .filter(found => found.problem !== null);
};

test('the rule refuses what a strict parser refuses, and passes the valid forms', () => {
  for (const line of ['a: b: c', 'a: b:', 'a: b #c', 'a: `b`', 'a: "b', 'a: - b']) {
    assert.equal(problemsIn(`---\n${line}\n---\n`).length, 1, line);
  }
  for (const line of ['a: b', 'a: b-c:d#e', 'a: "b: c"', "a: 'b: c'", 'a: >-', 'a: -b']) {
    assert.deepEqual(problemsIn(`---\n${line}\n---\n`), [], line);
  }
});

test('every skill and agent has frontmatter other tools can parse', () => {
  const files = execFileSync('git', ['ls-files', '--', 'skills/*/SKILL.md', 'agents/*.md'], {
    cwd: root,
    encoding: 'utf8'
  })
    .trim()
    .split('\n');
  assert.ok(files.length > 0);
  const found = files.flatMap(file =>
    problemsIn(readFileSync(new URL(file, root), 'utf8')).map(p => `${file}: ${p.key}`)
  );
  assert.deepEqual(found, []);
});
