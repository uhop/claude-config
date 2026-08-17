#!/usr/bin/env node
// /process-review scanner — reads one repo's git history and emits candidate
// process signals: work that landed in a shape suggesting the process, not the
// code, was the problem.
//
// Three detectors, all structural:
//   split_change   same change landing in sibling files far apart in time
//   churn          a line added, removed, and re-added across separate commits
//   burst          many small commits to one file in a short window
//                  (+ a release-cadence sub-signal for clustered version bumps)
//
// Report-only by design: git shows what landed, never what was discussed, so a
// finding is a candidate for judgment — the agent dedupes and routes downstream
// per SKILL.md. Better a noisy candidate than a silently dropped one.
//
// Usage:
//   process-review.mjs <repo> [--limit=N] [--since=YYYY-MM-DD]
//                             [--min-gap=DAYS] [--top=N] [--out=PATH] [--json]
//                             [--with-transcripts]   annotate commits with the
//                                                    session + turn that drove them

import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, basename} from 'node:path';
import {projectDirForRepo, loadSessions, sessionForCommit} from './git-correlate.mjs';

if (!import.meta.main)
  throw new Error(
    'process-review.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  for (const a of args) {
    if (a === name) return true;
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return fallback;
};

const positional = args.filter(a => !a.startsWith('--'));
const repo = resolve(positional[0] || process.cwd());
const limit = Number(opt('--limit', 300));
const since = opt('--since', null);
const minGapDays = Number(opt('--min-gap', 3));
const top = Number(opt('--top', 8));
const outPath = opt('--out', null);
const jsonOnly = opt('--json', false) === true;
const withTranscripts = opt('--with-transcripts', false) === true;

const DAY = 86400;

// Generated / vendored content: identical boilerplate lines recur across
// unrelated contexts, so content matching there is meaningless noise.
const GENERATED =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|search-index\.json|Cargo\.lock|go\.sum|composer\.lock)$|(^|\/)(dist|build|out|coverage|vendor|node_modules|__snapshots__)\/|\.min\.(js|css)$|\.map$/;

const VERSION_BUMP =
  /^\s*(new version|version|release|bump(?:ing)? (?:the )?version|v?\d+\.\d+\.\d+)\b/i;

// A line has to be distinctive enough that matching it means something.
const MIN_LINE = 20;
const isSignal = s => s.length >= MIN_LINE && !/^[-+*/#<>{}()[\];,'"`|=\s]*$/.test(s);

const git = (...a) => {
  try {
    return execFileSync('git', ['-C', repo, ...a], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024
    });
  } catch (e) {
    throw new Error(
      `git ${a[0]} failed in ${repo}: ${(e.stderr || e.message).toString().trim().slice(0, 300)}`
    );
  }
};

const parseLog = () => {
  const range = since ? ['--since=' + since] : ['-n', String(limit)];
  const raw = git('log', ...range, '--no-merges', '-U0', '--format=C|%H|%at|%s');
  const commits = [];
  let cur = null,
    file = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('C|')) {
      const [, sha, ts, subj] = line.split('|', 4);
      cur = {sha, short: sha.slice(0, 8), ts: Number(ts), subj, files: new Map()};
      commits.push(cur);
      file = null;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      if (!cur.files.has(file)) cur.files.set(file, {add: new Set(), del: new Set()});
      continue;
    }
    if (line.startsWith('diff --git') || line.startsWith('--- ')) continue;
    if (!file) continue;
    if (line.startsWith('+')) {
      const s = line.slice(1).trim();
      if (isSignal(s)) cur.files.get(file).add.add(s);
    } else if (line.startsWith('-')) {
      const s = line.slice(1).trim();
      if (isSignal(s)) cur.files.get(file).del.add(s);
    }
  }
  return commits.sort((a, b) => a.ts - b.ts);
};

const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);
const days = n => Math.round((n / DAY) * 10) / 10;

// ---------------------------------------------------------------- detectors

