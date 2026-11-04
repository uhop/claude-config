// The digest a resume prints. Run: node --test skills/vault/resume.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readdirSync, readFileSync} from 'node:fs';
import {statSync, utimesSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  checkoutName,
  collectGithub,
  digestOf,
  intakeOf,
  lastMessageOf,
  prepareCollection,
  sectionOf,
  takePrepared,
  threadLines,
  threadsToFile
} from './resume.mjs';

const project = (extra = {}) => ({
  found: true,
  name: 'p',
  logs: [
    {
      title: 'p: did a thing (2026-11-02)',
      summary: 'Did the thing.',
      at: '2026-11-02T10:00:00Z',
      data_path: 'projects/p/data/sessions/logs/x.markdown'
    }
  ],
  sessions: {unlogged: []},
  notices: [],
  changes: null,
  files: {stack: null, decisions: null, learnings: null},
  trackers: {primary: {kind: 'vault'}, trackers: [], problems: []},
  ...extra
});

const inputs = (extra = {}) => ({
  project: 'p',
  bundle: {project: project()},
  items: [],
  owed: [],
  plans: [],
  logBody: null,
  lastMessage: null,
  drift: {code: 0, stdout: ''},
  github: null,
  ...extra
});

const headings = text => text.split('\n').filter(line => line.startsWith('## '));

test('a section is the text under its heading, to the next one, whatever its case', () => {
  const body = '# T\n\n## Done\n\nA.\n\n## Open\n\n- One.\n- Two.\n\n## Key files\n\nB.\n';
  assert.equal(sectionOf(body, 'open'), '- One.\n- Two.');
  assert.equal(sectionOf(body, 'next'), null);
  assert.equal(sectionOf('## Open\n\n', 'open'), null, 'an empty section is none');
  assert.equal(sectionOf('## Open\nLast.', 'open'), 'Last.', 'the last section runs to the end');
});

test('the last message is the newest assistant text, cut from its end', () => {
  const row = (type, content) => JSON.stringify({type, message: {content}});
  const jsonl = [
    'half a line from the tail cut',
    row('assistant', [{type: 'text', text: 'Earlier.'}]),
    row('assistant', [{type: 'text', text: 'The end.'}, {type: 'tool_use'}]),
    row('assistant', [{type: 'tool_use'}]),
    row('user', [{type: 'text', text: 'From him.'}]),
    ''
  ].join('\n');
  assert.equal(lastMessageOf(jsonl), 'The end.');
  assert.equal(lastMessageOf(row('user', [{type: 'text', text: 'x'}])), null);
  const long = row('assistant', [{type: 'text', text: `${'a'.repeat(2000)}Z`}]);
  assert.equal(lastMessageOf(long).length, 1500);
  assert.ok(lastMessageOf(long).endsWith('Z'), 'an open question ends a message, so the end stays');
});

test('a farewell gives way to the last substantial message, and stands when it is all there is', () => {
  const row = text =>
    JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text}]}});
  const reply = `${'a'.repeat(200)} Which one?`;
  assert.equal(lastMessageOf([row(reply), row('Bye, Eugene.')].join('\n')), reply);
  assert.equal(lastMessageOf(row('Bye, Eugene.')), 'Bye, Eugene.');
});

test('open threads are meta only, newest first, closed ones and CVE-assigned advisories out', () => {
  const lines = threadLines({
    items: {
      1: {
        is_pr: true,
        title: 'A PR',
        state: 'open',
        author: 'ann',
        comments: 2,
        updated_at: '2026-11-02T00:00:00Z',
        body: 'never shown'
      },
      2: {is_pr: false, title: 'Closed', state: 'closed', author: 'x'},
      3: {
        is_pr: false,
        title: 'An issue',
        state: 'open',
        author: 'dep',
        bot: true,
        comments: 0,
        updated_at: '2026-11-01T00:00:00Z'
      }
    },
    discussions: {
      4: {
        title: 'A question',
        closed: false,
        author: 'bob',
        category: 'Q&A',
        updated_at: '2026-11-03T00:00:00Z',
        excerpt: 'never shown'
      },
      5: {title: 'Done', closed: true}
    },
    advisories: {
      'GHSA-a': {cve_id: null, summary: 'Bad', severity: 'high', state: 'draft'},
      'GHSA-b': {cve_id: 'CVE-1', summary: 'Known', severity: 'low', state: 'published'}
    }
  });
  assert.deepEqual(lines, [
    'discussion #4 "A question", by bob, Q&A, updated 2026-11-03',
    'PR #1 "A PR", by ann, 2 comments, updated 2026-11-02',
    'issue #3 "An issue", by dep (bot), 0 comments, updated 2026-11-01',
    'advisory GHSA-a "Bad", high, draft, no CVE'
  ]);
  assert.deepEqual(threadLines({}), []);
});

