// Shared correlator between Claude Code transcripts and git history.
//
// Owned by /process-review, imported by /reflect — the same ownership shape as
// vault/vault-triage.mjs serving the vault-review-* skills.
//
// DELIBERATELY carries no `import.meta.main` guard. That guard exists to stop a
// CLI from performing its whole job when someone imports it to inspect it; this
// module is a library with no top-level side effects, so importing it does
// nothing but define functions. Keep it that way — if a CLI is ever added here,
// put it behind a guard in a separate file.

import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

export const VERSION_BUMP =
  /^\s*(new version|version|release|bump(?:ing)? (?:the )?version|v?\d+\.\d+\.\d+)\b/i;

export const isVersionBump = subject => VERSION_BUMP.test(subject || '');

// A Claude Code project dir encodes an absolute path with '/' replaced by '-',
// which is ambiguous the moment a path component itself contains a hyphen
// ('cognito-toolkit'). Resolve by walking the filesystem: at each level take the
// longest run of segments that names a real directory.
export const repoForProject = projectDir => {
  const segments = String(projectDir).replace(/^-+/, '').split('-');
  const walk = (base, i) => {
    if (i >= segments.length) return base;
    for (let take = segments.length - i; take >= 1; --take) {
      const name = segments.slice(i, i + take).join('-');
      const next = join(base, name);
      if (!existsSync(next)) continue;
      const found = walk(next, i + take);
      if (found) return found;
    }
    return i === segments.length ? base : null;
  };
  const path = walk('/', 0);
  if (!path) return null;
  return existsSync(join(path, '.git')) ? path : null;
};

const git = (repo, ...args) => {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return ''; // fail open: no correlation is a missing enrichment, never an error
  }
};

// Commits authored inside [startMs, endMs + slack]. The slack absorbs the gap
// between the last transcript row and a commit made moments after.
export const commitsInWindow = (repo, startMs, endMs, {slackSec = 900, noMerges = true} = {}) => {
  if (!repo) return [];
  const args = [
    'log',
    `--since=@${Math.floor(startMs / 1000)}`,
    `--until=@${Math.floor(endMs / 1000) + slackSec}`,
    '--format=%H|%at|%s'
  ];
  if (noMerges) args.push('--no-merges');
  return git(repo, ...args)
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [sha, ts, ...rest] = line.split('|');
      return {sha: sha.slice(0, 8), ts: Number(ts) * 1000, subject: rest.join('|')};
    })
    .sort((a, b) => a.ts - b.ts);
};

// A slash-command turn arrives as the skill's whole SKILL.md preamble, which is
// useless as a driver label — the informative answer is which command was run.
const SKILL_PREAMBLE = /^\s*Base directory for this skill:\s*\S*?\/skills\/([\w-]+)/;
export const describeTurn = text => {
  const s = String(text || '');
  const skill = s.match(SKILL_PREAMBLE);
  if (skill) return `/${skill[1]} (slash command)`;
  return s.replace(/\s+/g, ' ').trim().slice(0, 200);
};

// Attach the user turn that immediately preceded each commit. `turns` is
// [{ts, text, isCorrection?}] in any order; the driver is the newest turn at or
// before the commit.
export const attributeCommits = (commits, turns) => {
  const ordered = [...turns].sort((a, b) => a.ts - b.ts);
  return commits.map(c => {
    let driver = null;
    for (const t of ordered) {
      if (t.ts > c.ts) break;
      driver = t;
    }
    return {
      ...c,
      driver: driver
        ? {
            ts: driver.ts,
            gap_min: Math.round((c.ts - driver.ts) / 60000),
            is_correction: !!driver.isCorrection,
            text: describeTurn(driver.text)
          }
        : null
    };
  });
};

// More than one release inside a single session. Eugene's rule: possible, but it
// should be an exception — a second same-session release usually means either a
// critical bug surfaced or the first was cut early. The known-legitimate case is
// debugging a dependent repo against an unpublished change, which is itself a
// process gap (link the package locally instead of publishing to test).
export const releasesInSession = attributed => {
  const releases = attributed.filter(c => isVersionBump(c.subject));
  if (releases.length < 2) return null;
  return {
    count: releases.length,
    span_min: Math.round((releases[releases.length - 1].ts - releases[0].ts) / 60000),
    releases: releases.map(r => ({
      sha: r.sha,
      subject: r.subject,
      driver: r.driver?.text ?? null
    }))
  };
};

// Convenience for callers that only have a project dir and a row window.
export const correlateSession = (projectDir, startMs, endMs, turns = [], opts = {}) => {
  const repo = repoForProject(projectDir);
  if (!repo) return {repo: null, commits: [], multi_release: null};
  const attributed = attributeCommits(commitsInWindow(repo, startMs, endMs, opts), turns);
  return {
    repo,
    commits: attributed,
    correction_driven: attributed.filter(c => c.driver?.is_correction).length,
    multi_release: releasesInSession(attributed)
  };
};

// Reverse of repoForProject, and unambiguous in this direction: the project dir
// is just the absolute path with '/' replaced by '-'.
export const projectDirForRepo = repo => String(repo).replace(/\//g, '-');

// Load a project's sessions as [{session_id, startMs, endMs, turns}] for
// annotating git findings. Sparse by nature — transcripts are per-machine and
// far shallower than git history — so callers treat a miss as "no annotation",
// never as "no session happened".
export const loadSessions = (projectDir, {root} = {}) => {
  const base = root || join(process.env.HOME || '', '.claude', 'projects');
  const dir = join(base, projectDir);
  let files;
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    let rows;
    try {
      rows = readFileSync(join(dir, f), 'utf8').split('\n');
    } catch {
      continue;
    }
    const turns = [];
    let startMs = null,
      endMs = null;
    for (const line of rows) {
      if (!line) continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = r.timestamp ? Date.parse(r.timestamp) : null;
      if (!ts) continue;
      if (startMs === null || ts < startMs) startMs = ts;
      if (endMs === null || ts > endMs) endMs = ts;
      if (r.type !== 'user') continue;
      const c = r.message?.content;
      const text = Array.isArray(c)
        ? c
            .filter(x => x?.type === 'text')
            .map(x => x.text)
            .join(' ')
        : typeof c === 'string'
          ? c
          : '';
      if (text.trim()) turns.push({ts, text});
    }
    if (startMs === null) continue;
    out.push({session_id: f.replace(/\.jsonl$/, ''), startMs, endMs, turns});
  }
  return out.sort((a, b) => a.startMs - b.startMs);
};

// Given a repo and a commit timestamp, which session was running, and what turn
// drove it? Returns null when no transcript covers that moment.
export const sessionForCommit = (sessions, tsMs, slackSec = 900) => {
  for (const s of sessions) {
    if (tsMs < s.startMs || tsMs > s.endMs + slackSec * 1000) continue;
    let driver = null;
    for (const t of s.turns) {
      if (t.ts > tsMs) break;
      driver = t;
    }
    return {
      session_id: s.session_id,
      driver: driver ? describeTurn(driver.text) : null,
      gap_min: driver ? Math.round((tsMs - driver.ts) / 60000) : null
    };
  }
  return null;
};

export const listProjectDirs = base => {
  try {
    return readdirSync(base, {withFileTypes: true})
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
};
