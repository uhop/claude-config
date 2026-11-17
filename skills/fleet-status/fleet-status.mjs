#!/usr/bin/env node

// fleet-status — collector for the GitHub-side state of fleet repositories
// (agent-workflow queue item `/fleet-status`, filed 2026-08-28). The script does
// every mechanical step — enumeration, the `gh api` reads (REST plus the fixed
// discussions GraphQL query), the diff against the per-project baseline kept in
// the vault's data file `projects/<name>/data/github.json`, the baseline write,
// the fleet digest, and the queue-item upsert — and prints JSON. The agent reads
// the events and does only the judgment: pre-reviews and what deserves attention.
//
//   fleet-status.mjs collect --cwd [--project NAME] [--out FILE] [--since-days N] [--star-logins] [--jobs N]
//   fleet-status.mjs collect --repo OWNER/NAME [--project NAME] [...]
//   fleet-status.mjs collect --fleet [--owner LOGIN] [...]
//   fleet-status.mjs collect ... --show | --brief             # also print the full view, or the brief
//   fleet-status.mjs show FILE [--brief]                      # a collected file: full view, or the brief
//   fleet-status.mjs show (--cwd | --repo OWNER/NAME | --project NAME) [--since WHEN | --runs N]
//                                                             # stored baseline + stored movement, no GitHub
//   fleet-status.mjs show --fleet [--since WHEN | --runs N]   # stored movement across the fleet (the brief)
//   fleet-status.mjs show --fleet --table [--packages]        # standing counts per repository (or package), from the baselines
//   fleet-status.mjs collect ... --no-packages | --packages-only [--npm-user LOGIN]
//   fleet-status.mjs commit FILE [--dry-run]
//   fleet-status.mjs file --project NAME --title TITLE --body-file FILE [--source 'github OWNER/NAME#123'] [--section Active|Inbox] [--dry-run]
//
// Rulings (2026-08-28): collection runs only for github.com repositories — --cwd
// on any other host, or with no remote, prints {skipped: true} and exits 0.
// --fleet enumerates public, non-archived, non-fork repositories of the
// authenticated account. A private repository is collected only when a
// project's `trackers:` names it (ruled 2026-10-06), and --fleet adds every
// repository a declaration names, under the declaring project. Every GitHub call is a
// read; the GraphQL query is fixed text and asserted mutation-free. A missing or
// expired `gh` login is reported to the operator (exit 3), never a silent empty
// result. Stars are count-only unless --star-logins; forks always carry logins.
//
// Brief and stored runs (2026-08-29): `--brief` is the executive view — one line
// per repository with movement, action-worthy events only, counters folded into
// a tail line. `commit` records every run that carries events (any mode; a fleet
// run always) beside each project's baseline, a JSON line a project in
// `projects/<name>/data/github-runs/<YYYY-MM>.jsonl` (vault-storage D763; before it,
// whole runs in `projects/agent-workflow/data/fleet-runs/`, which the server still
// reads), and `show --fleet` and `show --repo` read them back joined through the
// server's `GET /fleet/status`, answering "what moved since WHEN" from the vault alone, and
// collection can run as a section of the manual daily playbook (one host, since
// 2026-09-05; never on a schedule, by ruling) without consuming the events a
// later look needs. Items and comments carry an `excerpt` (first line of the
// body) for it.
//
// Parallel collection and watcher logins (2026-09-05): repositories are read by
// a pool of --jobs workers (default 6) — the fleet of 51 took 5m52s of wall
// clock for 1m23s of CPU when sequential, every `gh api` call being a process
// plus a TLS handshake. Progress lines print in completion order; the digest
// keeps enumeration order. Watchers carry the login like forks: a watcher
// subscribes to notifications, so a spam account watching is worth a name.
//
// Packages (approved 2026-09-14): a second pass covers every package the npm
// account publishes, found by the registry's maintainer search and mapped to a
// project through its repository URL — the last week's downloads, 52 weekly
// totals, the top versions, deps.dev dependents with a history the baseline
// keeps, an all-time total, and the package's place in dotfiles' `fleet-deps`
// graph. It lands in `projects/<name>/data/packages.json`, beside `github.json`; the only
// event is a dependents count that moved. npm, the registry, and deps.dev are
// read with plain GETs.
//
// Exit codes: 0 ok · 1 usage/HTTP error · 2 missing tool · 3 gh not authenticated.

import {execFile, execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {
  fileItem as fileQueueItem,
  SOURCE_HELP,
  SOURCE_RE,
  trackersOf
} from '../vault/queue-items.mjs';
import {projectOf} from '../vault/vault-project.mjs';
import {vaultSettings} from '../vault/vault-settings.mjs';
import {vaultFetch as fetchWaiting} from '../vault/vault-fetch.mjs';

if (!import.meta.main)
  throw new Error(
    'fleet-status.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const usage = `Usage:
  fleet-status.mjs collect (--cwd | --repo OWNER/NAME | --fleet) [--project NAME] [--owner LOGIN]
                           [--out FILE] [--since-days N] [--star-logins] [--jobs N] [--show] [--brief]
                           [--no-packages | --packages-only] [--npm-user LOGIN]
  fleet-status.mjs show FILE [--brief]                         # a collected file: full view, or the brief
  fleet-status.mjs show (--cwd | --repo OWNER/NAME | --project NAME) [--since WHEN | --runs N]
                                                               # stored baseline + stored movement, no GitHub access
  fleet-status.mjs show --fleet [--since WHEN | --runs N]      # stored movement across the fleet (the brief)
  fleet-status.mjs show --fleet --table [--packages]           # standing counts per repository (or package), from the baselines
  fleet-status.mjs commit FILE [--dry-run]
  fleet-status.mjs file --project NAME --title TITLE --body-file FILE [--source 'github OWNER/NAME#123'] [--section Active|Inbox] [--dry-run]

WHEN is an ISO date or time, or days back such as 7d (default 7d for --fleet, 30d for one repository).
Exit codes: 0 ok · 1 usage/HTTP error · 2 missing tool · 3 gh not authenticated (run: gh auth login)`;

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

// ─── Arguments ───────────────────────────────────────────────────────────────

const VALUE_FLAGS = new Set([
  '--project',
  '--owner',
  '--out',
  '--since-days',
  '--repo',
  '--title',
  '--body-file',
  '--source',
  '--section',
  '--since',
  '--runs',
  '--jobs',
  '--npm-user'
]);
const BOOL_FLAGS = new Set([
  '--cwd',
  '--fleet',
  '--star-logins',
  '--no-packages',
  '--packages-only',
  '--packages',
  '--show',
  '--brief',
  '--table',
  '--dry-run',
  '--help',
  '-h'
]);

const parseArgs = argv => {
  const opts = {_: []};
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      if (i + 1 >= argv.length) fail(1, `${arg} needs a value\n\n${usage}`);
      opts[arg.slice(2)] = argv[++i];
    } else if (BOOL_FLAGS.has(arg)) {
      opts[arg.replace(/^-+/, '')] = true;
    } else if (arg.startsWith('-')) {
      fail(1, `Unknown flag: ${arg}\n\n${usage}`);
    } else {
      opts._.push(arg);
    }
  }
  return opts;
};

const opts = parseArgs(process.argv.slice(2));
if (opts.help || opts.h || opts._.length === 0) {
  console.log(usage);
  process.exit(opts._.length === 0 && !opts.help && !opts.h ? 1 : 0);
}
const command = opts._[0];
const dryRun = Boolean(opts['dry-run']);

// ─── Process helpers ─────────────────────────────────────────────────────────

const run = (cmd, argv, extra = {}) => {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, argv, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
        ...extra
      }).trim()
    };
  } catch (err) {
    if (err.code === 'ENOENT') fail(2, `${cmd} is not installed or not on PATH`);
    return {
      ok: false,
      out: (err.stdout ?? '').toString().trim(),
      err: (err.stderr ?? err.message ?? '').toString().trim(),
      status: err.status
    };
  }
};

// The async twin of `run`, for the per-repository reads that run concurrently:
// same result shape, same ENOENT exit.
const runAsync = (cmd, argv, extra = {}) =>
  new Promise(resolve => {
    execFile(
      cmd,
      argv,
      {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...extra},
      (err, stdout, stderr) => {
        if (!err) return resolve({ok: true, out: stdout.trim()});
        if (err.code === 'ENOENT') fail(2, `${cmd} is not installed or not on PATH`);
        resolve({
          ok: false,
          out: (stdout ?? '').toString().trim(),
          err: (stderr ?? err.message ?? '').toString().trim(),
          status: typeof err.code === 'number' ? err.code : null
        });
      }
    );
  });

class GhError extends Error {
  constructor(status, message, route) {
    super(message);
    this.status = status;
    this.route = route;
  }
}

const ghError = (r, route, body = r.out) => {
  let message = r.err || 'gh api failed',
    status = null;
  try {
    const j = JSON.parse(body);
    if (j.message) message = j.message;
    if (j.status) status = Number(j.status);
  } catch {}
  const m = /HTTP (\d{3})/.exec(r.err ?? '');
  if (m) status = Number(m[1]);
  return new GhError(status, message, route);
};

// One REST read. With paginate, walks `page=` until a short page — never
// `--paginate`, whose output shape depends on the gh version.
const ghApi = async (route, {paginate = false, headers = []} = {}) => {
  const sep = route.includes('?') ? '&' : '?';
  const page = async n => {
    const argv = ['api'];
    for (const h of headers) argv.push('-H', h);
    argv.push(paginate ? `${route}${sep}per_page=100&page=${n}` : route);
    const r = await runAsync('gh', argv);
    if (!r.ok) throw ghError(r, route);
    return r.out ? JSON.parse(r.out) : null;
  };
  if (!paginate) return page(1);
  const all = [];
  for (let n = 1; n <= 50; ++n) {
    const chunk = await page(n);
    if (!Array.isArray(chunk)) return chunk;
    all.push(...chunk);
    if (chunk.length < 100) break;
  }
  return all;
};

const requireGhAuth = () => {
  const r = run('gh', ['auth', 'status']);
  if (r.ok) return;
  const message = (r.err || r.out || 'gh auth status failed').split(/\r?\n/)[0];
  console.log(
    JSON.stringify(
      {
        error: 'gh_auth',
        message,
        hint: 'GitHub collection needs a valid gh login on this host — run: gh auth login'
      },
      null,
      2
    )
  );
  fail(3, `gh is not authenticated (${message}) — operator: run \`gh auth login\` on this host`);
};