// Same added-line content landing in files that were never touched together.
// Uses an inverted index so only signatures sharing >=2 lines are compared.
const detectSplitChange = commits => {
  const bySha = new Map(commits.map(c => [c.short, c]));
  const sigs = [];
  for (const c of commits)
    for (const [path, {add}] of c.files) {
      if (GENERATED.test(path)) continue;
      if (add.size < 2 || add.size > 40) continue;
      sigs.push({lines: add, path, ts: c.ts, sha: c.short, subj: c.subj, idx: sigs.length});
    }

  const index = new Map();
  for (const s of sigs)
    for (const l of s.lines) {
      let bucket = index.get(l);
      if (!bucket) index.set(l, (bucket = []));
      bucket.push(s.idx);
    }

  const pairCounts = new Map();
  for (const bucket of index.values()) {
    if (bucket.length < 2 || bucket.length > 60) continue; // ubiquitous line: no information
    for (let i = 0; i < bucket.length; ++i)
      for (let j = i + 1; j < bucket.length; ++j) {
        const key = bucket[i] + ':' + bucket[j];
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
  }

  // One finding is a *pair of commits*, not a pair of files: when the earlier
  // commit touched four ports and the later one caught the fifth, that is one
  // lag, not four rows.
  const groups = new Map();
  for (const [key, shared] of pairCounts) {
    if (shared < 2) continue;
    const [i, j] = key.split(':').map(Number);
    const a = sigs[i],
      b = sigs[j];
    if (a.path === b.path) continue;
    const gap = Math.abs(b.ts - a.ts);
    if (gap < minGapDays * DAY) continue;
    const union = new Set([...a.lines, ...b.lines]).size;
    const jaccard = shared / union;
    if (jaccard < 0.5) continue;
    const [first, second] = a.ts <= b.ts ? [a, b] : [b, a];
    if (first.sha === second.sha) continue;
    // A move is one action, not a lag: if the later commit also *removed* these
    // lines from the earlier path, the code was extracted or relocated, not
    // applied twice. Without this, every file split reads as a missed sweep.
    const sharedSet = [...first.lines].filter(l => second.lines.has(l));
    const removed = bySha.get(second.sha)?.files.get(first.path)?.del;
    if (removed && sharedSet.filter(l => removed.has(l)).length * 2 >= sharedSet.length) continue;
    const gk = first.sha + ':' + second.sha;
    let g = groups.get(gk);
    if (!g) {
      g = {
        gap_days: days(gap),
        shared_lines: shared,
        overlap: Math.round(jaccard * 100),
        earlier: {sha: first.sha, date: iso(first.ts), subject: first.subj, paths: new Set()},
        later: {sha: second.sha, date: iso(second.ts), subject: second.subj, paths: new Set()},
        sample: [...first.lines].filter(l => second.lines.has(l)).slice(0, 3)
      };
      groups.set(gk, g);
    }
    g.earlier.paths.add(first.path);
    g.later.paths.add(second.path);
    if (shared > g.shared_lines) g.shared_lines = shared;
    const pct = Math.round(jaccard * 100);
    if (pct > g.overlap) g.overlap = pct;
  }

  const out = [...groups.values()].map(g => ({
    ...g,
    earlier: {...g.earlier, paths: [...g.earlier.paths]},
    later: {...g.later, paths: [...g.later.paths]}
  }));
  return out.sort((x, y) => y.gap_days - x.gap_days || y.shared_lines - x.shared_lines);
};

// A line added, later removed, later re-added — in *separate* commits.
// Lines both added and removed inside one commit are moves/reindents, not churn.
const detectChurn = commits => {
  const history = new Map();
  const fileSpread = new Map();
  for (const c of commits)
    for (const [path, {add, del}] of c.files) {
      if (GENERATED.test(path)) continue;
      for (const l of add) {
        if (del.has(l)) continue;
        const k = path + '\t' + l;
        if (!history.has(k)) history.set(k, []);
        history.get(k).push({ts: c.ts, op: '+', sha: c.short, subj: c.subj});
        fileSpread.set(l, (fileSpread.get(l) || new Set()).add(path));
      }
      for (const l of del) {
        if (add.has(l)) continue;
        const k = path + '\t' + l;
        if (!history.has(k)) history.set(k, []);
        history.get(k).push({ts: c.ts, op: '-', sha: c.short, subj: c.subj});
      }
    }

  const out = [];
  for (const [k, evs] of history) {
    const [path, line] = k.split('\t');
    if ((fileSpread.get(line)?.size || 0) > 3) continue; // boilerplate, not a decision
    const seq = evs.map(e => e.op).join('');
    if (!seq.includes('+-+') && !seq.includes('-+-')) continue;
    if (new Set(evs.map(e => e.sha)).size < 3) continue;
    out.push({
      path,
      line: line.slice(0, 160),
      flips: evs.length,
      span_days: days(evs[evs.length - 1].ts - evs[0].ts),
      events: evs.map(e => ({date: iso(e.ts), op: e.op, sha: e.sha, subject: e.subj}))
    });
  }
  return out.sort((a, b) => b.flips - a.flips || b.span_days - a.span_days);
};

// Many small touches of one file inside a short window.
const detectBursts = (commits, windowDays = 3, minTouches = 4, maxAvgChurn = 40) => {
  const stat = git(
    'log',
    ...(since ? ['--since=' + since] : ['-n', String(limit)]),
    '--no-merges',
    '--format=C|%H|%at|%s',
    '--numstat'
  );
  const byFile = new Map();
  let cur = null;
  for (const line of stat.split('\n')) {
    if (line.startsWith('C|')) {
      const [, sha, ts, subj] = line.split('|', 4);
      cur = {sha: sha.slice(0, 8), ts: Number(ts), subj};
      continue;
    }
    if (!cur || !line.includes('\t')) continue;
    const [a, d, path] = line.split('\t');
    if (a === '-' || !path || GENERATED.test(path)) continue;
    if (!byFile.has(path)) byFile.set(path, []);
    byFile.get(path).push({...cur, churn: Number(a) + Number(d)});
  }

  const out = [];
  for (const [path, evs] of byFile) {
    evs.sort((x, y) => x.ts - y.ts);
    for (let i = 0; i < evs.length; ++i) {
      let j = i;
      while (j + 1 < evs.length && evs[j + 1].ts - evs[i].ts <= windowDays * DAY) ++j;
      const n = j - i + 1;
      if (n < minTouches) continue;
      const churn = evs.slice(i, j + 1).reduce((s, e) => s + e.churn, 0);
      if (churn / n > maxAvgChurn) continue;
      out.push({
        path,
        touches: n,
        span_days: days(evs[j].ts - evs[i].ts),
        total_lines: churn,
        commits: evs.slice(i, j + 1).map(e => ({date: iso(e.ts), sha: e.sha, subject: e.subj}))
      });
      break;
    }
  }
  return out.sort((a, b) => b.touches - a.touches);
};

// Version bumps clustered in time — the release-cadence smell.
const detectReleaseClusters = (commits, windowDays = 3) => {
  const bumps = commits.filter(c => VERSION_BUMP.test(c.subj));
  const out = [];
  for (let i = 0; i < bumps.length; ++i) {
    let j = i;
    while (j + 1 < bumps.length && bumps[j + 1].ts - bumps[i].ts <= windowDays * DAY) ++j;
    const n = j - i + 1;
    if (n < 2) continue;
    out.push({
      releases: n,
      span_days: days(bumps[j].ts - bumps[i].ts),
      commits: bumps.slice(i, j + 1).map(c => ({date: iso(c.ts), sha: c.short, subject: c.subj}))
    });
    i = j;
  }
  return out.sort((a, b) => b.releases - a.releases);
};

// -------------------------------------------------------------------- main

const commits = parseLog();
if (!commits.length) {
  console.error(`no commits found in ${repo} for the requested window`);
  process.exit(1);
}

const findings = {
  split_change: detectSplitChange(commits),
  churn: detectChurn(commits),
  burst: detectBursts(commits),
  release_cluster: detectReleaseClusters(commits)
};

// Optional transcript enrichment: name the session and the turn that drove each
// commit in a finding. Deliberately sparse — transcripts are per-machine and far
// shallower than git history, so a miss means "no transcript", never "no cause".
let transcriptCoverage = null;
if (withTranscripts) {
  const sessions = loadSessions(projectDirForRepo(repo));
  const byTs = new Map(commits.map(c => [c.short, c.ts * 1000]));
  let hit = 0,
    seen = 0;
  const annotate = list =>
    list.forEach(f =>
      (f.commits || [])
        .concat(f.releases || [])
        .concat(f.events || [])
        .forEach(c => {
          const ms = byTs.get(c.sha);
          if (ms === undefined) return;
          ++seen;
          const s = sessionForCommit(sessions, ms);
          if (s) {
            ++hit;
            c.session = s.session_id.slice(0, 8);
            c.driver = s.driver;
          }
        })
    );
  Object.values(findings).forEach(annotate);
  transcriptCoverage = {sessions: sessions.length, commits_seen: seen, commits_matched: hit};
}

const report = {
  repo,
  name: basename(repo),
  head: git('rev-parse', '--short', 'HEAD').trim(),
  window: {
    since: since || `last ${limit} commits`,
    commits: commits.length,
    from: iso(commits[0].ts),
    to: iso(commits[commits.length - 1].ts)
  },
  totals: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length])),
  findings: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.slice(0, top)])),
  truncated: Object.fromEntries(
    Object.entries(findings).map(([k, v]) => [k, Math.max(0, v.length - top)])
  ),
  transcript_coverage: transcriptCoverage
};

