// The rules of what a resume lists. Run: node --test skills/vault/resume-owed.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {owedOf, STALL_ITEM} from './resume-owed.mjs';

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

const quiet = (extra = {}) => ({
  name: 'p',
  handoffs: {open: [], returned: []},
  trackers: {problems: []},
  ...extra
});

const bundleOf = (project, stalls = null) => ({project, stalls});

test('a quiet project owes nothing', () => {
  assert.deepEqual(owedOf(bundleOf(quiet())), []);
  assert.deepEqual(owedOf(bundleOf(null)), [], 'and no project, nothing');
});

test('every kind, in the order the skill names them, each target what its call takes', () => {
  const owed = owedOf(
    bundleOf(
      quiet({
        trackers: {problems: ['an unknown kind: gitlab']},
        handoffs: {open: [handoff('h1', 'open')], returned: [handoff('h2', 'returned')]}
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
      kind: 'handoff',
      target: 'h1',
      why: 'a apply-patch from h/s, open since 2026-10-25T00:00:00.000Z: Do h1.'
    },
    {
      kind: 'rework',
      target: 'h2',
      why: 'a run-check to repo:github.com/o/p, returned 2026-10-26T00:00:00.000Z'
    },
    {kind: 'upstream', target: 'mirror', why: 'github o/p#1: Mirror.'},
    {kind: 'triage', target: 'new', why: 'New.'},
    {kind: 'place', target: 'late', why: 'Late.'},
    {
      kind: 'fix-trackers',
      target: 'projects/p/queue/_about.md',
      why: 'an unknown kind: gitlab'
    },
    {
      kind: 'file-stalls',
      target: STALL_ITEM,
      why: '3 in the past week, the latest at 2026-10-26T01:00:00.000Z'
    }
  ]);
});

test('stalls the server files owe nothing; with no project, the stalls alone', () => {
  assert.deepEqual(owedOf(bundleOf(null, {count: 2, latestAt: 'a', filedBy: 'server'})), []);
  assert.deepEqual(owedOf(bundleOf(null, {count: 2, latestAt: 'a'})), [
    {
      kind: 'file-stalls',
      target: STALL_ITEM,
      why: '2 in the past week, the latest at a'
    }
  ]);
});