// ─── Vault helpers ───────────────────────────────────────────────────────────

const {base: VAULT, token: TOKEN, problem: VAULT_PROBLEM} = vaultSettings();
const requireVault = () => {
  if (VAULT_PROBLEM) fail(1, VAULT_PROBLEM);
};

const vaultFetch = (route, init = {}) =>
  fetchWaiting(`${VAULT}${route}`, {
    ...init,
    headers: {Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {})}
  });

// The collector calls the account through this; a write is logged in its place under --dry-run.
const api = async (route, {method = 'GET', body, contentType} = {}) => {
  if (dryRun && method !== 'GET') {
    console.log(`DRY RUN — would ${method} ${route} (${body?.length ?? 0} bytes)`);
    return {status: 200, text: ''};
  }
  const headers = contentType ? {'Content-Type': contentType} : {};
  const r = await vaultFetch(route, {method, body, headers});
  return {status: r.status, text: await r.text()};
};

// One repository's collection, its diff into events, the brief, and the baseline's and the run's
// writes are the Program Clerk plugin's, which every fleet host installs (vault-storage D762, D763);
// this script keeps the fleet's enumeration, the packages, and the stored views.
// PROGRAM_CLERK_PLUGIN_ROOT: the test seam, a plugin folder in place of the installed one.
const pluginRoot = () => {
  if (process.env.PROGRAM_CLERK_PLUGIN_ROOT) return process.env.PROGRAM_CLERK_PLUGIN_ROOT;
  const listed = run('claude', ['plugin', 'list', '--json']);
  const plugins = listed.ok ? JSON.parse(listed.out) : [];
  return plugins.find(p => p.id === 'program-clerk@program-clerk' && p.enabled)?.installPath;
};
const collectorPath = path.join(pluginRoot() ?? '', 'scripts', 'lib', 'github.mjs');
if (!existsSync(collectorPath))
  fail(
    2,
    `the Program Clerk plugin's collector is missing (${collectorPath}): install or update the plugin, \`claude plugin update program-clerk@program-clerk\``
  );
const collector = await import(pathToFileURL(collectorPath).href);