test('a new thread lands where the tracker says', () => {
  assert.equal(intakeOf({trackers: []}), 'Active', 'no declaration reflects');
  const github = extra => ({trackers: [{kind: 'github', role: 'secondary', ...extra}]});
  assert.equal(intakeOf(github({intake: 'reflect'})), 'Active');
  assert.equal(intakeOf(github({intake: 'triage'})), 'Inbox');
  assert.equal(intakeOf(github({intake: 'none'})), null);
  assert.equal(intakeOf(github({role: 'primary', intake: 'reflect'})), null);
});

test('only a person’s new thread with no mirroring item is filed', () => {
  const events = [
    {kind: 'issue.new', repo: 'o/r', number: 1, title: 'New', url: 'u'},
    {kind: 'pr.new', repo: 'o/r', number: 2, title: 'Bot', bot: true},
    {kind: 'pr.new', repo: 'o/r', number: 3, title: 'Mirrored'},
    {kind: 'discussion.new', repo: 'o/r', number: 4, title: 'Talk'},
    {kind: 'advisory.new', repo: 'o/r', id: 'GHSA-x', summary: 'Hole'},
    {kind: 'pr.comments', repo: 'o/r', number: 3, title: 'Mirrored'}
  ];
  assert.deepEqual(threadsToFile(events, [{source: 'github o/r#3'}, {source: null}]), [
    {source: 'github o/r#1', title: 'GitHub: o/r #1 New', body: 'issue.new #1, u'},
    {source: 'github o/r discussion#4', title: 'GitHub: o/r #4 Talk', body: 'discussion.new #4'},
    {source: 'github o/r GHSA-x', title: 'GitHub: o/r GHSA-x Hole', body: 'advisory.new GHSA-x'}
  ]);
});

test('a quiet project reads how it finished, and no empty section', () => {
  assert.deepEqual(headings(digestOf(inputs())), ['## How we finished']);
  assert.ok(digestOf(inputs()).includes('Did the thing.'));
});

test('a project the vault does not hold says so', () => {
  const text = digestOf(inputs({bundle: {project: {found: false}}}));
  assert.equal(text, '# p\n\nThe vault holds nothing for this project yet.');
});

