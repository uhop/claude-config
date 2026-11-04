import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {labelOf, SHORT_WAIT_MS, summarize, waitsOf} from './waits.mjs';

const MIN = 60_000;
const T0 = Date.parse('2026-11-01T00:00:00.000Z');
const at = minutes => new Date(T0 + minutes * MIN).toISOString();
const you = (minutes, text, extra = {}) => ({
  type: 'user',
  timestamp: at(minutes),
  message: {role: 'user', content: text},
  ...extra
});
const agent = (minutes, text) => ({
  type: 'assistant',
  timestamp: at(minutes),
  message: {role: 'assistant', content: [{type: 'text', text}]}
});
const tool = minutes => ({
  type: 'assistant',
  timestamp: at(minutes),
  message: {role: 'assistant', content: [{type: 'tool_use', id: 'x', name: 'Bash', input: {}}]}
});
const result = minutes => ({
  type: 'user',
  timestamp: at(minutes),
  message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'x', content: 'ok'}]}
});

test('a stop is labeled by what its last message asks for', () => {
  const subject = '---\n\n```\nFixed the project name in linked worktrees.\n```\n\n---';
  for (const [text, label] of [
    ['All gates are 0. Nothing is open.', 'report'],
    ['Done.\n\n' + subject, 'commit'],
    ['Done.\n\nShould I apply it? I would say yes, since it is small.', 'question'],
    ['Done.\n\nShould I apply it?\n\n' + subject, 'question+commit'],
    ['Run this:\n\n```bash\n! ssh host sudo restart\n```', 'command'],
    ['Run this, then tell me?\n\n```bash\n! ssh host sudo restart\n```', 'command+question'],
    ['A numbered list:\n\n16. **Move the worker?** I would say no.', 'question']
  ])
    assert.equal(labelOf(text), label, text);
});

test('what only looks like a stop keeps its plain label', () => {
  assert.equal(
    labelOf('An earlier "really?" here.\n\nThe closing paragraph asks nothing.'),
    'report'
  );
  assert.equal(labelOf('A block of code:\n\n```js\nconst a = 1;\nconst b = 2;\n```'), 'report');
  assert.equal(labelOf('```\nFixed the name.\n```\n\nA report follows the block.'), 'report');
  assert.equal(labelOf('A block alone:\n\n```\nwhat?\nand so on\n```'), 'report');
});

test('a session splits into working and waiting, each wait with its stop', () => {
  const s = waitsOf([
    you(0, 'start'),
    tool(1),
    result(3),
    agent(4, 'Should I go on?'),
    you(10, 'yes'),
    agent(12, 'Done.'),
    you(100, 'next'),
    agent(101, 'Bye.')
  ]);
  assert.equal(s.span_ms, 101 * MIN);
  assert.equal(s.waiting_ms, 94 * MIN);
  assert.equal(s.working_ms, 7 * MIN);
  assert.deepEqual(s.waits, [
    {ms: 6 * MIN, label: 'question'},
    {ms: 88 * MIN, label: 'report'}
  ]);
});

test('a message typed during a run is working, and an interrupt ends no wait', () => {
  const s = waitsOf([
    you(0, 'start'),
    agent(1, 'On it.'),
    you(2, 'also this', {queued: true}),
    agent(5, 'Done.'),
    you(6, '[Request interrupted by user]'),
    you(9, 'next'),
    agent(10, 'Ok.')
  ]);
  assert.deepEqual(s.waits, [{ms: 4 * MIN, label: 'report'}]);
});

test('a stop hook is the harness, so its row ends no wait', () => {
  const s = waitsOf([
    you(0, 'start'),
    agent(1, 'Done.'),
    you(2, 'Stop hook feedback:\n[bg-shells] a shell is live'),
    agent(3, 'It must keep running.'),
    you(8, 'next'),
    agent(9, 'Ok.')
  ]);
  assert.deepEqual(s.waits, [{ms: 5 * MIN, label: 'report'}]);
});

test('a slash command ends a wait, so a day away is not working', () => {
  const s = waitsOf([
    you(0, 'start'),
    agent(1, 'Done.'),
    you(1441, '<command-name>/vault</command-name><command-args>resume</command-args>'),
    agent(1442, 'Resumed.')
  ]);
  assert.deepEqual(s.waits, [{ms: 1440 * MIN, label: 'report'}]);
});

test('a harness row is no prompt, and a headless session has no waits', () => {
  const s = waitsOf([
    you(0, 'start'),
    agent(1, 'Done.'),
    you(5, 'a hand-back', {origin: {kind: 'peer'}}),
    agent(6, 'Noted.')
  ]);
  assert.deepEqual(s.waits, []);
  assert.equal(waitsOf([{...you(0, 'x'), entrypoint: 'sdk-cli'}, agent(1, 'y')]), null);
});

test('totals divide at the threshold, and each label carries its count, time, and median', () => {
  const s = summarize([
    {
      project: 'a',
      session: 's1',
      span_ms: 200 * MIN,
      working_ms: 100 * MIN,
      waiting_ms: 100 * MIN,
      waits: [
        {ms: 10 * MIN, label: 'question'},
        {ms: 20 * MIN, label: 'question'},
        {ms: SHORT_WAIT_MS, label: 'question'},
        {ms: 40 * MIN, label: 'report'}
      ]
    }
  ]);
  assert.equal(s.sessions, 1);
  assert.equal(s.waiting_ms, 100 * MIN);
  assert.deepEqual(s.short, {count: 2, ms: 30 * MIN});
  assert.deepEqual(s.long, {count: 2, ms: 70 * MIN});
  assert.deepEqual(s.labels.question, {
    count: 3,
    ms: 60 * MIN,
    median_ms: 20 * MIN,
    short_count: 2,
    short_ms: 30 * MIN
  });
});

test('the profiler reports the split, per session and in total', t => {
  const root = mkdtempSync(join(tmpdir(), 'waits-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'proj'));
  const rows = [you(0, 'start'), agent(1, 'Should I?'), you(11, 'yes'), agent(12, 'Done.')];
  writeFileSync(
    join(root, 'proj/abcdef12.jsonl'),
    rows.map(r => `${JSON.stringify(r)}\n`).join('')
  );
  const script = fileURLToPath(new URL('./profile.mjs', import.meta.url));
  const run = args =>
    execFileSync(process.execPath, [script, '--root', root, ...args], {encoding: 'utf8'});
  const json = JSON.parse(run(['--json']));
  assert.equal(json.waits.waiting_ms, 10 * MIN);
  assert.equal(json.waits.labels.question.count, 1);
  assert.deepEqual(
    json.waits.by_session.map(s => [s.project, s.session, s.waiting_ms]),
    [['proj', 'abcdef12', 10 * MIN]]
  );
  const text = run([]);
  assert.match(text, /Working and waiting/);
  assert.match(text, /\| question \|/);
});