// Arrays of scalars on one line: a weekly series or a history point stays one
// line instead of one line per number. Names, dates, and versions never hold
// brackets, so the pattern cannot split a string.
const compactJson = value =>
  JSON.stringify(value, null, 2).replace(
    /\[\n\s+([^[\]{}]*?)\n\s*\]/g,
    (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`
  );

// A project's baselines as data files (vault-storage 10g-2, question 228): the GitHub
// snapshot and the npm one, each written whole by `commit`; before that server, the
// `## GitHub` and `## Packages` blocks of its `state.md`, which the server takes in.
const githubDataPath = project => `projects/${project}/data/github.json`;
const packagesDataPath = project => `projects/${project}/data/packages.json`;
const baselineFolder = project => `projects/${project}/data/`;

const dataGet = async dataPath => {
  const r = await vaultFetch(`/data/${dataPath}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET /data/${dataPath}: ${r.status} ${r.statusText}`);
  return r.text();
};

const dataPut = async (dataPath, text) => {
  if (dryRun) {
    console.log(`DRY RUN — would PUT /data/${dataPath} (${text.length} bytes)`);
    return;
  }
  const r = await vaultFetch(`/data/${dataPath}`, {
    method: 'PUT',
    headers: {'Content-Type': 'text/plain; charset=utf-8'},
    body: text
  });
  if (!r.ok)
    throw new Error(`PUT /data/${dataPath}: ${r.status} ${(await r.text()).slice(0, 300)}`);
};

const parseObject = text => {
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

const readBaseline = async project => {
  const [github, packages] = await Promise.all([
    dataGet(githubDataPath(project)),
    dataGet(packagesDataPath(project))
  ]);
  return {baseline: parseObject(github), packages: parseObject(packages)};
};

const sameRepo = (a, b) => a?.toLowerCase() === b?.toLowerCase();

// The GitHub repositories a project's `trackers:` declares (vault-storage D95):
// the only private ones collected.
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9.-]*$/;
const trackedReposOf = async project => {
  if (!PROJECT_NAME_RE.test(project)) return [];
  const {trackers} = await trackersOf(project);
  return trackers
    .filter(t => t.kind === 'github')
    .map(t => /^([^/\s]+)\/([^/\s]+)$/.exec(t.ref ?? ''))
    .filter(Boolean)
    .map(([repo, owner, name]) => ({owner, name, repo, project}));
};

const isTrackedBy = async (project, repo) =>
  (await trackedReposOf(project)).some(t => sameRepo(t.repo, repo));

// Every declaration in the vault, in project order: one read per project.
const trackedRepos = async () => {
  const r = await vaultFetch('/vault/projects/');
  if (!r.ok) throw new Error(`GET /vault/projects/: ${r.status} ${r.statusText}`);
  const projects = ((await r.json()).files ?? [])
    .filter(f => f.endsWith('/'))
    .map(f => f.slice(0, -1))
    .filter(p => PROJECT_NAME_RE.test(p))
    .sort();
  return (await pool(projects, 8, trackedReposOf)).flat();
};

// ─── Repository resolution ───────────────────────────────────────────────────

const parseGithubRemote = url => {
  const m =
    /^(?:git\+)?(?:git@github\.com:|https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git:\/\/github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
      typeof url === 'string' ? url.trim() : ''
    );
  return m ? {owner: m[1], name: m[2]} : null;
};

const resolveCwd = () => {
  const top = run('git', ['rev-parse', '--show-toplevel']);
  if (!top.ok) return {skipped: true, reason: 'not_a_git_repo'};
  const root = top.out;
  const remote = run('git', ['-C', root, 'config', '--get', 'remote.origin.url']);
  if (!remote.ok || !remote.out) return {skipped: true, reason: 'no_remote', root};
  const gh = parseGithubRemote(remote.out);
  if (!gh) return {skipped: true, reason: 'not_github', remote: remote.out, root};
  return {owner: gh.owner, name: gh.name, project: opts.project || projectOf(root), root};
};

const listFleet = owner => {
  const r = run('gh', [
    'repo',
    'list',
    owner,
    '--visibility',
    'public',
    '--limit',
    '500',
    '--json',
    'name,nameWithOwner,isArchived,isFork,isPrivate'
  ]);
  if (!r.ok) fail(1, `gh repo list ${owner} failed: ${r.err || r.out}`);
  return JSON.parse(r.out)
    .filter(x => !x.isArchived && !x.isFork && !x.isPrivate)
    .map(x => ({owner, name: x.name, project: x.name}))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// ─── Collection ──────────────────────────────────────────────────────────────

const countBy = (list, key) =>
  list.reduce((m, x) => {
    const k = key(x) ?? 'unknown';
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

// --packages-only still honors the private-repository gate; --fleet already
// applied it at enumeration, so it skips the read.
const probeRepo = async ({owner, name, project, tracked}, enumerated) => {
  const repo = `${owner}/${name}`;
  if (
    !enumerated &&
    !tracked &&
    (await ghApi(`repos/${repo}`)).private &&
    !(await isTrackedBy(project, repo))
  )
    return {repo, project, skipped: true, reason: 'private', events: [], summary: {events: 0}};
  return {repo, project, events: [], summary: {events: 0}, errors: []};
};

// ─── Packages ────────────────────────────────────────────────────────────────
// Endpoint facts, measured 2026-09-13: topics/npm-download-counts-are-not-users
// § How to check any package.

const NPM_API = 'https://api.npmjs.org',
  NPM_REGISTRY = 'https://registry.npmjs.org',
  DEPS_DEV = 'https://api.deps.dev';
const DAY_MS = 864e5;
const NPM_DATA_START = '2015-01-10';
// The bulk form takes 128 unscoped names and 365 days; scoped names go alone.
const BULK_NAMES = 128,
  BULK_DAYS = 365;
const WEEKS_KEPT = 52;
const TOP_VERSIONS = 5;
// Below this many downloads a week the version split is mirror traffic
// (~100-150 per published version), so it is not read.
const PER_VERSION_MIN = 100;
// The newest days of a range can still read 0; the running total settles
// only days older than this and re-reads the rest every run.
const UNSETTLED_DAYS = 3;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isoDay = t => new Date(t).toISOString().slice(0, 10);
const addDays = (day, n) => isoDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
const maxDay = (a, b) => (a > b ? a : b);
const minDay = (...days) => days.reduce((a, b) => (a < b ? a : b));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Concurrency and start spacing per host. api.npmjs.org limits bursts and
// sends no rate-limit headers: two back-to-back streams drew 429s after ~19
// calls, while starts 250 ms apart ran clean (2026-09-14).
const HOSTS = {
  'api.npmjs.org': {slots: 2, spacing: 250},
  'registry.npmjs.org': {slots: 4, spacing: 0},
  'api.deps.dev': {slots: 8, spacing: 0}
};
const hostQueues = new Map();
const withHostSlot = async (url, fn) => {
  const host = new URL(url).host;
  const {slots, spacing} = HOSTS[host] ?? {slots: 4, spacing: 0};
  let q = hostQueues.get(host);
  if (!q) hostQueues.set(host, (q = {active: 0, waiting: [], nextStart: 0}));
  if (q.active < slots) ++q.active;
  else await new Promise(resolve => q.waiting.push(resolve));
  try {
    if (spacing) {
      const at = Math.max(Date.now(), q.nextStart);
      q.nextStart = at + spacing;
      if (at > Date.now()) await sleep(at - Date.now());
    }
    return await fn();
  } finally {
    const next = q.waiting.shift();
    if (next) next();
    else --q.active;
  }
};

// Retries 429, 5xx, and network failures, honoring Retry-After; the backoff
// sleeps outside the host slot.
const HTTP_RETRIES = 4;
const httpJson = async (url, {allow404 = false} = {}) => {
  for (let attempt = 0; ; ++attempt) {
    const outcome = await withHostSlot(url, async () => {
      let r;
      try {
        r = await fetch(url, {signal: AbortSignal.timeout(30_000)});
      } catch (err) {
        return {retry: true, error: new HttpError(null, `GET ${url}: ${err.message}`)};
      }
      if (r.status === 404 && allow404) {
        await r.arrayBuffer().catch(() => null);
        return {value: null};
      }
      if (r.status === 429 || r.status >= 500) {
        await r.arrayBuffer().catch(() => null);
        return {
          retry: true,
          after: Number(r.headers.get('retry-after')),
          error: new HttpError(r.status, `GET ${url}: ${r.status} ${r.statusText}`)
        };
      }
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return {
          error: new HttpError(
            r.status,
            `GET ${url}: ${r.status} ${text.slice(0, 200) || r.statusText}`
          )
        };
      }
      return {value: await r.json()};
    });
    if (!outcome.error) return outcome.value;
    if (!outcome.retry || attempt >= HTTP_RETRIES) throw outcome.error;
    await sleep(outcome.after > 0 ? Math.min(outcome.after, 60) * 1000 : 2000 * 3 ** attempt);
  }
};

const pool = async (items, size, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({length: Math.min(size, items.length)}, worker));
  return out;
};

const compareParts = (pa, pb) => {
  for (let i = 0; i < Math.max(pa.length, pb.length); ++i) {
    const x = pa[i] ?? '',
      y = pb[i] ?? '';
    const d = /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y);
    if (d) return d;
  }
  return 0;
};

// Semver precedence: build metadata is ignored, and a release sorts above its
// own prereleases.
const compareVersions = (a, b) => {
  const [mainA, preA = ''] = a.replace(/\+.*$/, '').split(/-(.*)/),
    [mainB, preB = ''] = b.replace(/\+.*$/, '').split(/-(.*)/);
  const d = compareParts(mainA.split('.'), mainB.split('.'));
  if (d || preA === preB) return d;
  if (!preA || !preB) return preA ? -1 : 1;
  return compareParts(preA.split('.'), preB.split('.'));
};

// Caret semantics: below 1.0.0 the minor is the breaking part.
const majorOf = version => {
  const [major, minor] = version.split('.');
  return major === '0' ? `0.${minor}` : major;
};

// The fleet graph comes from dotfiles' `fleet-deps` (ruled 2026-09-14: one
// graph, kept there). Missing or failing, it costs the relations, not the run.
const readFleetGraph = () =>
  new Promise(resolve =>
    execFile(
      'fleet-deps',
      ['--json'],
      {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300_000},
      (err, stdout, stderr) => {
        if (err)
          return resolve({
            error:
              err.code === 'ENOENT'
                ? 'fleet-deps is not installed or not on PATH'
                : `fleet-deps --json: ${(stderr || err.message).trim().split(/\r?\n/).pop()}`
          });
        try {
          resolve({graph: JSON.parse(stdout)});
        } catch (e) {
          resolve({error: `fleet-deps --json: ${e.message}`});
        }
      }
    )
  );

// Per package name: its repository, update level, direct edges both ways,
// every transitive dependent in update order, and the project of each package
// named, so a page can link them.
const fleetRelations = (graph, projectOf) => {
  const nameOf = key => graph.owners?.[key]?.name ?? key;
  const projectOfKey = key => projectOf(graph.owners?.[key]?.owner ?? null, nameOf(key));
  const levelOf = new Map();
  for (const l of graph.levels ?? []) for (const k of l.keys) levelOf.set(k, l.level);
  const relations = new Map();
  for (const key of graph.keys ?? []) {
    const seen = new Set(),
      queue = (graph.reverse?.[key] ?? []).map(e => e.key);
    while (queue.length) {
      const k = queue.shift();
      if (seen.has(k) || k === key) continue;
      seen.add(k);
      for (const e of graph.reverse?.[k] ?? []) queue.push(e.key);
    }
    const inOrder = [...seen].sort(
      (a, b) => (levelOf.get(a) ?? 0) - (levelOf.get(b) ?? 0) || nameOf(a).localeCompare(nameOf(b))
    );
    const forward = graph.forward?.[key] ?? [],
      reverse = graph.reverse?.[key] ?? [];
    const named = [...forward.map(e => e.key), ...reverse.map(e => e.key), ...inOrder];
    relations.set(nameOf(key), {
      repo: graph.owners?.[key]?.owner ?? null,
      level: levelOf.get(key) ?? null,
      uses: forward.map(e => [nameOf(e.key), e.kind]),
      used_by: reverse.map(e => [nameOf(e.key), e.kind]),
      dependents_in_order: inOrder.map(nameOf),
      projects: Object.fromEntries(named.map(k => [nameOf(k), projectOfKey(k)]))
    });
  }
  return relations;
};

// The registry account behind the fleet: --npm-user, else the publisher of a
// candidate whose manifest points back at its fleet repository. A private
// package's name can belong to a stranger on npm (vault-storage, 2026-09-14).
const resolveNpmUser = async candidates => {
  if (opts['npm-user']) return opts['npm-user'];
  for (const {name, repo} of candidates.slice(0, 12)) {
    const manifest = await httpJson(`${NPM_REGISTRY}/${encodeURIComponent(name)}/latest`, {
      allow404: true
    }).catch(() => null);
    const repository = manifest?.repository;
    const gh = parseGithubRemote(typeof repository === 'string' ? repository : repository?.url);
    if (
      manifest?._npmUser?.name &&
      gh &&
      `${gh.owner}/${gh.name}`.toLowerCase() === repo?.toLowerCase()
    )
      return manifest._npmUser.name;
  }
  return null;
};

const npmPackagesOf = async user => {
  const found = [];
  for (let from = 0; ;) {
    const page = await httpJson(
      `${NPM_REGISTRY}/-/v1/search?text=${encodeURIComponent(`maintainer:${user}`)}&size=250&from=${from}`
    );
    const objects = page.objects ?? [];
    found.push(...objects.map(o => o.package));
    from += objects.length;
    if (!objects.length || from >= (page.total ?? 0)) break;
  }
  return found;
};

// Daily downloads over [from, to], at most BULK_DAYS days: unscoped names in
// bulk reads, scoped names alone. Every echoed span is asserted, since a
// single-name range past 18 months comes back cut short without an error.
const readDaily = async (names, from, to) => {
  const days = new Map(),
    failed = new Map();
  const unscoped = names.filter(n => !n.startsWith('@'));
  const batches = [];
  for (let i = 0; i < unscoped.length; i += BULK_NAMES)
    batches.push(unscoped.slice(i, i + BULK_NAMES));
  for (const n of names) if (n.startsWith('@')) batches.push([n]);
  await pool(batches, 2, async batch => {
    try {
      const body = await httpJson(
        `${NPM_API}/downloads/range/${from}:${to}/${batch.map(encodeURIComponent).join(',')}`,
        {allow404: true}
      );
      for (const name of batch) {
        const one = batch.length === 1 ? body : body?.[name];
        if (!one) failed.set(name, new Error(`no download data for ${from}:${to}`));
        else if (one.start !== from || one.end !== to)
          failed.set(name, new Error(`range ${from}:${to} came back as ${one.start}:${one.end}`));
        else days.set(name, new Map((one.downloads ?? []).map(d => [d.day, d.downloads])));
      }
    } catch (err) {
      for (const name of batch) failed.set(name, err);
    }
  });
  return {days, failed};
};

// npm numbers for every published package at once, so the download reads go
// in bulk: one window read, then the all-time backfill in 365-day chunks.
const collectNpmStats = async (listings, previousOf, noteFor) => {
  const stats = new Map();
  if (!listings.length) return stats;

  const described = new Map();
  await pool(listings, 8, async l => {
    try {
      described.set(
        l.name,
        await httpJson(`${DEPS_DEV}/v3/systems/npm/packages/${encodeURIComponent(l.name)}`, {
          allow404: true
        })
      );
    } catch (err) {
      noteFor(l.name, 'deps.dev', err);
    }
  });

  const probe = await httpJson(
    `${NPM_API}/downloads/point/last-week/${encodeURIComponent(listings[0].name)}`
  );
  const end = probe.end,
    windowStart = addDays(end, -(WEEKS_KEPT * 7 - 1));
  const window = await readDaily(
    listings.map(l => l.name),
    windowStart,
    end
  );

  const plans = new Map();
  for (const l of listings) {
    if (!window.days.has(l.name)) continue;
    const stored = previousOf(l.name)?.total;
    const prev =
      stored?.through && stored.since && typeof stored.settled === 'number' ? stored : null;
    const created = (described.get(l.name)?.versions ?? [])
      .map(v => v.publishedAt)
      .filter(Boolean)
      .sort()[0];
    if (!prev?.through && !created) {
      noteFor(l.name, 'total', new Error('no publish dates to start the total from'));
      continue;
    }
    const since = prev?.since ?? maxDay(created.slice(0, 10), NPM_DATA_START);
    plans.set(l.name, {
      since,
      from: prev?.through ? addDays(prev.through, 1) : since,
      through: maxDay(addDays(end, -UNSETTLED_DAYS), prev?.through ?? ''),
      settled: prev?.through ? prev.settled : 0,
      failed: null
    });
  }
  const older = [...plans].filter(([, p]) => p.from < windowStart);
  if (older.length) {
    for (let a = minDay(...older.map(([, p]) => p.from)); a < windowStart;) {
      const b = minDay(addDays(a, BULK_DAYS - 1), addDays(windowStart, -1));
      const due = older.filter(([, p]) => p.from <= b && !p.failed);
      const chunk = await readDaily(
        due.map(([n]) => n),
        a,
        b
      );
      for (const [name, plan] of due) {
        const days = chunk.days.get(name);
        if (!days) plan.failed = chunk.failed.get(name);
        else for (const [day, n] of days) if (day >= plan.from) plan.settled += n;
      }
      a = addDays(b, 1);
    }
  }

  // The two per-version reads run as separate queues: npm's is paced, and
  // deps.dev's would otherwise wait on it.
  const weekOf = name => {
    const daily = window.days.get(name);
    let n = 0;
    for (let d = 0; d < 7; ++d) n += daily?.get(addDays(end, -d)) ?? 0;
    return n;
  };
  const perVersion = new Map(),
    dependentsOf = new Map();
  await Promise.all([
    pool(
      listings.filter(l => window.days.has(l.name) && weekOf(l.name) >= PER_VERSION_MIN),
      2,
      async l => {
        try {
          const j = await httpJson(`${NPM_API}/versions/${encodeURIComponent(l.name)}/last-week`);
          perVersion.set(l.name, j.downloads ?? {});
        } catch (err) {
          noteFor(l.name, 'versions', err);
        }
      }
    ),
    (async () => {
      const pairs = listings.flatMap(l =>
        (described.get(l.name)?.versions ?? []).map(v => ({
          name: l.name,
          version: v.versionKey.version
        }))
      );
      const acc = new Map(listings.map(l => [l.name, {direct: 0, byVersion: {}, failed: null}]));
      await pool(pairs, 8, async ({name, version}) => {
        const a = acc.get(name);
        if (a.failed) return;
        try {
          const j = await httpJson(
            `${DEPS_DEV}/v3alpha/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:dependents`,
            {allow404: true}
          );
          if (!j) return;
          a.direct += j.directDependentCount ?? 0;
          if (j.directDependentCount || j.dependentCount)
            a.byVersion[version] = [j.directDependentCount ?? 0, j.dependentCount ?? 0];
        } catch (err) {
          a.failed = err;
        }
      });
      for (const [name, a] of acc) {
        if (a.failed) noteFor(name, 'dependents', a.failed);
        else if (described.get(name)?.versions?.length) dependentsOf.set(name, a);
      }
    })()
  ]);

  for (const listing of listings) {
    const name = listing.name;
    const previous = previousOf(name);
    const daily = window.days.get(name);
    if (!daily) {
      noteFor(name, 'downloads', window.failed.get(name) ?? new Error('no download data'));
      if (previous) stats.set(name, previous);
      continue;
    }
    stats.set(
      name,
      packageStats({
        listing,
        previous,
        daily,
        end,
        windowStart,
        versions: described.get(name)?.versions ?? [],
        perVersion: perVersion.get(name) ?? null,
        counted: dependentsOf.get(name) ?? null,
        plan: plans.get(name) ?? null,
        note: (what, err) => noteFor(name, what, err)
      })
    );
  }
  return stats;
};

const packageStats = ({
  listing,
  previous,
  daily,
  end,
  windowStart,
  versions,
  perVersion,
  counted,
  plan,
  note
}) => {
  const weekly = [];
  for (let w = 1; w <= WEEKS_KEPT; ++w) {
    const weekEnd = addDays(windowStart, 7 * w - 1);
    let n = 0;
    for (let d = 0; d < 7; ++d) n += daily.get(addDays(weekEnd, -d)) ?? 0;
    weekly.push(n);
  }
  const week = {start: addDays(end, -6), end, downloads: weekly[WEEKS_KEPT - 1]};
  const current = versions.find(v => v.isDefault) ?? null;
  const publishes = versions
    .filter(v => v.publishedAt && v.publishedAt.slice(0, 10) >= windowStart)
    .map(v => [v.publishedAt.slice(0, 10), v.versionKey.version])
    .sort((a, b) => a[0].localeCompare(b[0]) || compareVersions(a[1], b[1]));

  const counts = Object.entries(perVersion ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || compareVersions(b[0], a[0]));
  const byMajor = {};
  for (const [v, n] of counts) byMajor[majorOf(v)] = (byMajor[majorOf(v)] ?? 0) + n;

  // A partial read would record a false drop, so a failed one keeps the stored count.
  let dependents = previous?.dependents ?? null;
  if (counted) {
    const today = isoDay(Date.now());
    const history = (previous?.dependents?.history ?? []).filter(([day]) => day !== today);
    history.push([today, counted.direct]);
    dependents = {
      source: 'deps.dev',
      direct: counted.direct,
      by_version: Object.fromEntries(
        Object.entries(counted.byVersion).sort((a, b) => compareVersions(b[0], a[0]))
      ),
      history
    };
  }

  // The settled part grows by the days the window newly settles; the newest
  // days are re-read every run and only added on top.
  let total = previous?.total ?? null;
  if (plan?.failed) note('total', plan.failed);
  else if (plan) {
    let settled = plan.settled,
      recent = 0;
    for (const [day, n] of daily) {
      if (day > plan.through) recent += n;
      else if (day >= plan.from) settled += n;
    }
    total = {since: plan.since, through: plan.through, settled, downloads: settled + recent};
  }

  return {
    latest: listing.version ?? current?.versionKey.version ?? null,
    published_at: listing.date ?? current?.publishedAt ?? null,
    deprecated: Boolean(current?.isDeprecated),
    versions: versions.length || null,
    week,
    weekly,
    publishes,
    top_versions: counts.slice(0, TOP_VERSIONS),
    versions_total: perVersion ? counts.reduce((s, [, n]) => s + n, 0) : null,
    by_major: perVersion ? byMajor : null,
    dependents,
    total
  };
};

const diffPackages = (b, s, repo) => {
  if (!b) return [];
  const before = new Map((b.packages ?? []).map(p => [p.name, p]));
  const events = [];
  for (const p of s.packages) {
    const from = before.get(p.name)?.npm?.dependents?.direct,
      to = p.npm?.dependents?.direct;
    if (typeof from === 'number' && typeof to === 'number' && from !== to)
      events.push({kind: 'package.dependents', repo, package: p.name, from, to, delta: to - from});
  }
  return events;
};

// The packages pass: every package in the fleet graph or published by the npm
// account, grouped by project. `baselines` carries the `packages.json` baselines the
// GitHub pass already read; the rest are read here.
const collectPackages = async ({mode, targets, ghUser, jobs, baselines}) => {
  const errors = [];
  const lc = s => (s ?? '').toLowerCase();
  const fleetOwner = lc(opts.owner ?? ghUser);
  const targetByRepo = new Map(targets.map(t => [lc(`${t.owner}/${t.name}`), t]));
  const projectOf = (repo, name) => {
    if (!repo) return name.replace(/^@[^/]+\//, '');
    const t = targetByRepo.get(lc(repo));
    if (t) return t.project;
    const [owner, repoName] = repo.split('/');
    return lc(owner) === fleetOwner ? repoName : `${owner}-${repoName}`;
  };
  // By project, so a package whose repository moved stays with its project
  // (@uhop/vault-storage-mcp still names uhop/vault-storage, D139).
  const targetProjects = new Set(targets.map(t => t.project));
  const inScope = repo =>
    mode === 'fleet' || (Boolean(repo) && targetProjects.has(projectOf(repo)));

  const {graph, error: graphError} = await readFleetGraph();
  if (graphError) errors.push({where: 'fleet-deps', status: null, message: graphError});
  const relations = graph ? fleetRelations(graph, projectOf) : new Map();

  const candidates = [...relations]
    .sort(([, a], [, b]) => Number(inScope(b.repo)) - Number(inScope(a.repo)))
    .map(([name, rel]) => ({name, repo: rel.repo}));
  let listings = [],
    listingOk = false;
  try {
    const user = await resolveNpmUser(candidates);
    if (user) {
      listings = await npmPackagesOf(user);
      listingOk = true;
    } else
      errors.push({
        where: 'npm',
        status: null,
        message: 'no npm account found — pass --npm-user LOGIN'
      });
  } catch (err) {
    errors.push({where: 'npm:search', status: err.status ?? null, message: err.message});
  }

  const byName = new Map();
  for (const [name, rel] of relations) byName.set(name, {name, repo: rel.repo, listing: null});
  for (const listing of listings) {
    const gh = parseGithubRemote(listing.links?.repository);
    const entry = byName.get(listing.name) ?? {
      name: listing.name,
      repo: gh ? `${gh.owner}/${gh.name}` : null,
      listing: null
    };
    entry.listing = listing;
    byName.set(listing.name, entry);
  }

  const groups = new Map();
  for (const p of byName.values()) {
    if (!inScope(p.repo)) continue;
    const project = projectOf(p.repo, p.name);
    const group = groups.get(project) ?? {project, repo: p.repo, members: [], errors: []};
    group.members.push(p);
    groups.set(project, group);
  }
  for (const [project, g] of groups)
    if (!targetByRepo.has(lc(g.repo)) && !g.members.some(p => p.listing)) groups.delete(project);
  await pool(
    [...groups.values()].filter(g => !baselines.has(g.project)),
    jobs,
    async g => baselines.set(g.project, (await readBaseline(g.project)).packages)
  );

  const groupOf = new Map();
  for (const g of groups.values()) for (const p of g.members) groupOf.set(p.name, g);
  const previousOf = name =>
    baselines.get(groupOf.get(name)?.project)?.packages?.find(x => x.name === name)?.npm ?? null;
  const noteFor = (name, what, err) =>
    groupOf.get(name)?.errors.push({
      where: `npm:${name}:${what}`,
      status: err.status ?? null,
      message: err.message
    });
  const listed = [...groups.values()].flatMap(g =>
    g.members.filter(p => p.listing).map(p => p.listing)
  );
  let npm = new Map();
  try {
    npm = await collectNpmStats(listed, previousOf, noteFor);
  } catch (err) {
    errors.push({where: 'npm:downloads', status: err.status ?? null, message: err.message});
    for (const l of listed) if (previousOf(l.name)) npm.set(l.name, previousOf(l.name));
  }

  const collectedAt = new Date().toISOString();
  const result = new Map();
  for (const g of groups.values()) {
    const previous = baselines.get(g.project) ?? null;
    const prevOf = name => previous?.packages?.find(x => x.name === name) ?? null;
    // A run without fresh numbers keeps the stored ones: a failed listing, a
    // package the search index has not caught up with, a failed graph read.
    // Only a package the graph no longer lists, and npm never published, goes.
    const present = new Set(g.members.map(p => p.name));
    const carried = (previous?.packages ?? []).filter(
      p => !present.has(p.name) && (p.published || !graph)
    );
    for (const p of [...g.members, ...carried])
      if (listingOk && !p.listing && prevOf(p.name)?.published)
        g.errors.push({
          where: `npm:${p.name}`,
          status: null,
          message: 'not in the npm search this run; the stored numbers are kept'
        });
    const snapshot = {
      collected_at: collectedAt,
      graph: graph
        ? {fetched_at: graph.fetchedAt ?? null, orgs: graph.orgs ?? []}
        : (previous?.graph ?? null),
      packages: [
        ...g.members.map(p => ({
          name: p.name,
          repo: p.repo,
          published: Boolean(p.listing) || Boolean(prevOf(p.name)?.published),
          npm: npm.get(p.name) ?? prevOf(p.name)?.npm ?? null,
          fleet: relations.get(p.name) ?? (graph ? null : (prevOf(p.name)?.fleet ?? null))
        })),
        ...carried
      ].sort((a, b) => a.name.localeCompare(b.name))
    };
    const repo = g.repo ?? g.project;
    result.set(g.project, {
      repo,
      snapshot,
      first_run: !previous,
      events: diffPackages(previous, snapshot, repo),
      errors: g.errors
    });
  }
  return {groups: result, errors};
};

// ─── Commands ────────────────────────────────────────────────────────────────

// The safety gates (not github.com, no remote, private): silent for the
// caller, explicit in the JSON, exit 0.
const emitSkipped = payload => {
  const out = JSON.stringify(payload, null, 2);
  if (opts.out) writeFileSync(opts.out, out + '\n');
  if (opts.show || opts.brief) console.log(renderDigest(payload));
  else if (!opts.out) console.log(out);
  process.exit(0);
};

const collect = async () => {
  requireVault();
  const modes = ['cwd', 'repo', 'fleet'].filter(m => opts[m]);
  if (modes.length !== 1)
    fail(1, `collect needs exactly one of --cwd, --repo, --fleet\n\n${usage}`);
  const mode = modes[0];
  const sinceDays = Number(opts['since-days'] ?? 30);
  if (!(sinceDays > 0)) fail(1, '--since-days must be a positive number');
  const packagesOnly = Boolean(opts['packages-only']),
    withPackages = !opts['no-packages'];
  if (packagesOnly && !withPackages)
    fail(1, '--packages-only and --no-packages exclude each other');

  let targets = [];
  if (mode === 'cwd') {
    const r = resolveCwd();
    if (r.skipped) emitSkipped({skipped: true, mode, ...r});
    targets = [r];
  } else if (mode === 'repo') {
    const m = /^([^/\s]+)\/([^/\s]+)$/.exec(opts.repo ?? '');
    if (!m) fail(1, '--repo takes OWNER/NAME');
    // Without --project, a repository a declaration names belongs to that project.
    const declared =
      opts.project === undefined
        ? (await trackedRepos()).find(t => sameRepo(t.repo, m[0]))
        : undefined;
    targets = [
      {
        owner: m[1],
        name: m[2],
        project: opts.project ?? declared?.project ?? m[2],
        tracked: Boolean(declared)
      }
    ];
  }

  requireGhAuth();
  const ghUser = (await ghApi('user')).login;
  if (mode === 'fleet') {
    targets = listFleet(opts.owner ?? ghUser);
    // A project holds one GitHub baseline, so a declaration whose
    // project already collects a repository is reported and left out.
    for (const t of await trackedRepos()) {
      const listed = targets.find(x => sameRepo(`${x.owner}/${x.name}`, t.repo));
      const taken = targets.find(x => x.project === t.project);
      if (listed) listed.tracked = true;
      else if (taken)
        console.error(
          `${t.repo}: not collected — project ${t.project} already collects ${taken.owner}/${taken.name}`
        );
      else targets.push({owner: t.owner, name: t.name, project: t.project, tracked: true});
    }
  }

  const jobs = Number(opts.jobs ?? 6);
  if (!(Number.isInteger(jobs) && jobs >= 1 && jobs <= 16))
    fail(1, '--jobs must be an integer from 1 to 16');
  const starLogins = Boolean(opts['star-logins']);

  // A pool over the enumeration: each worker takes the next repository, so the
  // progress lines arrive in completion order while `results` keeps the
  // enumeration order for the digest. A repository that never reports is a
  // hole in the count, not silence.
  const results = new Array(targets.length);
  const packageBaselines = new Map();
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < targets.length) {
      const i = nextIndex++;
      const t = targets[i];
      const {baseline, packages} = await readBaseline(t.project);
      packageBaselines.set(t.project, packages);
      let entry;
      try {
        entry = packagesOnly
          ? await probeRepo(t, mode === 'fleet')
          : await collector.collectRepo({
              ...t,
              tracked:
                t.tracked ||
                (mode !== 'fleet' && (await isTrackedBy(t.project, `${t.owner}/${t.name}`))),
              baseline,
              sinceDays,
              starLogins,
              ghUser
            });
      } catch (err) {
        entry = {
          repo: `${t.owner}/${t.name}`,
          project: t.project,
          error: {status: err.status ?? null, message: err.message},
          events: [],
          summary: {events: 0}
        };
      }
      results[i] = entry;
      if (entry.skipped) {
        if (mode === 'fleet') console.error(`${entry.repo}: skipped (${entry.reason})`);
        continue;
      }
      if (packagesOnly && !entry.error) continue;
      const s = entry.summary ?? {};
      const kinds = Object.entries(s.by_kind ?? {})
        .map(([k, n]) => `${k}×${n}`)
        .join(', ');
      console.error(
        `${entry.repo}: ${entry.error ? `ERROR ${entry.error.message}` : `${s.events} event${s.events === 1 ? '' : 's'}${entry.first_run ? ` (first run — baseline only${entry.replaced_baseline ? `, replacing ${entry.replaced_baseline}'s` : ''})` : ''}${kinds ? ` [${kinds}]` : ''}`}${entry.errors?.length ? ` — ${entry.errors.length} partial error(s)` : ''}`
      );
    }
  };
  await Promise.all(Array.from({length: Math.min(jobs, targets.length)}, worker));

  const repos = [];
  for (const entry of results) {
    if (!entry) continue;
    if (entry.skipped) {
      if (mode !== 'fleet')
        emitSkipped({
          skipped: true,
          mode,
          reason: entry.reason,
          repo: entry.repo,
          project: entry.project
        });
      continue;
    }
    repos.push(entry);
  }

  // Packages attach to their project's entry; a fleet run adds an entry marked
  // `github: false` for a project with packages and no public fleet repository.
  let packageErrors = [];
  if (withPackages) {
    const phase = await collectPackages({
      mode,
      targets: repos.map(r => targets.find(t => t.project === r.project)).filter(Boolean),
      ghUser,
      jobs,
      baselines: packageBaselines
    });
    packageErrors = phase.errors;
    for (const e of packageErrors) console.error(`packages: ${e.where}: ${e.message}`);
    const byProject = new Map(repos.map(r => [r.project, r]));
    for (const [project, g] of phase.groups) {
      let entry = byProject.get(project);
      if (!entry) {
        // Only for something published: the graph also spans private repositories.
        if (!g.snapshot.packages.some(p => p.published)) continue;
        entry = {
          repo: g.repo,
          project,
          github: false,
          events: [],
          summary: {events: 0},
          errors: []
        };
        repos.push(entry);
      }
      entry.packages = g.snapshot;
      entry.packages_first_run = g.first_run;
      entry.errors = [...(entry.errors ?? []), ...g.errors];
      if (g.events.length) {
        entry.events = [...entry.events, ...g.events];
        entry.summary = {
          ...entry.summary,
          events: entry.events.length,
          by_kind: countBy(entry.events, e => e.kind)
        };
      }
      const published = g.snapshot.packages.filter(p => p.published).length;
      console.error(
        `${entry.repo}: ${plural(g.snapshot.packages.length, 'package')} (${published} published)${g.first_run ? ' — first packages run, baseline only' : ''}${g.events.length ? ` [${plural(g.events.length, 'package event')}]` : ''}${g.errors.length ? ` — ${g.errors.length} partial error(s)` : ''}`
      );
    }
  }

  const digest = {
    collected_at: new Date().toISOString(),
    mode,
    gh_user: ghUser,
    ...(packagesOnly ? {packages_only: true} : {}),
    repos,
    ...(packageErrors.length ? {package_errors: packageErrors} : {}),
    totals: {
      repos: repos.filter(r => r.github !== false).length,
      events: repos.reduce((n, r) => n + r.events.length, 0),
      first_run: repos.filter(r => r.first_run).length,
      errors: repos.filter(r => r.error).length,
      partial_errors: repos.reduce((n, r) => n + (r.errors?.length ?? 0), 0) + packageErrors.length,
      packages: repos.reduce(
        (n, r) => n + (r.packages?.packages.filter(p => p.published).length ?? 0),
        0
      )
    }
  };
  console.error(
    `total: repos=${digest.totals.repos} events=${digest.totals.events} first_run=${digest.totals.first_run} errors=${digest.totals.errors} partial=${digest.totals.partial_errors} packages=${digest.totals.packages}`
  );
  const out = JSON.stringify(digest, null, 2);
  if (opts.out) {
    writeFileSync(opts.out, out + '\n');
    console.error(`written: ${opts.out}`);
  }
  if (opts.show) console.log(renderDigest(digest));
  if (opts.brief) console.log(collector.renderBrief(digest));
  if (!opts.show && !opts.brief && !opts.out) console.log(out);
};

// Each baseline written whole to its data file; one whose text would not change is left.
const commitRepo = async (entry, {github}) => {
  let changed = github && (await collector.commitBaseline(api, entry)) === 'written';
  if (entry.packages) {
    const dataPath = packagesDataPath(entry.project);
    const text = `${compactJson(entry.packages)}\n`;
    if ((await dataGet(dataPath)) !== text) {
      await dataPut(dataPath, text);
      changed = true;
    }
  }
  return changed ? 'written' : 'unchanged';
};

const commit = async () => {
  requireVault();
  const file = opts._[1];
  if (!file) fail(1, `commit needs the JSON file collect wrote\n\n${usage}`);
  const digest = JSON.parse(readFileSync(file, 'utf8'));
  if (digest.skipped) {
    console.log('skipped collection — nothing to commit');
    return;
  }
  let written = 0;
  for (const entry of digest.repos ?? []) {
    const github = Boolean(!entry.error && entry.snapshot && !digest.packages_only);
    if (!github && !entry.packages) {
      console.log(
        `${entry.repo}: not committed (${entry.error?.message ?? (digest.packages_only ? 'no packages' : 'no snapshot')})`
      );
      continue;
    }
    const result = await commitRepo(entry, {github});
    ++written;
    console.log(
      `${entry.repo}: ${[github && 'GitHub', entry.packages && 'packages'].filter(Boolean).join(' + ')} baseline ${result} in ${baselineFolder(entry.project)}`
    );
  }
  for (const runPath of await collector.appendRuns(api, digest)) console.log(`run: ${runPath}`);
  console.log(`committed ${written} of ${digest.repos?.length ?? 0} repositories`);
};

// Files one review item in the Active section of a project's queue. The same
// title or the same `source` replaces the open item where it stands (the
// 2026-08-28 ruling: update, never duplicate), so a renamed thread updates its
// item; a project with no queue gets one.
const fileItem = async () => {
  requireVault();
  const {project, title} = opts;
  const bodyFile = opts['body-file'];
  if (!project || !title || !bodyFile)
    fail(1, `file needs --project, --title, --body-file\n\n${usage}`);
  if (!existsSync(bodyFile)) fail(1, `no such file: ${bodyFile}`);
  const body = readFileSync(bodyFile, 'utf8').trim();
  if (!body) fail(1, 'the item body is empty');
  const source = opts.source?.trim().replace(/\s+/g, ' ');
  if (source !== undefined && !SOURCE_RE.test(source)) fail(1, `${SOURCE_HELP}; got: ${source}`);
  // Where the item lands: Active (reflected review items, the default) or the
  // Inbox, when the project's GitHub entry declares `intake: triage`
  // (vault-storage D109; server ≥ 2026-09-30 parses the section).
  const section = opts.section === undefined ? 'Active' : opts.section;
  if (section !== 'Active' && section !== 'Inbox')
    fail(1, `--section is Active or Inbox; got: ${section}`);
  // A `**` run from a thread title would close the bold early and a newline
  // would end the item; the project page's Track button shapes titles alike.
  const clean = title
    .replace(/\*{2,}/g, '*')
    .replace(/\s+/g, ' ')
    .trim();
  const heading = /[.!?]$/.test(clean) ? clean : `${clean}.`;
  if (dryRun) {
    console.log(`DRY RUN — would file "${heading}" as an item note of ${project}`);
    return;
  }
  const filed = await fileQueueItem(project, {
    title: heading,
    section: section.toLowerCase(),
    source: source ?? null,
    body
  });
  console.log(`${filed.path}: item ${filed.replaced ? 'updated in place' : 'filed'}`);
};

// ─── Show ────────────────────────────────────────────────────────────────────

const plural = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
const short = iso => (iso ?? '').replace(/T(\d\d:\d\d).*$/, ' $1');
const byDesc = key => (a, b) => (key(b) ?? '').localeCompare(key(a) ?? '');

const num = n => (typeof n === 'number' ? n.toLocaleString('en-US') : '-');
const share = (n, total) => (total ? `${((100 * n) / total).toFixed(1)}%` : '-');
const edgeText = ([name, kind]) => (kind === 'dep' ? name : `${name} (${kind})`);

const packageLines = snapshot => {
  const lines = [];
  for (const p of snapshot?.packages ?? []) {
    const n = p.npm;
    if (n) {
      const top = (n.top_versions ?? []).map(([v, c]) => `${v} ${share(c, n.versions_total)}`);
      lines.push(
        `  npm ${p.name} ${n.latest ?? '?'}${n.published_at ? ` (${n.published_at.slice(0, 10)})` : ''}${n.deprecated ? ', deprecated' : ''}: ${num(n.week?.downloads)} downloads ${n.week?.start} to ${n.week?.end}${top.length ? `; top ${top.join(', ')}` : ''}; dependents ${num(n.dependents?.direct)}${n.total ? `; all-time ${num(n.total.downloads)} since ${n.total.since}` : ''}`
      );
    } else
      lines.push(`  package ${p.name}: ${p.published ? 'npm stats unavailable' : 'not published'}`);
    const f = p.fleet;
    if (f?.uses.length || f?.used_by.length)
      lines.push(
        `    fleet level ${f.level ?? '-'}${f.uses.length ? `; uses ${f.uses.map(edgeText).join(', ')}` : ''}${f.used_by.length ? `; used by ${f.used_by.map(edgeText).join(', ')}` : ''}`
      );
  }
  return lines;
};

const renderChanges = (entry, lines) => {
  if (entry.stored) return;
  if (!entry.events.length) {
    lines.push('  changes: none');
    return;
  }
  lines.push(`  changes (${entry.events.length}):`);
  for (const e of entry.events) lines.push(`    ${collector.eventLine(e)}`);
};

const renderRepo = entry => {
  if (entry.error)
    return [`${entry.repo}: ERROR ${entry.error.message}`, ...packageLines(entry.packages)].join(
      '\n'
    );
  if (!entry.snapshot) {
    const lines = [
      `${entry.repo} — ${entry.github === false ? 'packages only, no public fleet repository' : 'packages only'}${entry.packages ? `; collected ${short(entry.packages.collected_at)}` : ''}`,
      ...packageLines(entry.packages)
    ];
    renderChanges(entry, lines);
    if (entry.errors?.length)
      lines.push(
        `  partial errors (${entry.errors.length}): ${entry.errors.map(e => `${e.where}: ${e.message}`).join('; ')}`
      );
    return lines.join('\n');
  }
  const s = entry.snapshot,
    m = s.meta;
  const open = Object.entries(s.items).filter(([, it]) => it.state === 'open');
  const openIssues = open.filter(([, it]) => !it.is_pr),
    openPrs = open.filter(([, it]) => it.is_pr);
  const openDiscussions = Object.entries(s.discussions).filter(([, d]) => !d.closed);
  const advisories = Object.entries(s.advisories).sort(byDesc(([, a]) => a.published_at));
  const lines = [];
  lines.push(
    `${entry.repo} — ${plural(m.stars, 'star')}, ${plural(m.forks, 'fork')}, ${plural(m.watchers, 'watcher')}; ${plural(openIssues.length, 'open issue')}, ${plural(openPrs.length, 'open PR')}${m.has_discussions ? `, ${plural(openDiscussions.length, 'open discussion')}` : ''}; CI ${s.ci ? `${s.ci.conclusion ?? s.ci.status} (${s.ci.name}, ${short(s.ci.updated_at)})` : 'none'}`
  );
  const alertText = kind => {
    const a = s.alerts?.[kind];
    if (!a) return 'n/a';
    if (a.unavailable) return 'off';
    const bySeverity = Object.entries(a.by_severity ?? {})
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    return `${a.truncated ? '≥' : ''}${a.open}${bySeverity ? ` (${bySeverity})` : ''}`;
  };
  lines.push(
    `  alerts: dependabot ${alertText('dependabot')}, code scanning ${alertText('code_scanning')}; collected ${short(s.collected_at)}${s.window.first_run && !entry.stored ? ' (first run)' : ''}`
  );
  if (advisories.length) {
    lines.push(`  advisories (${advisories.length}):`);
    for (const [id, a] of advisories)
      lines.push(
        `    ${id}  ${a.state}  ${a.severity ?? '-'}  ${a.cve_id ?? 'no CVE'}  ${short(a.published_at)}  ${a.summary}`
      );
  }
  if (open.length) {
    lines.push(`  open items (${open.length}):`);
    for (const [n, it] of open.sort(byDesc(([, it]) => it.updated_at)))
      lines.push(
        `    ${it.is_pr ? 'PR' : 'issue'} #${n}  ${it.title}  — ${it.author}${it.bot ? ' (bot)' : ''}, ${plural(it.comments + it.review_comments, 'comment')}, ${plural(it.reactions + (it.comment_reactions ?? 0), 'reaction')}${it.last_comment ? `, last comment ${it.last_comment.author} ${short(it.last_comment.at)}` : ''}${it.draft ? ', draft' : ''}`
      );
  }
  if (openDiscussions.length) {
    lines.push(`  open discussions (${openDiscussions.length}):`);
    for (const [n, d] of openDiscussions.sort(byDesc(([, d]) => d.updated_at)))
      lines.push(
        `    #${n}  ${d.title}  — ${d.author}, ${d.category ?? '-'}, ${plural(d.comments, 'comment')}, ${plural(d.reactions + d.comment_reactions, 'reaction')}${d.last_comment ? `, last comment ${d.last_comment.author} ${short(d.last_comment.at)}` : ''}${d.answered ? ', answered' : ''}`
      );
  }
  const release = Object.values(s.releases).sort(byDesc(r => r.published_at))[0];
  if (release)
    lines.push(
      `  latest release: ${release.tag_name}${release.name ? ` — ${release.name}` : ''}${release.draft ? ' (draft)' : ''}${release.prerelease ? ' (prerelease)' : ''} ${short(release.published_at)}`
    );
  lines.push(...packageLines(entry.packages));
  if (entry.stored)
    lines.push(
      `  stored baseline as collected ${short(s.collected_at)} — run collect for the changes since`
    );
  else if (entry.first_run)
    lines.push('  changes: none — first run; the baseline is recorded on commit');
  else if (!entry.events.length) lines.push(`  changes since ${short(s.window.since)}: none`);
  else {
    lines.push(`  changes since ${short(s.window.since)} (${entry.events.length}):`);
    for (const e of entry.events) lines.push(`    ${collector.eventLine(e)}`);
  }
  if (entry.errors?.length)
    lines.push(
      `  partial errors (${entry.errors.length}): ${entry.errors.map(e => `${e.where}: ${e.message}`).join('; ')}`
    );
  return lines.join('\n');
};

const renderDigest = digest => {
  if (digest.skipped)
    return `skipped: ${digest.reason}${digest.remote ? ` (${digest.remote})` : ''}`;
  if (digest.error) return `${digest.error}: ${digest.message} — ${digest.hint}`;
  const parts = digest.repos.map(renderRepo);
  if (digest.mode === 'fleet') {
    const t = digest.totals;
    parts.push(
      `total: ${plural(t.repos, 'repository', 'repositories')}, ${plural(t.events, 'event')}, ${t.first_run} first-run, ${plural(t.errors, 'error')}`
    );
  }
  return parts.join('\n\n');
};

// ─── Stored runs ─────────────────────────────────────────────────────────────

const parseWhen = text => {
  const m = /^(\d+)d$/.exec(text);
  if (m) return new Date(Date.now() - Number(m[1]) * 864e5).toISOString();
  const t = Date.parse(text);
  if (Number.isNaN(t))
    fail(1, `--since takes an ISO date or time, or days back such as 7d: ${text}`);
  return new Date(t).toISOString();
};

// The stored runs newest first, as the server joins them from each project's month files (D763).
const readRuns = async () => {
  const r = await vaultFetch('/fleet/status?runs=1000');
  if (!r.ok) throw new Error(`GET /fleet/status: ${r.status} ${r.statusText}`);
  return (await r.json()).runs ?? [];
};

// Movement for one repository (or the fleet) merged from the stored runs that
// --since / --runs select, as a digest renderBrief takes.
const storedMovement = async (repo, defaultDays) => {
  const all = await readRuns();
  let runs,
    cutoff = null;
  if (opts.runs) {
    const n = Number(opts.runs);
    if (!(n > 0)) fail(1, '--runs must be a positive number');
    runs = all.filter(r => !repo || r.repos?.some(x => x.repo === repo)).slice(0, n);
  } else {
    cutoff = parseWhen(opts.since ?? `${defaultDays}d`);
    runs = all.filter(r => r.collected_at >= cutoff);
  }
  const byRepo = new Map();
  let fleetSize = null;
  for (const run of [...runs].reverse()) {
    if (run.mode === 'fleet' && !run.packages_only && run.totals?.repos)
      fleetSize = run.totals.repos - (run.totals.first_run ?? 0) - (run.totals.errors ?? 0);
    for (const r of run.repos ?? []) {
      if (repo && r.repo !== repo) continue;
      if (r.error || r.first_run || r.skipped || !r.events?.length) continue;
      const cur = byRepo.get(r.repo) ?? {
        repo: r.repo,
        project: r.project,
        first_run: false,
        since: r.since ?? null,
        events: [],
        errors: []
      };
      if (r.since && (!cur.since || r.since < cur.since)) cur.since = r.since;
      cur.events.push(...r.events);
      byRepo.set(r.repo, cur);
    }
  }
  const repos = [...byRepo.values()].map(r => ({...r, summary: {events: r.events.length}}));
  return {
    runs,
    cutoff,
    digest: {
      collected_at: runs[0]?.collected_at ?? null,
      mode: repo ? 'repo' : 'fleet',
      gh_user: runs[0]?.gh_user ?? null,
      stored: {runs: runs.length, since: cutoff, fleet_size: fleetSize},
      repos,
      totals: {
        repos: fleetSize ?? repos.length,
        events: repos.reduce((n, r) => n + r.events.length, 0)
      }
    }
  };
};

const projectFolders = async () => {
  const r = await vaultFetch('/vault/projects/');
  if (!r.ok) throw new Error(`GET /vault/projects/: ${r.status} ${r.statusText}`);
  return ((await r.json()).files ?? []).filter(f => f.endsWith('/')).map(f => f.slice(0, -1));
};

const markdownTable = (head, rows) =>
  [head, head.map(() => '---'), ...rows].map(r => `| ${r.join(' | ')} |`).join('\n');

// A latest major that holds every download (to the printed precision) says
// nothing, so its cell stays empty.
const latestMajorCell = n => {
  if (!n.latest || !n.by_major || !n.versions_total) return '-';
  const m = n.by_major[majorOf(n.latest)] ?? 0;
  return Math.round((1000 * m) / n.versions_total) >= 1000 ? '' : share(m, n.versions_total);
};

// Outside a full top list the latest version is capped by the last one there;
// outside a shorter list it had no downloads.
const latestVersionCell = n => {
  if (!n.latest || !n.versions_total) return '-';
  const top = n.top_versions ?? [];
  const hit = top.find(([v]) => v === n.latest);
  if (hit) return share(hit[1], n.versions_total);
  return top.length < TOP_VERSIONS ? '' : `≤${share(top[top.length - 1][1], n.versions_total)}`;
};

// Standing npm numbers per published package, heaviest first.
const renderPackagesTable = async () => {
  const rows = [];
  let weekly = 0;
  const found = await pool(await projectFolders(), 8, async project => ({
    project,
    snapshot: (await readBaseline(project)).packages
  }));
  for (const {project, snapshot} of found)
    for (const p of snapshot?.packages ?? []) {
      const n = p.npm;
      if (!n) continue;
      weekly += n.week?.downloads ?? 0;
      rows.push([
        p.name,
        project,
        `${n.latest ?? '?'}${n.published_at ? ` (${n.published_at.slice(0, 10)})` : ''}`,
        n.week?.downloads ?? 0,
        n.week ? `${n.week.start} to ${n.week.end}` : '-',
        latestMajorCell(n),
        latestVersionCell(n),
        num(n.dependents?.direct),
        p.fleet?.level ?? '-',
        short(snapshot.collected_at)
      ]);
    }
  rows.sort((a, b) => b[3] - a[3] || a[0].localeCompare(b[0]));
  for (const row of rows) row[3] = num(row[3]);
  rows.push([`Total (${rows.length})`, '', '', num(weekly), '', '', '', '', '', '']);
  return markdownTable(
    [
      'Package',
      'Project',
      'Latest',
      'Weekly',
      'Week',
      'Latest major',
      'Latest version',
      'Dependents',
      'Level',
      'Collected'
    ],
    rows
  );
};

// Standing counts per repository from every stored baseline: a Markdown table.
const renderTable = async () => {
  const folders = await projectFolders();
  const rows = [];
  const sum = {issues: 0, prs: 0, stars: 0, forks: 0};
  for (const project of folders) {
    const {baseline: b} = await readBaseline(project);
    if (!b) continue;
    const open = Object.values(b.items ?? {}).filter(i => i.state === 'open');
    const issues = open.filter(i => !i.is_pr).length,
      prs = open.length - issues;
    const discussions = Object.values(b.discussions ?? {}).filter(d => !d.closed).length;
    const published = Object.values(b.advisories ?? {}).filter(a => a.state === 'published');
    const noCve = published.filter(a => !a.cve_id).length;
    const alert = kind => {
      const a = b.alerts?.[kind];
      return !a || a.unavailable ? 'off' : `${a.truncated ? '≥' : ''}${a.open}`;
    };
    sum.issues += issues;
    sum.prs += prs;
    sum.stars += b.meta?.stars ?? 0;
    sum.forks += b.meta?.forks ?? 0;
    rows.push([
      b.repo ?? project,
      issues,
      prs,
      b.meta?.has_discussions ? discussions : '-',
      b.meta?.stars ?? '-',
      b.meta?.forks ?? '-',
      published.length ? `${published.length}${noCve ? ` (${noCve} no CVE)` : ''}` : '0',
      alert('dependabot'),
      alert('code_scanning'),
      b.ci ? (b.ci.conclusion ?? b.ci.status) : 'none',
      short(b.collected_at)
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const head = [
    'Repository',
    'Issues',
    'PRs',
    'Discussions',
    'Stars',
    'Forks',
    'Advisories',
    'Dependabot',
    'Scanning',
    'CI',
    'Collected'
  ];
  rows.push([
    `Total (${rows.length})`,
    sum.issues,
    sum.prs,
    '',
    sum.stars,
    sum.forks,
    '',
    '',
    '',
    '',
    ''
  ]);
  return markdownTable(head, rows);
};

const show = async () => {
  const file = opts._[1];
  if (file) {
    const digest = JSON.parse(readFileSync(file, 'utf8'));
    console.log(opts.brief ? collector.renderBrief(digest) : renderDigest(digest));
    return;
  }
  requireVault();
  if (opts.fleet) {
    if (opts.table) {
      console.log(await (opts.packages ? renderPackagesTable() : renderTable()));
      return;
    }
    const {digest, runs, cutoff} = await storedMovement(null, 7);
    if (!runs.length) {
      console.log(
        `no stored runs${cutoff ? ` since ${short(cutoff)}` : ''} — run collect --fleet, then commit`
      );
      return;
    }
    console.log(collector.renderBrief(digest));
    return;
  }
  // One repository: the baseline stored in the vault, then its stored movement —
  // no GitHub access either way.
  let project = opts.project ?? null,
    repo = null;
  if (opts.cwd) {
    const r = resolveCwd();
    if (r.skipped) {
      console.log(`skipped: ${r.reason}${r.remote ? ` (${r.remote})` : ''}`);
      return;
    }
    project = r.project;
    repo = `${r.owner}/${r.name}`;
  } else if (opts.repo) {
    const m = /^([^/\s]+)\/([^/\s]+)$/.exec(opts.repo);
    if (!m) fail(1, '--repo takes OWNER/NAME');
    project ??= m[2];
    repo = opts.repo;
  }
  if (!project)
    fail(
      1,
      `show needs a collected FILE, --fleet, or --cwd / --repo OWNER/NAME / --project NAME for the stored baseline\n\n${usage}`
    );
  const {baseline, packages} = await readBaseline(project);
  if (!baseline && !packages) {
    console.log(
      `${repo ?? project}: no stored baseline in ${baselineFolder(project)} — run collect, then commit`
    );
    return;
  }
  repo = baseline?.repo ?? repo ?? packages?.packages?.[0]?.repo ?? project;
  console.log(
    renderRepo({
      repo,
      project,
      stored: true,
      first_run: false,
      events: [],
      errors: [],
      snapshot: baseline,
      packages
    })
  );
  const {digest, runs, cutoff} = await storedMovement(repo, 30);
  console.log('');
  if (runs.length && digest.repos.length) console.log(collector.renderBrief(digest));
  else
    console.log(
      `${repo} — no stored movement${cutoff ? ` since ${short(cutoff)}` : ` in the last ${opts.runs} runs`}`
    );
};

const commands = {collect, show, commit, file: fileItem};
if (!commands[command]) fail(1, `Unknown command: ${command}\n\n${usage}`);
commands[command]().catch(err => fail(1, err.stack ?? String(err)));
