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
import {basename, join} from 'node:path';
import {asHumanRow} from '../reflect/reflect-lib.mjs';

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

// Releases, by the sources Eugene trusts, in his order (2026-10-08): npm's
// publish times, the package.json version bumps, then the tag, which is checked
// and reported missing. Commit subjects only for a repository with no
// package.json: they missed every "New MCP version: X." release on record.
// npm comes first because it survives what git does not: a publish from
// changes never pushed, made on another machine, leaves no commit here.

const NOT_RELEASED = /(^|\/)(node_modules|fixtures|__fixtures__|tests?)\//;

export const packagesOf = repo =>
  git(repo, 'ls-files', '--', '*package.json')
    .split('\n')
    .filter(path => /(^|\/)package\.json$/.test(path) && !NOT_RELEASED.test(path))
    .flatMap(path => {
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(join(repo, path), 'utf8'));
      } catch {
        return [];
      }
      if (typeof pkg?.name !== 'string') return [];
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      return [{path, dir, name: pkg.name, private: pkg.private === true}];
    });

const npmCache = new Map();

// {status: 'ok' | 'unpublished' | 'not checked', times: {version: ms}}.
export const npmPublishTimes = name => {
  if (npmCache.has(name)) return npmCache.get(name);
  let result;
  try {
    const out = execFileSync('npm', ['view', name, 'time', '--json'], {
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const times = {};
    for (const [key, value] of Object.entries(JSON.parse(out)))
      if (/^\d+\.\d+\.\d+/.test(key)) times[key] = Date.parse(value);
    result = {status: 'ok', times};
  } catch (e) {
    const unpublished = /E404/.test(`${e.stdout ?? ''}${e.stderr ?? ''}`);
    result = {status: unpublished ? 'unpublished' : 'not checked', times: {}};
  }
  npmCache.set(name, result);
  return result;
};

// A diff that replaces one "version" with another; a file's first commit only
// adds one, which is a birth, not a release.
export const versionBumps = (repo, paths, sinceMs, untilMs) => {
  if (!paths.length) return [];
  const log = git(
    repo,
    'log',
    `--since=@${Math.floor(sinceMs / 1000)}`,
    `--until=@${Math.floor(untilMs / 1000)}`,
    '--format=@@@%H|%at|%s',
    '-U0',
    '-p',
    '-G"version"',
    '--',
    ...paths
  );
  const bumps = [];
  let commit = null,
    file = null,
    from = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@@')) {
      const [sha, ts, ...subject] = line.slice(3).split('|');
      commit = {sha: sha.slice(0, 8), ts: Number(ts) * 1000, subject: subject.join('|')};
      file = null;
      continue;
    }
    const header = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (header) {
      file = header[1];
      from = null;
      continue;
    }
    const change = line.match(/^([-+])\s*"version"\s*:\s*"([^"]+)"/);
    if (!change || !commit || !file) continue;
    if (change[1] === '-') from = change[2];
    else if (from && from !== change[2])
      bumps.push({path: file, version: change[2], from, ...commit});
  }
  return bumps;
};

// Fleet convention: a naked X.Y.Z for the root package, <pkg>-X.Y.Z for one in
// a subfolder (mcp-0.15.0).
const expectedTags = (pkg, version) =>
  pkg.dir
    ? [...new Set([basename(pkg.dir), pkg.name.replace(/^@[^/]+\//, '')])].map(
        prefix => `${prefix}-${version}`
      )
    : [version];

const recordedAnywhere = (repo, path, version) =>
  git(repo, 'log', '--all', '-1', '--format=%h', `-S"version": "${version}"`, '--', path).trim() !==
  '';

// {releases, npm} for one window, or null when the repository has no
// package.json and only commit subjects can say what was released.
export const releasesInWindow = (repo, sinceMs, untilMs, {npmTimes = npmPublishTimes} = {}) => {
  const pkgs = packagesOf(repo);
  if (!pkgs.length) return null;
  const byPath = new Map(pkgs.map(p => [p.path, p]));
  const found = new Map();
  const add = (pkg, version, fields) => {
    const key = pkg.path + '\t' + version;
    found.set(key, {
      ...(found.get(key) ?? {package: pkg.name, path: pkg.path, version}),
      ...fields
    });
  };
  const npm = {};
  for (const pkg of pkgs) {
    if (pkg.private) continue;
    const published = npmTimes(pkg.name);
    npm[pkg.name] = published.status;
    for (const [version, ts] of Object.entries(published.times))
      if (ts >= sinceMs && ts <= untilMs) add(pkg, version, {npm_ts: ts});
  }
  for (const b of versionBumps(repo, [...byPath.keys()], sinceMs, untilMs))
    add(byPath.get(b.path), b.version, {
      bump: {sha: b.sha, ts: b.ts, from: b.from, subject: b.subject}
    });
  const tags = new Set(
    git(repo, 'for-each-ref', 'refs/tags', '--format=%(refname:short)').split('\n').filter(Boolean)
  );
  const releases = [...found.values()]
    .map(r => {
      const expected = expectedTags(byPath.get(r.path), r.version);
      const tag = expected.find(t => tags.has(t)) ?? null;
      return {
        ...r,
        ts: Math.min(r.npm_ts ?? Infinity, r.bump?.ts ?? Infinity),
        recorded: r.bump ? true : recordedAnywhere(repo, r.path, r.version),
        tag,
        ...(!tag && {tag_expected: expected})
      };
    })
    .sort((a, b) => a.ts - b.ts);
  return {releases, npm};
};

// More than one release of a package inside a single session. Eugene's rule:
// possible, but it should be an exception — a second same-session release
// usually means either a critical bug surfaced or the first was cut early. The
// known-legitimate case is debugging a dependent repo against an unpublished
// change, which is itself a process gap (link the package locally instead).
export const multiRelease = releases => {
  const byPackage = new Map();
  for (const r of releases) byPackage.set(r.path, [...(byPackage.get(r.path) ?? []), r]);
  return [...byPackage.values()]
    .filter(group => group.length > 1)
    .map(group => ({
      package: group[0].package,
      count: group.length,
      span_min: Math.round((group[group.length - 1].ts - group[0].ts) / 60000),
      releases: group.map(r => ({
        version: r.version,
        sha: r.bump?.sha ?? r.sha ?? null,
        subject: r.bump?.subject ?? r.subject ?? null,
        npm_iso: r.npm_ts ? new Date(r.npm_ts).toISOString() : null,
        tag: r.tag,
        driver: r.driver?.text ?? null
      }))
    }));
};

// Convenience for callers that only have a project dir and a row window.
export const correlateSession = (projectDir, startMs, endMs, turns = [], opts = {}) => {
  const repo = repoForProject(projectDir);
  if (!repo) return {repo: null, commits: [], releases: [], npm: {}, multi_release: []};
  const attributed = attributeCommits(commitsInWindow(repo, startMs, endMs, opts), turns);
  const untilMs = endMs + (opts.slackSec ?? 900) * 1000;
  const found = releasesInWindow(repo, startMs, untilMs, opts) ?? {
    releases: attributed
      .filter(c => isVersionBump(c.subject))
      .map(c => ({package: null, path: null, version: null, ...c, tag: null})),
    npm: {}
  };
  const releases = attributeCommits(found.releases, turns);
  return {
    repo,
    commits: attributed,
    correction_driven: attributed.filter(c => c.driver?.is_correction).length,
    releases,
    npm: found.npm,
    multi_release: multiRelease(releases)
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
      r = asHumanRow(r);
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