test('every section the digest owes, in order, from the log, the queue, and GitHub', () => {
  const text = digestOf(
    inputs({
      bundle: {
        project: project({
          notices: [
            {
              file: 'stack',
              type: 'contradicts',
              by: {title: 'A note', file_path: 'projects/p/n.md'}
            }
          ],
          changes: {
            since: {ended: 'x'},
            more: 2,
            notes: [
              {path: 'a', title: 'Made one', changed: {created: true}},
              {path: 'b', title: 'Edited one', changed: {body: true}},
              {path: 'c', title: 'Summary only', changed: {body: false, agent: true}},
              {path: 'd', title: 'Unknown one', changed: null}
            ]
          },
          files: {
            stack: {summary: 'Node.', summary_stale: false},
            decisions: {summary: 'D1 to D9.', summary_stale: true},
            learnings: null
          }
        })
      },
      items: [
        {title: 'Doing.', section: 'active'},
        ...Array.from({length: 12}, (_, i) => ({title: `Later ${i}.`, section: 'backlog'})),
        {title: 'Seen.', section: 'watching'}
      ],
      owed: [
        {kind: 'handoff', target: 'h', why: 'a run-check from x'},
        {kind: 'place', target: 's', why: 'it entered the Backlog on 2026-11-03: Fresh item.'},
        {kind: 'read', target: 'projects/p/decisions.md', why: 'its summary predates its body'}
      ],
      plans: ['projects/p/plans/order'],
      logBody: '## Open\n\n- Is X right?\n\n## Next\n\nBuild Y.\n',
      drift: {code: 1, stdout: 'two new commits'},
      github: {
        repo: 'o/r',
        snapshot: {
          ci: {conclusion: 'success'},
          items: {7: {is_pr: true, title: 'Fix', state: 'open', author: 'ann', updated_at: 'x'}}
        },
        brief: 'new PR #7',
        filed: ['github o/r#7']
      }
    })
  );
  assert.deepEqual(headings(text), [
    '## How we finished',
    '## Upcoming',
    '## Open',
    '## Outside',
    '## Changed since the last session'
  ]);
  for (const expected of [
    'Next, from the last log:\nBuild Y.',
    '- Doing.',
    'Plan: projects/p/plans/order\nBacklog: 12 items, the plan orders them.',
    'New in the Backlog since the last session:\n- Fresh item.',
    'Watching: 1 items',
    'From the last log:\n- Is X right?',
    '- A handoff waiting: a run-check from x',
    '- A note contradicts stack',
    'Drift:\ntwo new commits',
    'GitHub o/r, CI success:',
    'Since the last look:\nnew PR #7',
    'Filed on the queue: github o/r#7',
    '- PR #7 "Fix", by ann, 0 comments',
    '- Made one (made)',
    '- Edited one (edited)',
    '- Unknown one (written, what changed unknown)',
    "- and 2 more past the server's cap"
  ]) {
    assert.ok(text.includes(expected), `missing: ${expected}`);
  }
  assert.ok(!text.includes('Summary only'), 'a restated summary is no change');
  assert.ok(!text.includes('Node.'), 'what the notes hold is read when the work needs it');
  assert.ok(!text.includes('D1 to D9.'));
});

test('a Backlog with no plan shows its first items', () => {
  const items = Array.from({length: 12}, (_, i) => ({title: `Later ${i}.`, section: 'backlog'}));
  const text = digestOf(inputs({items}));
  assert.ok(text.includes('Backlog, 12 items, the first by priority and order:'));
  assert.ok(text.includes('- Later 9.\n- and 2 more'));
  assert.ok(!text.includes('Later 10.'));
});

const unwrapped = extra =>
  digestOf(
    inputs({
      bundle: {
        project: project({
          sessions: {
            unlogged: [
              {holder: 'h/old', ended: '2026-11-01T00:00:00Z', commits: []},
              {holder: 'h/new', ended: '2026-11-03T00:00:00Z', commits: ['abc']}
            ]
          }
        })
      },
      logBody: '## Open\n\n- An old question?\n',
      ...extra
    })
  );

test('work after the last log is flagged, with the final message that left it open', () => {
  const text = unwrapped({lastMessage: 'Which one, (a) or (b)?'});
  assert.ok(text.includes('The latest work has no log, so that may not be where things stand.'));
  assert.ok(text.includes('- h/new ended 2026-11-03T00:00:00Z, commits: 1'));
  assert.ok(text.includes('final message:\nWhich one, (a) or (b)?'));
  assert.ok(text.includes('From the last log, older than the latest work:\n- An old question?'));
  assert.ok(!text.includes('h/old'), 'a session the log already follows is only counted');
  assert.ok(text.includes('Older sessions with no log: 1.'));
});

test('a final message that cannot be read says what is unknown, and where it ran', () => {
  const text = unwrapped({lastMessage: null});
  assert.ok(text.includes('The newest ran on h, and its final message cannot be read from here'));
  assert.ok(text.includes('so what it left open is unknown.'));
});

