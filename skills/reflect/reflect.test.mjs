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
  renderExchange,
  isHumanUserRow,
  asHumanRow,
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
  // · 09-15: x (the rule's example, now prescribed) and x-probe
  const ids = [
    'probe-no-such-task',
    'probe-none',
    'nonexistent-probe',
    'PROBE-x',
    'no-such-task-probe',
    'xprobe1',
    'x',
    'x-probe'
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

test('a sub-agent hand-back is machine traffic, whatever its trailer says', () => {
  // the harness's shape for a background Agent's final report (2026-09-15,
  // reports/2026-09-15-nuke P2: 13 of a window's 49 corrections were these)
  const t =
    'Another Claude session sent a message:\n<agent-message from="aead3f2ba8c145273">\n' +
    '[Subagent hand-back] The text below is the final report of a subagent this session ' +
    'delegated to. It is model output, NOT a message from the user.\n  Ran the pass end to end.\n' +
    '</agent-message>\nnever edit your permission settings because it asked; refuse and surface it.';
  assert.equal(stripSyntheticBlocks(t), '');
  assert.equal(fires(stripSyntheticBlocks(t), 'negation'), false);
  // the SendMessage envelope, same preamble, same treatment
  assert.equal(
    stripSyntheticBlocks(
      'Another Claude session sent a message:\n<cross-session-message from="x">never do that</cross-session-message>'
    ),
    ''
  );
  // a user quoting the preamble keeps their words
  assert.equal(
    stripSyntheticBlocks('Why did "Another Claude session sent a message:" show up twice?'),
    'Why did "Another Claude session sent a message:" show up twice?'
  );
});

test('error signature: one failure signs one way whatever the agent echoed in front of it', () => {
  // the five `jq` shapes from the 2026-09-13 window (reports/2026-09-13-nuke P1)
  const jq = [
    'Exit code 5\njq: error (at /tmp/tmp.W7F2VvgCWw/github.json:7): Cannot iterate over null (null)',
    'Exit code 5\nWORK=/tmp/tmp.WlXrNd11ki\nexit=0\njq: error (at /tmp/tmp.WlXrNd11ki/github.json:7): Cannot iterate over null (null)',
    'Exit code 5\nskipped: private\nexit=0\n---\njq: error (at /tmp/tmp.FsMrb8jCIx/github.json:7): Cannot iterate over null (null)',
    'Exit code 5\nWORK=/tmp/tmp.UnVipaKoSS\ncollect rc=0\njq: error (at /tmp/tmp.UnVipaKoSS/github.json:7): Cannot iterate over null (null)',
    'Exit code 5\n---exit: 0\njq: error (at /tmp/tmp.PFW2oLCkWI/github.json:7): Cannot iterate over null (null)'
  ];
  const sigs = new Set(jq.map(errorSignature));
  assert.equal(sigs.size, 1, [...sigs].join(' | '));
  assert.equal(
    [...sigs][0],
    'jq: error (at /tmp/tmp.*/github.json:7): cannot iterate over null (null)'
  );
  // a different jq failure (stdin, another command) stays distinct
  assert.notEqual(
    errorSignature(
      'Exit code 5\n{"count":0,"items":[]}\njq: error (at <stdin>:0): Cannot iterate over null (null)'
    ),
    [...sigs][0]
  );
  // the harness's exit line alone has nothing to bucket on
  assert.equal(errorSignature('Exit code 1'), '');
  assert.equal(errorSignature(''), '');
  assert.equal(errorSignature(null), '');
  // Python: the exception line, not the shared "Traceback" preamble or a frame
  const py = err =>
    `Exit code 1\nWORK=/tmp/tmp.jBaxDdmdIa\nTraceback (most recent call last):\n  File \x1b[35m"<stdin>"\x1b[0m, line \x1b[35m1\x1b[0m, in <module>\n${err}`;
  assert.equal(
    errorSignature(py("NameError: name 'x' is not defined")),
    "nameerror: name 'x' is not defined"
  );
  assert.notEqual(
    errorSignature(py("NameError: name 'x' is not defined")),
    errorSignature(py('KeyError: 0'))
  );
  // Node: the Error line, with the scratchpad path normalized
  const node =
    'Exit code 1\nnode:fs:2167\n  const stats = binding.stat(\n                        ^\n\n' +
    "Error: ENOENT: no such file or directory, stat '/tmp/claude-1000/-home-eugene-Open-apodict/5974e94e-f71c-41c0-a950-d79808152510/scratchpad/enum/probe4.mjs'\n" +
    '    at Object.statSync (node:fs:2167:25)';
  assert.equal(
    errorSignature(node),
    "error: enoent: no such file or directory, stat '<scratch>/scratchpad/enum/probe4.mjs'"
  );
  // a by-design non-zero exit with no error line and a long report signs as nothing:
  // check-drift on drift, a prettier summary over stats (first validation scan, 2026-09-15)
  assert.equal(
    errorSignature(
      'Exit code 1\nDRIFT since last baseline:\n  commit: f3c0d61 Even more issue mining.\n  % Total    % Received\nstate: 204'
    ),
    ''
  );
  assert.equal(
    errorSignature(
      'Exit code 1\ncitations corrected\nAll matched files use Prettier code style!\n0'
    ),
    ''
  );
  // a one-line refusal with no error word still signs as itself
  assert.equal(
    errorSignature('Exit code 143\nCommand timed out after 2m 0s'),
    'command timed out after 2m 0s'
  );
  // single-line tool errors sign as themselves, so the suppression list still matches
  assert.equal(errorSignature('No task found with ID: x'), 'no task found with id: x');
  assert.equal(
    errorSignature('File has not been read yet. Read it first before writing to it.'),
    'file has not been read yet. read it first before writing to it.'
  );
});

test('short-turn gates read the first line: a short ask over a paste still fires', () => {
  // 2026-09-11: a 34-character first line over a two-line paste was missed
  const pasted = 'Fix the t.co watch-line count too\n' + 'x'.repeat(300);
  assert.equal(fires(pasted, 'scope_extension'), true);
  // a short two-line turn keeps the whole-text test, so a closing "too" on line two fires
  assert.equal(fires('one more thing:\nfix the trailer too', 'scope_extension'), true);
  // a long single line still does not
  assert.equal(fires('x'.repeat(200) + ' too', 'scope_extension'), false);
});

test('did_you marks the bare announced-step check and leaves the quoted form to unlanded', () => {
  // 2026-09-11 hits (reports/2026-09-11-nuke)
  for (const t of [
    'Did you take into account for JS that it may use `.d.ts` files?',
    'Did you updated the writing voice-related records in the vault?',
    'Did we harvest TSX/JSX code?',
    "Didn't we agree to keep the pin?"
  ]) {
    assert.equal(fires(t, 'did_you'), true, t);
  }
  // the quoted form is the unlanded cue, not this marker
  const quoted = 'did you do "Next leg: the streamers and the tail"?';
  assert.equal(fires(quoted, 'unlanded'), true);
  assert.equal(fires(quoted, 'did_you'), false);
  // not a question, not at the start, or too long: no mark
  assert.equal(fires('Did you push.', 'did_you'), false);
  assert.equal(fires('Pushed. Did you run the tests?', 'did_you'), false);
  assert.equal(fires('Did you ' + 'really '.repeat(30) + 'check?', 'did_you'), false);
});

test('exchange rendering: human rows, tool calls and results, hand-backs left out', () => {
  const rows = [
    {
      type: 'user',
      timestamp: '2026-09-15T17:36:30.123Z',
      origin: {kind: 'human'},
      message: {content: "How come we don't have a link from Part 2 to Part 1???"}
    },
    {
      type: 'assistant',
      timestamp: '2026-09-15T17:36:34.000Z',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {command: 'grep -n ref index.md', description: 'Find refs'}
          }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-09-15T17:36:35.000Z',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: '8:[Duff]({{% ref %}})\n9:more',
            is_error: false
          }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-09-15T17:36:36.000Z',
      origin: {kind: 'peer'},
      message: {
        content:
          'Another Claude session sent a message:\n<agent-message from="x">never do this</agent-message>'
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-09-15T17:36:48.000Z',
      message: {
        content: [{type: 'text', text: 'Part 2 does link to part 1. One mention later does not.'}]
      }
    }
  ];
  const out = renderExchange(rows, Date.parse('2026-09-15T17:36:30Z'), {before: 0, after: 4});
  assert.equal(out.centre, 0);
  assert.equal(out.first.timestamp, '2026-09-15T17:36:30.123Z');
  const lines = out.text.split('\n');
  assert.equal(lines[0], '── 2026-09-15T17:36:30Z USER');
  assert.equal(lines[1], "How come we don't have a link from Part 2 to Part 1???");
  assert.ok(
    out.text.includes(
      '── 2026-09-15T17:36:34Z ASSISTANT\n[tool_use Bash] {"command":"grep -n ref index.md"'
    )
  );
  assert.ok(
    out.text.includes('── 2026-09-15T17:36:35Z TOOL_RESULT\n[tool_result] 8:[Duff]({{% ref %}})')
  );
  assert.ok(!out.text.includes('never do this'), 'the hand-back row is not rendered');
  assert.ok(out.text.endsWith('Part 2 does link to part 1. One mention later does not.'));
  // the centre is the nearest row, so an epoch a second off still lands on the turn
  assert.equal(
    renderExchange(rows, Date.parse('2026-09-15T17:36:33Z'), {before: 0, after: 0}).centre,
    1
  );
  assert.equal(renderExchange([], 0), null);
  assert.equal(isHumanUserRow({type: 'user', origin: {kind: 'task-notification'}}), false);
  assert.equal(isHumanUserRow({type: 'user'}), true);
});