const json = JSON.stringify(report, null, 2);
if (outPath) writeFileSync(outPath, json);

// Exit 1 on any finding, in both output modes — the semantics SKILL.md documents.
const total = Object.values(report.totals).reduce((a, b) => a + b, 0);

if (jsonOnly) {
  console.log(json);
  process.exit(total ? 1 : 0);
}

const w = console.log;
w(`process-review — ${report.name} @ ${report.head}`);
w(`  window: ${report.window.commits} commits, ${report.window.from} .. ${report.window.to}`);
w(
  `  findings: ${report.totals.split_change} split-change, ${report.totals.churn} churn, ${report.totals.burst} burst, ${report.totals.release_cluster} release-cluster`
);
if (transcriptCoverage)
  w(
    `  transcripts: ${transcriptCoverage.sessions} sessions, ${transcriptCoverage.commits_matched}/${transcriptCoverage.commits_seen} finding-commits attributed`
  );

if (report.findings.split_change.length) {
  w('\n=== SPLIT CHANGE — same change reached sibling files late ===');
  for (const f of report.findings.split_change) {
    w(`\n  gap ${f.gap_days}d · ${f.overlap}% overlap · ${f.shared_lines} shared lines`);
    w(`    ${f.earlier.date}  ${f.earlier.sha}  "${f.earlier.subject}"`);
    for (const p of f.earlier.paths) w(`        ${p}`);
    w(`    ${f.later.date}  ${f.later.sha}  "${f.later.subject}"`);
    for (const p of f.later.paths) w(`        ${p}`);
    for (const s of f.sample) w(`      | ${s.slice(0, 96)}`);
  }
}

