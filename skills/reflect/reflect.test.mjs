// Wording-invariance fixtures for the /reflect classifier and its suppression
// list (filed 2026-09-05 from the foremerge analysis: a verdict must not depend
// on how a turn or an error happens to be spelled). Run: node --test skills/reflect/
//
// Every rule change adds its spellings here instead of shipping another
// one-off patch. Each fixture names the run or turn it comes from.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyUserTurn,
  errorSignature,
  isSuppressed,
  isAutomatedEntrypoint,
  firstLine,
  stripSyntheticBlocks,
  USER_TURN_LINE_MAX
} from './reflect-lib.mjs';

const fires = (text, family) => classifyUserTurn(text)[family];

test('why-cue: every negated auxiliary spelling fires observational', () => {
  const turns = [
    "Why didn't we test PostGres?", // apodict 53989575, 2026-08-25 — the miss that filed the item
    'Why did we skip the C++ corpus?',
    "Why doesn't the sweep archive it?",
    "Why wasn't the baseline recorded?",
    "Why weren't the other two fixed?",
    "Why don't you run the tests first?",
    'Why not measure it?',
    'why did you import it without reading it',
    'We shipped this on the 12th, yet we never talked about it. Why?'
  ];
  for (const t of turns) assert.equal(fires(t, 'observational'), true, t);
});

test('why-cue: explanatory "why" does not fire', () => {
  for (const t of ['The reason why it works is the cache.', 'Why is the sky blue']) {
    assert.equal(fires(t, 'observational'), false, t);
  }
});

test('correction families: known real turns still fire their family', () => {
  const cases = [
    ["don't import random files without inspecting them first!", 'negation'],
    ['Never print it again', 'negation'],
    ['stop creating excuses', 'negation'],
    ['instead of a worktree, edit directly', 'observational'],
    ['you still wrap it in a card', 'unlanded'],
    ['"// null -> Do stops" still wraps.', 'unlanded'],
    ['did you do "Next leg: the streamers and the tail"?', 'unlanded'],
    ['fix the trailer too', 'scope_extension'],
    ['do the rest', 'scope_extension'],
    ['finish wiki-search, then do double-meh', 'scope_extension'],
    ['Did you fix the bail-out bug in browser?', 'scope_extension'],
    ['yes, exactly', 'confirmation'],
    ['TIL node --check executes nothing', 'surprise']
  ];
  for (const [t, family] of cases) assert.equal(fires(t, family), true, `${family}: ${t}`);
});

test('scope extension is gated on turn length', () => {
  const long = 'x'.repeat(200) + ' too';
  assert.equal(fires(long, 'scope_extension'), false);
  assert.equal(fires('fix it too', 'scope_extension'), true);
});

test('suppression: every spelling of the registry-probe id is suppressed', () => {
  // 2026-08-29: probe-no-such-task · 08-30: probe-none · 09-03: nonexistent-probe
  const ids = [
    'probe-no-such-task',
    'probe-none',
    'nonexistent-probe',
    'PROBE-x',
    'no-such-task-probe',
    'xprobe1'
  ];
  for (const id of ids) {
    const sig = errorSignature(
      `No task found with ID: ${id}. Running background agents: abc123 (analyst-1), def456 (analyst-2)`
    );
    assert.equal(isSuppressed(sig), true, id);
  }
  // key form used by Pass 2: tool::fingerprint::signature, lowercased
  assert.equal(
    isSuppressed(`taskstop::deadbeef::${errorSignature('No task found with ID: probe-none')}`),
    true
  );
});

test('suppression: a real missing-task id is not suppressed', () => {
  for (const id of ['7f3a2c1e', 'build', 'a0f1c0de-0000-4000-8000-000000000001']) {
    const sig = errorSignature(`No task found with ID: ${id}`);
    assert.equal(isSuppressed(sig), false, id);
  }
});

test('suppression: the read-before-edit class, and its near miss', () => {
  assert.equal(
    isSuppressed(errorSignature('File has not been read yet. Read it first before writing to it.')),
    true
  );
  assert.equal(
    isSuppressed(
      errorSignature('File has been modified since read, either by the user or by a linter.')
    ),
    false
  );
});

test('session population: sdk-cli is automated, cli and absent are human', () => {
  assert.equal(isAutomatedEntrypoint('sdk-cli'), true);
  assert.equal(isAutomatedEntrypoint('cli'), false);
  assert.equal(isAutomatedEntrypoint(undefined), false);
  assert.equal(isAutomatedEntrypoint(null), false);
  assert.equal(isAutomatedEntrypoint(''), false);
});

test('user-turn listing: the first line is capped, the turn is never hidden', () => {
  // 2026-08-30: a one-line request over a 1.2 KB paste keeps its line
  const pasted =
    'Could you close the pane you used to run measurements? BTW, I see it has errors:\n' +
    'E'.repeat(1200);
  assert.equal(
    firstLine(pasted),
    'Could you close the pane you used to run measurements? BTW, I see it has errors:'
  );
  // 2026-09-04: a 326-character single-line ruling is truncated, not dropped
  const ruling = 'general engine work first, '.repeat(13).trim();
  assert.ok(ruling.length > USER_TURN_LINE_MAX);
  const shown = firstLine(ruling);
  assert.equal(shown.length, USER_TURN_LINE_MAX);
  assert.ok(shown.endsWith('…'));
  assert.equal(firstLine(''), '');
  assert.equal(firstLine('  Pushed.  \nNotes: …'), 'Pushed.');
});

test('synthetic blocks are stripped before classification', () => {
  const t =
    '<system-reminder>never do X</system-reminder>\n<command-message>vault</command-message>\nok';
  assert.equal(stripSyntheticBlocks(t), 'ok');
  assert.equal(
    fires(t, 'negation'),
    true,
    'raw text fires, which is why the strip must come first'
  );
  assert.equal(fires(stripSyntheticBlocks(t), 'negation'), false);
});

test('a slash command collapses to its command line, never to the injected skill body', () => {
  // the harness's shape for a user-typed `/vault wrap` (2026-09-05)
  const t =
    '<command-message>vault</command-message>\n<command-name>/vault</command-name>\n' +
    '<command-args>wrap</command-args>\nBase directory for this skill: /home/eugene/.claude/skills/vault\n\n' +
    '# Knowledge Base\n\nNever rewrite a whole document to change one frontmatter key. ' +
    "Don't grow this list lightly.\n".repeat(200);
  assert.equal(stripSyntheticBlocks(t), '/vault wrap');
  assert.equal(fires(stripSyntheticBlocks(t), 'negation'), false);
  // no args, and a command with no expansion at all
  assert.equal(
    stripSyntheticBlocks(
      '<command-message>reflect</command-message>\n<command-name>/reflect</command-name>'
    ),
    '/reflect'
  );
  // the user's own words beside a command survive as the human content
  assert.equal(
    stripSyntheticBlocks('<command-name>/x</command-name>\nplease also check the trailer'),
    'please also check the trailer'
  );
});
