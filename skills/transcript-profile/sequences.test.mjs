import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {addFile, callsOf, newSequences, reportOf} from './sequences.mjs';

const call = (id, name, input) => ({
  type: 'assistant',
  message: {content: [{type: 'tool_use', id, name, input}]}
});
const answer = (id, content) => ({
  type: 'user',
  message: {content: [{type: 'tool_result', tool_use_id: id, content}]}
});

const PATH = 'projects/x/queue.md';
const session = (suffix = '') => [
  call(`a${suffix}`, 'mcp__v__search', {query: 'find the queue'}),
  answer(`a${suffix}`, `hit: ${PATH}`),
  call(`b${suffix}`, 'mcp__v__read', {path: PATH}),
  answer(`b${suffix}`, 'the long phrase in the note'),
  call(`c${suffix}`, 'Bash', {command: 'grep phrase'}),
  answer(`c${suffix}`, 'an extracted value'),
  call(`d${suffix}`, 'mcp__v__replace', {path: PATH, from: 'an extracted value', to: 'x'}),
  answer(`d${suffix}`, 'ok')
];

test('calls come in order, each once, with its result', () => {
  const rows = [
    call('a', 'Read', {path: 'p'}),
    call('a', 'Read', {path: 'p'}),
    call('b', 'Bash', {command: 'ls'}),
    answer('b', [{type: 'text', text: 'two'}]),
    answer('a', 'one')
  ];
  assert.deepEqual(
    callsOf(rows).map(c => [c.tool, c.result]),
    [
      ['Read', 'one'],
      ['Bash', 'two']
    ]
  );
});

test('a sub-agent row counts only when asked for', () => {
  const rows = [{...call('a', 'Read', {}), isSidechain: true}];
  assert.equal(callsOf(rows).length, 0);
  assert.equal(callsOf(rows, {includeSidechain: true}).length, 1);
});

test('sequences count the family, a repeat collapsed, ranked by files', () => {
  const s = newSequences('mcp__v__');
  addFile(s, 'one', callsOf(session()));
  addFile(s, 'two', callsOf(session('2')));
  const onlyOne = callsOf([
    call('e', 'mcp__v__read', {path: 'short'}),
    call('f', 'mcp__v__read', {path: 'short'}),
    call('g', 'mcp__v__list', {path: 'short'})
  ]);
  addFile(s, 'three', onlyOne);
  addFile(s, 'three-again', onlyOne);
  addFile(s, 'three-again-2', onlyOne);
  const r = reportOf(s, 20);
  assert.equal(r.files, 5);
  assert.equal(r.calls, 15);
  assert.deepEqual(r.sequences[2][0], {calls: ['read', 'list'], count: 3, files: 3});
  assert.ok(r.sequences[2].some(x => x.calls.join() === 'search,read' && x.count === 2));
  assert.deepEqual(r.sequences[3], [{calls: ['search', 'read', 'replace'], count: 2, files: 2}]);
});

test('a value is traced to the result that first held it, a local step to the call before it', () => {
  const s = newSequences('mcp__v__');
  addFile(s, 'one', callsOf(session()));
  const {values} = reportOf(s, 20);
  assert.deepEqual(values.map(v => [v.from, v.through, v.field, v.to]).sort(), [
    ['Bash', 'read', 'from', 'replace'],
    ['search', null, 'path', 'read'],
    ['search', null, 'path', 'replace']
  ]);
});

test('a value the earlier call was itself given is passed along, not picked from its result', () => {
  const rows = [
    call('a', 'mcp__v__read', {path: PATH}),
    answer('a', `read ${PATH}`),
    call('b', 'mcp__v__edit', {path: PATH}),
    answer('b', 'ok')
  ];
  const s = newSequences('mcp__v__');
  addFile(s, 'one', callsOf(rows));
  assert.deepEqual(reportOf(s, 20).values, []);
});

test('a short value and one past the look-back are not counted', () => {
  const far = [];
  for (let i = 0; i < 13; ++i) far.push(call(`x${i}`, 'Bash', {command: `step ${i}`}));
  const rows = [
    call('a', 'mcp__v__read', {path: 'a-long-enough-path'}),
    answer('a', 'names far-away-value and tiny'),
    ...far,
    call('b', 'mcp__v__edit', {path: 'far-away-value', id: 'tiny'}),
    answer('b', 'ok')
  ];
  const s = newSequences('mcp__v__');
  addFile(s, 'one', callsOf(rows));
  assert.deepEqual(reportOf(s, 20).values, []);
});

test('with no family every tool counts, under its own name', () => {
  const s = newSequences('');
  addFile(s, 'one', callsOf(session()));
  const r = reportOf(s, 20);
  assert.equal(r.calls, 4);
  assert.ok(r.sequences[2].some(x => x.calls.join() === 'mcp__v__read,Bash'));
});

test('the profiler reports them on --sequences, and only then', t => {
  const root = mkdtempSync(join(tmpdir(), 'sequences-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'proj'));
  const stamped = session().map((row, i) => ({
    ...row,
    timestamp: new Date(Date.parse('2026-11-01T00:00:00Z') + i * 1000).toISOString()
  }));
  writeFileSync(join(root, 'proj/s.jsonl'), stamped.map(r => `${JSON.stringify(r)}\n`).join(''));
  const script = fileURLToPath(new URL('./profile.mjs', import.meta.url));
  const run = args =>
    execFileSync(process.execPath, [script, '--root', root, ...args], {encoding: 'utf8'});
  const json = JSON.parse(run(['--json', '--sequences', '--tools', 'mcp__v__']));
  assert.equal(json.sequences.calls, 3);
  assert.equal(json.sequences.tools, 'mcp__v__');
  assert.equal(JSON.parse(run(['--json'])).sequences, undefined);
  const text = run(['--sequences', '--tools', 'mcp__v__']);
  assert.match(text, /search → read → replace/);
  assert.match(text, /Values one call passes to the next/);
  assert.doesNotMatch(text, /By total wall time/);
});