test('with no later session the log stands unflagged', () => {
  const text = digestOf(inputs({logBody: '## Open\n\n- A question?\n'}));
  assert.ok(!text.includes('The latest work has no log'));
  assert.ok(text.includes('From the last log:\n- A question?'));
});

test('GitHub unreadable reports it beside the stored view; a clean tree shows no drift', () => {
  const text = digestOf(
    inputs({
      github: {
        problem: 'gh has no valid login on this host: run `gh auth login`.',
        repo: 'o/r',
        snapshot: {collected_at: '2026-11-01T00:00:00Z'},
        stored: true,
        filed: []
      }
    })
  );
  assert.ok(text.includes('gh has no valid login'));
  assert.ok(text.includes('as stored 2026-11-01'));
  assert.ok(text.includes('No open threads.'));
  assert.ok(!text.includes('Drift:'));
});

test('a tracker other than GitHub is named and never read', () => {
  const text = digestOf(
    inputs({
      bundle: {
        project: project({
          trackers: {
            primary: {kind: 'linear', ref: 'ENG'},
            trackers: [
              {kind: 'linear', ref: 'ENG'},
              {kind: 'jira', ref: 'VS'},
              {kind: 'github', ref: 'o/r'},
              {kind: 'vault', ref: null}
            ]
          }
        })
      }
    })
  );
  assert.ok(text.includes('New work goes to linear ENG, the primary tracker.'));
  assert.ok(text.includes('Also tracked in jira VS.'));
  assert.ok(
    !text.includes('Also tracked in github'),
    'GitHub is collected, so it has its own lines'
  );
  assert.ok(!text.includes('Also tracked in vault'));
});

const event = {kind: 'issue.new', repo: 'o/r', number: 1, title: 'New', url: 'u'};
const collectedRepo = extra => ({
  repo: 'o/r',
  project: 'p',
  first_run: false,
  events: [event],
  snapshot: {repo: 'o/r', ci: {conclusion: 'success'}},
  ...extra
});
const trackersBundle = Promise.resolve({project: {trackers: {trackers: []}}});
const storedCall = async () => ({
  ok: true,
  json: async () => ({repo: 'o/r', collected_at: '2026-11-01T00:00:00Z'})
});

/** Stands in for `fleet-status.mjs`: `collect` writes `collected`, and each call is recorded. */
const fleet = (collected, {fileCode = 0} = {}) => {
  const calls = [];
  const exec = async (_file, args) => {
    calls.push(args);
    if (args[0] === 'collect') writeFileSync(args[args.indexOf('--out') + 1], collected);
    if (args[0] === 'file') return {code: fileCode, stdout: '', stderr: 'no such project\nstack'};
    return {code: 0, stdout: args[0] === 'show' ? 'a brief' : '', stderr: ''};
  };
  const verbs = () => calls.map(args => args[0]);
  return {exec, calls, verbs};
};

const github = (f, items = Promise.resolve([]), call = storedCall) =>
  collectGithub('p', trackersBundle, items, call, f.exec);

test('the GitHub step names the project, files new threads, and then commits', async () => {
  const f = fleet(JSON.stringify({repos: [collectedRepo()]}));
  const result = await github(f);
  assert.deepEqual(f.verbs(), ['collect', 'file', 'show', 'commit']);
  const collect = f.calls[0];
  assert.equal(collect[collect.indexOf('--project') + 1], 'p', 'never the folder’s name');
  assert.deepEqual(result.filed, ['github o/r#1']);
  assert.equal(result.problem, undefined);
  assert.equal(result.brief, 'a brief');
});

