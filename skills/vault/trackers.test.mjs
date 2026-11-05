// The declaration's validation. Run: node --test skills/vault/trackers.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTrackers, trackerLine} from './trackers.mjs';

test('readTrackers: absent means the vault is primary; a declaration is validated', () => {
  const none = readTrackers('p', undefined);
  assert.equal(none.declared, false);
  assert.equal(none.primary.kind, 'vault');
  assert.equal(trackerLine(none), 'vault');

  const ok = readTrackers('p', [
    {kind: 'linear', ref: 'ENG', role: 'primary', write: ['status']},
    {kind: 'github', ref: 'uhop/deep6', intake: 'triage'},
    {kind: 'vault', role: 'secondary'}
  ]);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.primary.kind, 'linear');
  assert.equal(ok.primary.create, 'here', 'a primary creates by default');
  assert.equal(ok.primary.intake, 'none', 'a primary takes no intake');
  assert.equal(ok.trackers[1]?.role, 'secondary', 'role defaults to secondary');
  assert.equal(ok.trackers[1]?.create, 'none', 'a secondary creates nothing by default');
  assert.equal(ok.trackers[1]?.intake, 'triage', 'intake as declared');
  assert.equal(ok.trackers[2]?.intake, 'none', 'the vault takes no intake');
  assert.equal(
    ok.trackers[1]?.url,
    'https://github.com/uhop/deep6/issues',
    'the GitHub link is derived'
  );
  assert.equal(
    trackerLine(ok),
    'linear ENG (primary); secondary: github uhop/deep6 (triage), vault'
  );

  // The name until 2026-09-30, still read; intake on a primary is the mirror the product avoids.
  const stale = readTrackers('p', [
    {kind: 'github', ref: 'uhop/deep6', role: 'primary', intake: 'reflect'},
    {kind: 'jira', ref: 'VS', role: 'mirror', intake: 'nope'},
    {kind: 'vault', intake: 'triage'}
  ]);
  assert.equal(stale.trackers[0]?.intake, 'none', 'the primary loses its intake');
  assert.equal(stale.trackers.length, 2, 'the bad intake drops its entry');
  assert.equal(stale.trackers[1]?.kind, 'vault');
  assert.equal(stale.trackers[1]?.intake, 'none', 'the vault takes no intake');
  assert.deepEqual(
    stale.problems.map(p => p.split(':')[0]),
    [
      'trackers[1].role mirror is called secondary now',
      'trackers[1].intake must be none, reflect, or triage',
      'trackers[2] (vault) takes no intake; it is the queue',
      'the primary (github uhop/deep6) takes no intake'
    ],
    'each named, in declaration order, the primary last'
  );
  const alias = readTrackers('p', [{kind: 'github', ref: 'a/b', role: 'mirror'}]);
  assert.equal(
    alias.trackers[1]?.role,
    'secondary',
    'mirror reads as secondary (the vault is put first as primary)'
  );
  assert.ok(
    alias.problems.some(p => p.includes('mirror is called secondary now')),
    'and is named as stale'
  );

  const bad = readTrackers('p', [
    {kind: 'trello', ref: 'x'},
    {kind: 'jira'},
    {kind: 'github', ref: 'a/b', role: 'primary'},
    {kind: 'linear', ref: 'ENG', role: 'primary', url: 'https://linear.app/acme/team/ENG'}
  ]);
  assert.equal(bad.trackers.length, 2, 'the unknown kind and the ref-less jira are dropped');
  assert.equal(bad.primary.ref, 'a/b', 'the first primary counts');
  assert.equal(bad.trackers[1]?.role, 'secondary', 'the second primary is demoted');
  assert.equal(bad.trackers[1]?.url, 'https://linear.app/acme/team/ENG', 'a given url is kept');
  assert.equal(bad.problems.length, 3, 'three problems named');
  assert.ok(bad.problems[0]?.includes('trello'), 'naming the offender');

  const list = readTrackers('p', 'linear');
  assert.equal(list.problems[0], 'trackers must be a list');
  assert.equal(list.primary.kind, 'vault', 'a malformed declaration falls back to the vault');
});
