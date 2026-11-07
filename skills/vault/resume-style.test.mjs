// Run: node --test skills/vault/resume-style.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {styledOf, withoutControls} from './resume-style.mjs';

test('escape sequences go whole, whichever kind they are', () => {
  const cases = {
    'a \x1b[8mstyle\x1b[28m b': 'a style b',
    'a \x1b[3A\x1b[2Jcursor b': 'a cursor b',
    'a \x1b]8;;http://x/\x07link\x1b]8;;\x07 b': 'a link b',
    'a \x1b]8;;http://x/\x1b\\link\x1b]8;;\x1b\\ b': 'a link b',
    'a \x1b]0;title\x07b': 'a b',
    'a \x1b]52;c;UFdORUQ=\x07b': 'a b',
    'a \x1bcb': 'a b',
    'a \x1b(Bb': 'a b'
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(withoutControls(text), expected);
  }
});

test('no escape byte survives, even where removing a sequence joins two pieces', () => {
  assert.equal(withoutControls('\x1b\x1b[0m[8m'), '[8m');
  assert.equal(withoutControls('a\x1b'), 'a');
  assert.equal(withoutControls('\x1b]8;;http://é/\x07'), '8;;http://é/');
});

test('other control bytes go, and text stays', () => {
  assert.equal(withoutControls('a\rb\bc\x7fd\x9b1me\0f'), 'abcd1mef');
  const text = 'tab\there\nnew line — “quoted” • é 日本語 🙂';
  assert.equal(withoutControls(text), text);
});

test('headings, bullets, and labels take their styles, and lines keep their places', () => {
  const styled = styledOf('# p\n\n## Open\nFrom the last log:\n- An item\nPlan: a note\nDone.');
  assert.deepEqual(styled.split(/\r?\n/), [
    '\x1b[1;38;5;75mp\x1b[0m',
    '',
    '\x1b[1;38;5;252mOpen\x1b[0m',
    '\x1b[3mFrom the last log:\x1b[23m',
    ' • An item',
    'Plan: a note',
    'Done.'
  ]);
});

test('inline code, bold, and italics take their styles, in a bullet too', () => {
  assert.equal(styledOf('a `b` c'), 'a \x1b[36mb\x1b[39m c');
  assert.equal(styledOf('a **b** c'), 'a \x1b[1mb\x1b[22m c');
  assert.equal(styledOf('a *b c* d'), 'a \x1b[3mb c\x1b[23m d');
  assert.equal(styledOf('- `b`'), ' • \x1b[36mb\x1b[39m');
});

test('code inside bold keeps both, and stars inside code stay stars', () => {
  assert.equal(styledOf('**a `b` c**'), '\x1b[1ma \x1b[36mb\x1b[39m c\x1b[22m');
  assert.equal(styledOf('`*.js` and `**`'), '\x1b[36m*.js\x1b[39m and \x1b[36m**\x1b[39m');
});

test('markers that open nothing stay as they are', () => {
  for (const text of ['a*b', '*.sh and *.js', '2 * 3 * 4', 'a ` b', '** a']) {
    assert.equal(styledOf(text), text);
  }
});