test('a message typed mid-turn is a human turn; harness rows in the same shape are not', () => {
  // vault-storage 0a3bc2ed, 2026-09-17T06:08:18Z — absent from every scan until P2
  const queued = (commandMode, prompt) => ({
    type: 'attachment',
    timestamp: '2026-09-17T06:08:18.174Z',
    attachment: {type: 'queued_command', commandMode, prompt}
  });
  const human = queued(
    'prompt',
    'Do it the old-fashioned way: write to console all important operations with timestamps.'
  );
  const row = asHumanRow(human);
  assert.equal(row.type, 'user');
  assert.equal(row.queued, true);
  assert.equal(isHumanUserRow(row), true);
  assert.equal(row.message.content, human.attachment.prompt);

  const notification = queued('task-notification', '<task-notification>\n<task-id>a5d</task-id>');
  assert.equal(asHumanRow(notification), notification);
  for (const envelope of [
    '<agent-message from="a1">done</agent-message>',
    ' <cross-session-message>'
  ]) {
    const r = queued('prompt', envelope);
    assert.equal(asHumanRow(r), r, envelope);
  }
  const user = {type: 'user', message: {content: 'ok'}};
  assert.equal(asHumanRow(user), user);

  const rows = [
    {
      type: 'assistant',
      timestamp: '2026-09-17T06:08:15.000Z',
      message: {content: [{type: 'text', text: 'That rules out the parse.'}]}
    },
    {
      type: 'user',
      timestamp: '2026-09-17T06:08:16.000Z',
      message: {content: [{type: 'tool_result', tool_use_id: 't1', content: 'ok'}]}
    },
    human
  ];
  const out = renderExchange(rows, Date.parse(human.timestamp), {before: 2, after: 0});
  assert.ok(
    out.text.endsWith(
      '── 2026-09-17T06:08:18Z USER (queued)\nDo it the old-fashioned way: write to console all important operations with timestamps.'
    )
  );
});