test('a filing failure keeps the fresh view, names the failure, and does not commit', async () => {
  const f = fleet(JSON.stringify({repos: [collectedRepo()]}), {fileCode: 1});
  const result = await github(f);
  assert.ok(!f.verbs().includes('commit'), 'the baseline advances only after the items exist');
  assert.equal(result.repo, 'o/r');
  assert.equal(result.stored, undefined);
  assert.deepEqual(result.filed, []);
  assert.match(result.problem, /Filing github o\/r#1 failed: no such project\. /);
  assert.match(result.problem, /did not advance/);
  const text = digestOf(inputs({github: result}));
  assert.ok(text.includes('Filing github o/r#1 failed'));
  assert.ok(text.includes('GitHub o/r, CI success:'));
});

test('an unread queue files nothing and does not commit, since a filing could overwrite an item', async () => {
  const f = fleet(JSON.stringify({repos: [collectedRepo()]}));
  const result = await github(f, Promise.resolve(null));
  assert.deepEqual(f.verbs(), ['collect', 'show']);
  assert.match(result.problem, /not filed, since the queue is unread/);
});

for (const [name, collected, expected] of [
  ['unparsable output', 'not json', /could not be read just now/],
  ['no repository', JSON.stringify({repos: []}), /no repository/],
  ['no repos key', JSON.stringify({}), /no repository/],
  [
    'a repository error',
    JSON.stringify({repos: [collectedRepo({error: {message: 'renamed'}})]}),
    /GitHub answered: renamed/
  ]
]) {
  test(`${name} falls back to the stored view, with a line`, async () => {
    const f = fleet(collected);
    const result = await github(f);
    assert.match(result.problem, expected);
    assert.equal(result.stored, true);
    assert.deepEqual(f.verbs(), ['collect'], 'nothing filed or committed');
  });
}

test('no stored view either leaves the line alone, and a skipped repository says nothing', async () => {
  const f = fleet('not json');
  const down = async () => {
    throw new Error('fetch failed');
  };
  const result = await github(f, Promise.resolve([]), down);
  assert.match(result.problem, /could not be read just now/);
  assert.equal(result.repo, undefined);
  assert.ok(digestOf(inputs({github: result})).includes('could not be read just now'));
  assert.equal(await github(fleet(JSON.stringify({skipped: true, reason: 'private'}))), null);
});

test('outside text is labeled as such, and a quiet repository needs no label', () => {
  const view = snapshot => ({repo: 'o/r', snapshot, filed: []});
  const quiet = digestOf(inputs({github: view({items: {}})}));
  assert.ok(!quiet.includes('come from outside the project'));
  const open = {state: 'open', title: 'Do this', author: 'a', updated_at: '2026-11-01T00:00:00Z'};
  const threads = digestOf(inputs({github: view({items: {1: open}})}));
  assert.ok(threads.includes('come from outside the project'));
  const moved = digestOf(inputs({github: {...view({items: {}}), brief: 'a brief'}}));
  assert.ok(moved.includes('come from outside the project'));
});

test('what a digest could not read is a line in Open, and the rest still prints', () => {
  const text = digestOf(inputs({items: null, problems: ['The queue could not be read: 501']}));
  assert.ok(text.includes('## Open\nThe queue could not be read: 501'));
  assert.ok(text.includes('## How we finished'));
});

test('a linked worktree is named by its main checkout, a plain checkout by its own folder', () => {
  assert.equal(checkoutName('/cache/wt', '/home/u/Open/claude-config/.git'), 'claude-config');
  assert.equal(checkoutName('/home/u/Open/x', '/home/u/Open/x/.git'), 'x');
  assert.equal(checkoutName('/srv/x', '/srv/bare.git'), 'x', 'a bare repository names nothing');
});

test('the script runs by its path, as the vault skill calls it', () => {
  assert.ok(statSync(new URL('./resume.mjs', import.meta.url)).mode & 0o100);
});

const scratch = () => mkdtempSync(join(tmpdir(), 'resume-test-'));
const preparedText = (extra = {}) => JSON.stringify({repos: [collectedRepo(extra)]});
const FAR_FUTURE = () => Date.now() + 3_600_000;

test('a resume with a prepared collection files and commits it without collecting', async () => {
  const f = fleet('never written');
  const take = async out => {
    writeFileSync(out, preparedText());
    return true;
  };
  const result = await collectGithub(
    'p',
    trackersBundle,
    Promise.resolve([]),
    storedCall,
    f.exec,
    take
  );
  assert.deepEqual(f.verbs(), ['file', 'show', 'commit']);
  assert.deepEqual(result.filed, ['github o/r#1']);
});

test('preparing collects under the project, files nothing, and leaves one whole file', async () => {
  const dir = scratch();
  const f = fleet(preparedText());
  let duringCollect;
  const exec = async (file, args, cap) => {
    duringCollect = existsSync(join(dir, 's.pid'));
    return f.exec(file, args, cap);
  };
  await prepareCollection('p', 's', {dir, exec});
  assert.deepEqual(f.verbs(), ['collect'], 'the baseline moves only when a resume reads it');
  const collect = f.calls[0];
  assert.equal(collect[collect.indexOf('--project') + 1], 'p');
  assert.ok(duringCollect, 'a resume can see the collection running');
  assert.deepEqual(readdirSync(dir), ['s.json']);
});

test('a failed collection leaves nothing, so a resume collects for itself', async () => {
  const dir = scratch();
  const exec = async (_file, args) => {
    writeFileSync(args[args.indexOf('--out') + 1], 'half');
    return {code: 1, stdout: '', stderr: ''};
  };
  await prepareCollection('p', 's', {dir, exec});
  assert.deepEqual(readdirSync(dir), []);
});

test('preparing clears what an old session left, and keeps a recent one', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'old.json'), '{}');
  writeFileSync(join(dir, 'recent.json'), '{}');
  const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000);
  utimesSync(join(dir, 'old.json'), twoDaysAgo, twoDaysAgo);
  await prepareCollection('p', 's', {dir, exec: fleet(preparedText()).exec});
  assert.deepEqual(readdirSync(dir).sort(), ['recent.json', 's.json']);
});