if (report.findings.release_cluster.length) {
  w('\n=== RELEASE CLUSTER — version bumps close together ===');
  for (const f of report.findings.release_cluster) {
    w(`\n  ${f.releases} releases in ${f.span_days}d`);
    for (const c of f.commits) {
      w(`    ${c.date}  ${c.sha}  ${c.subject}`);
      if (c.driver) w(`        driven by: ${c.driver}  (session ${c.session})`);
    }
  }
}

if (report.findings.burst.length) {
  w('\n=== BURST — many small commits to one file ===');
  for (const f of report.findings.burst) {
    w(`\n  ${f.touches} touches / ${f.span_days}d · ${f.total_lines} lines · ${f.path}`);
    for (const c of f.commits.slice(0, 5)) w(`    ${c.date}  ${c.sha}  ${c.subject.slice(0, 60)}`);
  }
}

if (report.findings.churn.length) {
  w('\n=== CHURN — line added, removed, re-added ===');
  for (const f of report.findings.churn) {
    w(`\n  ${f.flips} events / ${f.span_days}d · ${f.path}`);
    w(`    | ${f.line.slice(0, 96)}`);
    for (const e of f.events.slice(0, 5))
      w(`    ${e.date} ${e.op} ${e.sha}  ${e.subject.slice(0, 52)}`);
  }
}

const dropped = Object.entries(report.truncated).filter(([, n]) => n > 0);
if (dropped.length)
  w(`\n(truncated at --top=${top}: ` + dropped.map(([k, n]) => `${n} more ${k}`).join(', ') + ')');

process.exit(total ? 1 : 0);
