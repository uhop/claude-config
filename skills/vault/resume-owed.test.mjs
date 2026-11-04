// The rules of a resume's owed list. Run: node --test skills/vault/resume-owed.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {owedOf, POSSIBLY_STALE_READ_BYTES, STALL_ITEM} from './resume-owed.mjs';

const QUEUE = 'projects/p/queue.md';

const handoff = (id, status) => ({
  id,
  kind: status === 'open' ? 'apply-patch' : 'run-check',
  to: 'repo:github.com/o/p',
  from: 'h/s',
  status,
  created: '2026-10-25T00:00:00.000Z',
  updated: '2026-10-26T00:00:00.000Z',
  body_first_line: `Do ${id}.`
});

const file = (name, extra = {}) => ({
  file_path: `projects/p/${name}.md`,
  summary_stale: false,
  body_bytes: 1000,
  ...extra
});

const files = (...entries) => Object.fromEntries(entries.map(([name, f]) => [name, f]));

const quiet = (extra = {}) => ({
  name: 'p',
  sessions: {unlogged: []},
  handoffs: {open: [], returned: []},
  files: files(['feedback', file('feedback')], ['queue', file('queue')], ['decisions', null]),
  notices: [],
  changes: null,
  logs: [],
  trackers: {problems: []},
  ...extra
});

const bundleOf = (project, stalls = null) => ({project, stalls});

const write = (path, changed) => ({path, title: null, modified_at: 'x', changed});

test('a quiet project owes nothing', () => {
  assert.deepEqual(owedOf(bundleOf(quiet())), []);
  assert.deepEqual(owedOf(bundleOf(null)), [], 'and no project, nothing');
});

test('every kind, in the order the skill takes them, each target what its call takes', () => {
  const owed = owedOf(
    bundleOf(
      quiet({
        trackers: {problems: ['an unknown kind: gitlab']},
        files: files(['decisions', file('decisions')]),
        changes: {
          since: {ended: 'x', holder: 'h'},
          notes: [write('projects/p/decisions.md', {body: true, agent: false, frontmatter: []})]
        },
        handoffs: {open: [handoff('h1', 'open')], returned: [handoff('h2', 'returned')]},
        sessions: {
          unlogged: [
            {
              ended: '2026-10-25T10:00:00Z',
              holder: 'host/aaaa',
              reason: 'exit',
              file: 'projects/p/data/sessions/2026-10.jsonl'
            }
          ]
        }
      }),
      {count: 3, latestAt: '2026-10-26T01:00:00.000Z'}
    ),
    [
      {
        kind: 'upstream',
        title: 'Mirror.',
        source: 'github o/p#1',
        path: 'projects/p/queue/mirror.md'
      },
      {kind: 'triage', title: 'New.', path: 'projects/p/queue/new.md'},
      {kind: 'place', title: 'Late.', filed: '2026-11-01', path: 'projects/p/queue/late.md'}
    ]
  );
  assert.deepEqual(owed, [
    {
      kind: 'log',
      target: {
        path: 'projects/p/data/sessions/2026-10.jsonl',
        holder: 'host/aaaa',
        ended: '2026-10-25T10:00:00Z'
      },
      why: 'ended 2026-10-25T10:00:00Z by exit with no log'
    },
    {
      kind: 'handoff',
      target: 'h1',
      why: 'a apply-patch from h/s, open since 2026-10-25T00:00:00.000Z: Do h1.'
    },
    {
      kind: 'rework',
      target: 'h2',
      why: 'a run-check to repo:github.com/o/p, returned 2026-10-26T00:00:00.000Z'
    },
    {kind: 'upstream', target: 'mirror', why: 'it mirrors github o/p#1: Mirror.'},
    {kind: 'triage', target: 'new', why: 'it waits in the Inbox: New.'},
    {kind: 'place', target: 'late', why: 'it entered the Backlog on 2026-11-01: Late.'},
    {
      kind: 'read',
      target: 'projects/p/decisions.md',
      why: 'its body changed since the last session'
    },
    {
      kind: 'fix-trackers',
      target: 'projects/p/queue/_about.md',
      why: 'its trackers: an unknown kind: gitlab'
    },
    {
      kind: 'file-stalls',
      target: STALL_ITEM,
      why: '3 loop stalls in the past week, the latest at 2026-10-26T01:00:00.000Z'
    }
  ]);
});