const taken = async (text, options = {}) => {
  const dir = scratch();
  const out = join(dir, 'out.json');
  if (text !== null) writeFileSync(join(dir, 's.json'), text);
  const took = await takePrepared('s', 'p', out, {dir, ...options});
  assert.ok(!existsSync(join(dir, 's.json')), 'a collection is taken once');
  return {took, text: existsSync(out) ? readFileSync(out, 'utf8') : null};
};

test('nothing prepared means a fresh collection', async () => {
  assert.deepEqual(await taken(null), {took: false, text: null});
});

test('a prepared collection of this project is taken whole', async () => {
  const text = preparedText();
  assert.deepEqual(await taken(text), {took: true, text});
});

test('a skipped repository is an answer too, so it is not collected again', async () => {
  const text = JSON.stringify({skipped: true, reason: 'no_remote'});
  assert.deepEqual(await taken(text), {took: true, text});
});

for (const [name, text, options] of [
  ['an old collection', preparedText(), {now: FAR_FUTURE}],
  ['another project’s collection', preparedText({project: 'q'}), {}],
  ['a collection GitHub refused', preparedText({error: {message: 'no'}}), {}],
  ['a collection with no repository', JSON.stringify({repos: []}), {}]
]) {
  test(`${name} is dropped for a fresh one`, async () => {
    assert.deepEqual(await taken(text, options), {took: false, text: null});
  });
}

test('a resume waits for a running collection and takes it', async () => {
  const dir = scratch();
  const out = join(dir, 'out.json');
  writeFileSync(join(dir, 's.pid'), '4242');
  let checks = 0;
  const alive = pid => {
    assert.equal(pid, 4242);
    if (++checks < 3) return true;
    writeFileSync(join(dir, 's.json'), preparedText());
    return false;
  };
  assert.equal(await takePrepared('s', 'p', out, {dir, alive}), true);
  assert.equal(checks, 3);
  assert.equal(readFileSync(out, 'utf8'), preparedText());
});

test('a pid that outlives the collection’s cap means a fresh collection', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 's.pid'), '4242');
  let clock = 0;
  const now = () => (clock += 20_000);
  const alive = () => true;
  assert.equal(await takePrepared('s', 'p', join(dir, 'out.json'), {dir, alive, now}), false);
});

test('a collector that died with nothing written means a fresh collection', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 's.pid'), '4242');
  const alive = () => false;
  assert.equal(await takePrepared('s', 'p', join(dir, 'out.json'), {dir, alive}), false);
});
