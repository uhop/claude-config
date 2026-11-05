// Run: node --test skill-frontmatter.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root = new URL('.', import.meta.url);

// Anthropic's skill authoring best practices: "Maximum 1,024 characters".
const DESCRIPTION_MAX = 1024;

const descriptionOf = text => {
  const lines = (/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '').split('\n');
  const i = lines.findIndex(line => line.startsWith('description:'));
  if (i < 0) return '';
  const value = lines[i].slice('description:'.length).trim();
  if (/^[|>]/.test(value)) {
    const block = [];
    for (let j = i + 1; j < lines.length && /^(?:\s+\S|\s*$)/.test(lines[j]); ++j)
      block.push(lines[j].trim());
    return block.filter(Boolean).join(value.startsWith('>') ? ' ' : '\n');
  }
  if (value.startsWith('"')) return JSON.parse(value);
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replaceAll("''", "'");
  return value;
};

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

test('a description is read from each frontmatter form', () => {
  assert.equal(descriptionOf('---\ndescription: a b\n---\n'), 'a b');
  assert.equal(descriptionOf('---\ndescription: "a \\"b\\""\n---\n'), 'a "b"');
  assert.equal(descriptionOf("---\ndescription: 'it''s'\n---\n"), "it's");
  assert.equal(descriptionOf('---\ndescription: >-\n  a b\n  c\nname: x\n---\n'), 'a b c');
});

test(`every skill's description is at most ${DESCRIPTION_MAX} characters`, () => {
  const files = execFileSync('git', ['ls-files', '--', 'skills/*/SKILL.md'], {
    cwd: root,
    encoding: 'utf8'
  })
    .trim()
    .split('\n');
  const over = files
    .map(file => [file, descriptionOf(readFileSync(new URL(file, root), 'utf8')).length])
    .filter(([, length]) => length > DESCRIPTION_MAX)
    .map(([file, length]) => `${file}: ${length}`);
  assert.deepEqual(over, []);
});