test('one read a note, its reasons merged once each; feedback never read for its summary', () => {
  const stale = {
    summary_stale: true,
    summaryPossiblyStale: true,
    summaryUnchanged: {since: '2026-10-01T00:00:00.000Z', writes: 12}
  };
  const owed = owedOf(
    bundleOf(
      quiet({
        files: files(['feedback', file('feedback', stale)], ['queue', file('queue', stale)]),
        changes: {since: {ended: 'x', holder: 'h'}, notes: [write(QUEUE, {created: true})]},
        logs: [
          {file_path: 'logs/a.md', summary_stale: true},
          {file_path: 'logs/b.md', summary_stale: false},
          {file_path: null, summary_stale: true}
        ],
        notices: [
          {file: 'queue', type: 'supersedes', by: {file_path: 'projects/p/plan.md'}},
          {file: 'decisions', type: 'contradicts', by: {file_path: 'projects/p/plan.md'}},
          {file: 'queue', type: 'supersedes', by: {file_path: null}}
        ]
      }),
      {count: 1, latestAt: 'x', filedBy: 'server'}
    )
  );
  assert.deepEqual(owed, [
    {
      kind: 'read',
      target: 'projects/p/plan.md',
      why: 'it supersedes projects/p/queue.md; it contradicts projects/p/decisions.md'
    },
    {
      kind: 'read',
      target: QUEUE,
      why: 'its summary predates its body; its summary has stood through 12 writes since 2026-10-01T00:00:00.000Z; made since the last session'
    },
    {kind: 'read', target: 'logs/a.md', why: 'its summary predates its body'}
  ]);
});

test('a possibly stale summary owes a read under 64 KB, and none at it', () => {
  const possibly = bytes =>
    quiet({
      files: files([
        'queue',
        file('queue', {
          summaryPossiblyStale: true,
          summaryUnchanged: {since: 'x', writes: 3},
          body_bytes: bytes
        })
      ])
    });
  assert.equal(owedOf(bundleOf(possibly(POSSIBLY_STALE_READ_BYTES - 1))).length, 1);
  assert.deepEqual(owedOf(bundleOf(possibly(POSSIBLY_STALE_READ_BYTES))), []);
});

test('a piece of a folder note owes no read; the note itself does, unless only frontmatter changed', () => {
  assert.deepEqual(
    owedOf(
      bundleOf(
        quiet({
          changes: {
            since: {ended: 'x', holder: 'h'},
            notes: [
              write('projects/p/decisions/0001-x.md', {created: true}),
              write('projects/p/decisions/0002-y.md', {body: true, agent: false, frontmatter: []}),
              write('projects/p/decisions/0003-z.md', null),
              write('projects/p/decisions/_about.md', null),
              write(QUEUE, {body: false, agent: true, frontmatter: ['tags']}),
              write('projects/p/stack.md', {body: true, agent: false, frontmatter: []}),
              write('projects/p/learnings.md', null)
            ]
          },
          files: files(
            ['decisions', file('decisions')],
            ['queue', file('queue')],
            ['stack', file('stack')],
            ['learnings', file('learnings')]
          )
        })
      )
    ),
    [
      {
        kind: 'read',
        target: 'projects/p/stack.md',
        why: 'its body changed since the last session'
      },
      {
        kind: 'read',
        target: 'projects/p/learnings.md',
        why: 'written since the last session, what changed unknown'
      }
    ]
  );
});

test('a summary whose text changed lately owes no read for it', () => {
  assert.deepEqual(
    owedOf(
      bundleOf(
        quiet({
          files: files([
            'decisions',
            file('decisions', {summaryUnchanged: {since: 'x', writes: 1}})
          ])
        })
      )
    ),
    []
  );
});

test('stalls the server files owe nothing; with no project, the stalls alone', () => {
  assert.deepEqual(owedOf(bundleOf(null, {count: 2, latestAt: 'a', filedBy: 'server'})), []);
  assert.deepEqual(owedOf(bundleOf(null, {count: 2, latestAt: 'a'})), [
    {
      kind: 'file-stalls',
      target: STALL_ITEM,
      why: '2 loop stalls in the past week, the latest at a'
    }
  ]);
});

test('the script runs by its path, as the vault skill calls it', () => {
  assert.ok(statSync(new URL('./resume-owed.mjs', import.meta.url)).mode & 0o100);
});
