#!/usr/bin/env node

// fleet-status — collector for the GitHub-side state of fleet repositories
// (agent-workflow queue item `/fleet-status`, filed 2026-08-28). The script does
// every mechanical step — enumeration, the `gh api` reads (REST plus the fixed
// discussions GraphQL query), the diff against the per-project baseline kept in
// the vault's `projects/<name>/state.md` under `## GitHub`, the baseline write,
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
//   fleet-status.mjs file --project NAME --title TITLE --body-file FILE [--dry-run]
//
// Rulings (2026-08-28): collection runs only for github.com repositories — --cwd
// on any other host, or with no remote, prints {skipped: true} and exits 0.
// Private repositories are out; --fleet enumerates public, non-archived,
// non-fork repositories of the authenticated account. Every GitHub call is a
// read; the GraphQL query is fixed text and asserted mutation-free. A missing or
// expired `gh` login is reported to the operator (exit 3), never a silent empty
// result. Stars are count-only unless --star-logins; forks always carry logins.
//
// Brief and stored runs (2026-08-29): `--brief` is the executive view — one line
// per repository with movement, action-worthy events only, counters folded into
// a tail line. `commit` records every run that carries events (any mode; a fleet
// run always) as a json block in the fleet digest, so `show --fleet` and
// `show --repo` answer "what moved since WHEN" from the vault alone, and
// collection can run as a section of the manual daily playbook (croc, since
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
// graph. It lands in state.md under `## Packages`, beside `## GitHub`; the only
// event is a dependents count that moved. npm, the registry, and deps.dev are
// read with plain GETs.
//
// Exit codes: 0 ok · 1 usage/HTTP error · 2 missing tool · 3 gh not authenticated.

import {execFile, execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
  fleet-status.mjs file --project NAME --title TITLE --body-file FILE [--dry-run]

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

// A list that paginates by cursor only (the alert endpoints reject `page=`):
// follow the Link header's rel="next" until it runs out or the page cap stops
// it. `complete` is false only when the cap did.
const CURSOR_PAGES_MAX = 20;
const ghApiCursor = async route => {
  const list = [];
  let next = route;
  for (let n = 0; next && n < CURSOR_PAGES_MAX; ++n) {
    const r = await runAsync('gh', ['api', '-i', next]);
    const split = r.out.search(/\r?\n\r?\n/);
    const head = split < 0 ? r.out : r.out.slice(0, split),
      body = split < 0 ? '' : r.out.slice(split).trim();
    if (!r.ok) throw ghError(r, route, body);
    list.push(...(body ? JSON.parse(body) : []));
    const link = head.split(/\r?\n/).find(line => /^link:/i.test(line)) ?? '';
    next = /<https:\/\/api\.github\.com\/([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
  }
  return {list, complete: !next};
};

// Discussions exist only on GraphQL. The query is fixed text; the mutation
// assertion is the documented guard behind the 2026-08-28 ruling that the
// collector, not the agent's command line, issues it.
const DISCUSSIONS_QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url body createdAt updatedAt closed isAnswered
        author { login __typename }
        category { name }
        reactions { totalCount }
        reactionGroups { viewerHasReacted }
        comments(first: 100) {
          totalCount
          nodes { updatedAt body author { login } reactions { totalCount } viewerDidAuthor }
        }
      }
    }
  }
}`;

const ghGraphql = async (query, variables) => {
  if (/\bmutation\b/i.test(query))
    throw new Error(
      'fleet-status issues GraphQL queries only — refusing text containing "mutation"'
    );
  const argv = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(variables))
    if (v !== null && v !== undefined) argv.push('-F', `${k}=${v}`);
  const r = await runAsync('gh', argv);
  if (!r.ok) throw new GhError(null, r.err || r.out || 'graphql failed', 'graphql');
  const json = JSON.parse(r.out);
  if (json.errors?.length)
    throw new GhError(null, json.errors.map(e => e.message).join('; '), 'graphql');
  return json.data;
};

const requireGhAuth = () => {
  const r = run('gh', ['auth', 'status']);
  if (r.ok) return;
  const message = (r.err || r.out || 'gh auth status failed').split('\n')[0];
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

const VAULT = (process.env.VAULT_API_URL ?? '').replace(/\/+$/, ''),
  TOKEN = process.env.VAULT_API_TOKEN;
const requireVault = () => {
  if (!VAULT || !TOKEN) fail(1, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');
};

const vaultFetch = (route, init = {}) =>
  fetch(`${VAULT}${route}`, {
    ...init,
    headers: {Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {})}
  });

const vaultGet = async docPath => {
  const r = await vaultFetch(`/vault/${docPath}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${docPath}: ${r.status} ${r.statusText}`);
  return {text: await r.text(), etag: r.headers.get('etag')};
};

const vaultEdit = async (docPath, op) => {
  if (dryRun) {
    console.log(
      `DRY RUN — would POST /vault/edit ${docPath} ${op.op} (${JSON.stringify(op).length} bytes)`
    );
    return {dry_run: true};
  }
  const r = await vaultFetch('/vault/edit', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({path: docPath, ...op})
  });
  const text = await r.text();
  if (r.status === 405)
    throw new Error(
      `POST /vault/edit is not available on this vault server (405) — server ≥ 2026-07-24 needed`
    );
  if (!r.ok)
    throw new Error(`POST /vault/edit ${docPath} (${op.op}): ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

const vaultPut = async (docPath, frontmatter, body, etag) => {
  if (dryRun) {
    console.log(
      `DRY RUN — would PUT ${docPath} (${body.length} bytes${etag ? `, If-Match ${etag}` : ''})`
    );
    return {dry_run: true};
  }
  const r = await vaultFetch(`/vault/${docPath}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json', ...(etag ? {'If-Match': etag} : {})},
    body: JSON.stringify({frontmatter, body})
  });
  if (!r.ok) throw new Error(`PUT ${docPath}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return {status: r.status, etag: r.headers.get('etag')};
};

// The sections of state.md this script owns: a heading, one fenced json block.
// check-drift writes its own baseline first, so these two always close the
// document, in this order.
const GITHUB_HEADING = '## GitHub';
const PACKAGES_HEADING = '## Packages';
const MANAGED_HEADINGS = [GITHUB_HEADING, PACKAGES_HEADING];

const findBlock = (text, heading) => {
  const at = text.indexOf(`\n${heading}\n`);
  if (at < 0) return null;
  const rest = text.slice(at + 1),
    next = rest.indexOf('\n## ');
  const m = /```json\n([\s\S]*?)\n```/.exec(next < 0 ? rest : rest.slice(0, next));
  if (!m) return {heading: true, block: null, json: null};
  let json = null;
  try {
    json = JSON.parse(m[1]);
  } catch {}
  return {heading: true, block: m[0], json};
};

// The managed sections as one span from the first of their headings to the end,
// so a commit rewrites both in a single asserted replace. `sections` is null
// when that span holds anything else, and the commit falls back to block edits.
const managedTail = text => {
  const ats = MANAGED_HEADINGS.map(h => text.indexOf(`\n${h}\n`)).filter(i => i >= 0);
  if (!ats.length) return null;
  const tail = text.slice(Math.min(...ats) + 1);
  const sections = new Map();
  for (const part of tail.split(/\n(?=## )/)) {
    const heading = part.slice(0, part.indexOf('\n'));
    if (!MANAGED_HEADINGS.includes(heading) || sections.has(heading))
      return {text: tail, sections: null};
    sections.set(heading, part.replace(/\s*$/, '\n'));
  }
  return {text: tail, sections};
};

// Arrays of scalars on one line: a weekly series or a history point stays one
// line instead of one line per number. Names, dates, and versions never hold
// brackets, so the pattern cannot split a string.
const compactJson = value =>
  JSON.stringify(value, null, 2).replace(
    /\[\n\s+([^[\]{}]*?)\n\s*\]/g,
    (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`
  );

const githubSection = snapshot =>
  `${GITHUB_HEADING}\n\nAuto-maintained by the \`fleet-status\` skill (\`/fleet-status\`, \`/vault resume\`); the\nbaseline the next GitHub collection diffs against. Refresh: \`fleet-status.mjs commit\`.\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n`;

const packagesSection = snapshot =>
  `${PACKAGES_HEADING}\n\nAuto-maintained by the \`fleet-status\` skill: npm stats for the packages this project publishes\nand their place in the \`fleet-deps\` graph. Refresh: \`fleet-status.mjs commit\`.\n\n\`\`\`json\n${compactJson(snapshot)}\n\`\`\`\n`;

const stateDocPath = project => `projects/${project}/state.md`;

const readBaseline = async project => {
  const doc = await vaultGet(stateDocPath(project));
  if (!doc) return {doc: null, baseline: null, packages: null};
  return {
    doc,
    baseline: findBlock(doc.text, GITHUB_HEADING)?.json ?? null,
    packages: findBlock(doc.text, PACKAGES_HEADING)?.json ?? null
  };
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
  let project = opts.project ?? null;
  const marker = path.join(root, '.claude', 'vault-project');
  if (!project && existsSync(marker)) project = readFileSync(marker, 'utf8').trim();
  if (!project) project = path.basename(root);
  return {owner: gh.owner, name: gh.name, project, root};
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

// GitHub Apps log in as `name[bot]` and are typed Bot; older bots are plain
// user accounts, so they are named here (all seen on fleet repositories or
// common in their history).
const LEGACY_BOTS = new Set([
  'snyk-bot',
  'gitter-badger',
  'greenkeeperio-bot',
  'renovate-bot',
  'codecov-io',
  'coveralls'
]);
const isBot = (login, type) =>
  type === 'Bot' || /\[bot\]$/.test(login ?? '') || LEGACY_BOTS.has(login);

// First meaningful line of a body, for the brief; the full text stays on GitHub.
const EXCERPT_LEN = 120;
const clip = (text, n) => {
  if (!text || text.length <= n) return text;
  const cut = text.slice(0, n - 1),
    at = cut.lastIndexOf(' ');
  return `${(at > n / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
};
const excerptOf = text => {
  if (!text) return null;
  const line = text
    .replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split('\n')
    .map(l => l.replace(/^[\s>#*-]+/, '').trim())
    .find(l => l && !/^(```|\||!\[)/.test(l));
  return line ? clip(line, EXCERPT_LEN) : null;
};

const latestComment = comments => {
  let last = null;
  for (const c of comments) {
    const at = c.updated_at ?? c.updatedAt;
    if (!last || at > last.at)
      last = {author: c.user?.login ?? c.author?.login ?? null, at, excerpt: excerptOf(c.body)};
  }
  return last;
};

const COMMENT_SCAN_CAP = 60;

const collectRepo = async ({owner, name, project, baseline, sinceDays, starLogins, ghUser}) => {
  const repo = `${owner}/${name}`,
    R = `repos/${owner}/${name}`;
  const errors = [];
  const guard = async (where, fn, fallback) => {
    try {
      return await fn();
    } catch (err) {
      errors.push({where, status: err.status ?? null, message: err.message});
      return fallback;
    }
  };
  const collectedAt = new Date().toISOString();
  const since = baseline?.collected_at ?? new Date(Date.now() - sinceDays * 864e5).toISOString();

  const repoMeta = await ghApi(R);
  // Private repositories are out by ruling; --fleet filters them at enumeration,
  // the single-repository forms find out here.
  if (repoMeta.private)
    return {repo, project, skipped: true, reason: 'private', events: [], summary: {events: 0}};
  const meta = {
    stars: repoMeta.stargazers_count,
    forks: repoMeta.forks_count,
    watchers: repoMeta.subscribers_count,
    open_issues: repoMeta.open_issues_count,
    has_discussions: Boolean(repoMeta.has_discussions),
    default_branch: repoMeta.default_branch
  };

  const advisories = {};
  for (const a of await guard(
    'advisories',
    () => ghApi(`${R}/security-advisories`, {paginate: true}),
    []
  ))
    advisories[a.ghsa_id] = {
      cve_id: a.cve_id ?? null,
      state: a.state,
      severity: a.severity ?? null,
      summary: a.summary,
      published_at: a.published_at ?? null,
      updated_at: a.updated_at ?? null,
      html_url: a.html_url
    };

  // Open items in full every run (reactions never bump updated_at), plus
  // anything updated inside the window.
  const raw = new Map();
  for (const it of await guard(
    'issues:open',
    () => ghApi(`${R}/issues?state=open`, {paginate: true}),
    []
  ))
    raw.set(it.number, it);
  for (const it of await guard(
    'issues:since',
    () => ghApi(`${R}/issues?state=all&since=${encodeURIComponent(since)}`, {paginate: true}),
    []
  ))
    raw.set(it.number, it);

  const items = {};
  const scanOrder = [...raw.values()].sort((a, b) => b.comments - a.comments);
  let scanned = 0;
  for (const it of scanOrder) {
    const isPr = Boolean(it.pull_request);
    const record = {
      is_pr: isPr,
      title: it.title,
      excerpt: excerptOf(it.body),
      state: isPr && it.pull_request?.merged_at ? 'merged' : it.state,
      author: it.user?.login ?? null,
      bot: isBot(it.user?.login, it.user?.type),
      created_at: it.created_at,
      updated_at: it.updated_at,
      comments: it.comments ?? 0,
      review_comments: 0,
      reactions: it.reactions?.total_count ?? 0,
      comment_reactions: null,
      last_comment: null,
      labels: (it.labels ?? []).map(l => l.name),
      assignees: (it.assignees ?? []).map(a => a.login).filter(Boolean),
      // Whether the collecting account answered: a comment anywhere, a reaction
      // on the item itself. null when this run could not tell.
      owner_commented: null,
      owner_reacted: null,
      html_url: it.html_url
    };
    if (isPr) record.draft = Boolean(it.draft);
    if (scanned < COMMENT_SCAN_CAP && (record.comments > 0 || isPr)) {
      ++scanned;
      const comments = await guard(
        `comments:#${it.number}`,
        () => ghApi(`${R}/issues/${it.number}/comments`, {paginate: true}),
        null
      );
      const reviews = isPr
        ? await guard(
            `review-comments:#${it.number}`,
            () => ghApi(`${R}/pulls/${it.number}/comments`, {paginate: true}),
            null
          )
        : [];
      if (comments && reviews) {
        record.review_comments = reviews.length;
        record.comment_reactions = [...comments, ...reviews].reduce(
          (s, c) => s + (c.reactions?.total_count ?? 0),
          0
        );
        record.last_comment = latestComment([...comments, ...reviews]);
        record.owner_commented = [...comments, ...reviews].some(c => c.user?.login === ghUser);
      }
    } else if (record.comments === 0 && !isPr) {
      record.comment_reactions = 0;
      record.owner_commented = false;
    }
    // Reactions carry their author only in the per-item list: one read, and only
    // for an open item that has any.
    if (record.reactions === 0) record.owner_reacted = false;
    else if (it.state === 'open')
      record.owner_reacted = await guard(
        `reactions:#${it.number}`,
        async () =>
          (await ghApi(`${R}/issues/${it.number}/reactions`, {paginate: true})).some(
            r => r.user?.login === ghUser
          ),
        null
      );
    items[it.number] = record;
  }
  // Carry forward closed items from the baseline that fell outside the window
  // (bounded: 90 days), so a late comment on one is still a delta, not "new".
  const keepAfter = new Date(Date.now() - 90 * 864e5).toISOString();
  for (const [n, old] of Object.entries(baseline?.items ?? {}))
    if (!items[n] && old.state !== 'open' && old.updated_at >= keepAfter) items[n] = old;

  const discussions = {};
  if (meta.has_discussions)
    await guard(
      'discussions',
      async () => {
        let after = null;
        for (let page = 0; page < 5; ++page) {
          const conn = (await ghGraphql(DISCUSSIONS_QUERY, {owner, name, after})).repository
            .discussions;
          for (const d of conn.nodes)
            discussions[d.number] = {
              title: d.title,
              excerpt: excerptOf(d.body),
              closed: d.closed,
              answered: d.isAnswered,
              author: d.author?.login ?? null,
              bot: isBot(d.author?.login, d.author?.__typename),
              category: d.category?.name ?? null,
              created_at: d.createdAt,
              updated_at: d.updatedAt,
              comments: d.comments.totalCount,
              reactions: d.reactions.totalCount,
              comment_reactions: d.comments.nodes.reduce((s, c) => s + c.reactions.totalCount, 0),
              last_comment: latestComment(d.comments.nodes),
              // viewer* is the gh login the collector runs as.
              owner_commented: d.comments.nodes.some(c => c.viewerDidAuthor)
                ? true
                : d.comments.totalCount > d.comments.nodes.length
                  ? null
                  : false,
              owner_reacted: (d.reactionGroups ?? []).some(g => g.viewerHasReacted),
              url: d.url
            };
          if (!conn.pageInfo.hasNextPage) break;
          after = conn.pageInfo.endCursor;
        }
      },
      null
    );

  // Forks carry the login (one sorted call); stars are count-only unless asked.
  let forks = baseline?.forks ?? null;
  if (!forks || meta.forks !== baseline?.meta?.forks)
    forks = await guard(
      'forks',
      async () =>
        (await ghApi(`${R}/forks?sort=newest`, {paginate: true})).map(f => ({
          login: f.owner?.login ?? null,
          full_name: f.full_name,
          created_at: f.created_at
        })),
      forks ?? []
    );
  // Watchers carry the login too: a watcher subscribes to notifications, so a
  // spam account watching is worth a name where a star is not (stream-chain,
  // 2026-09-02). One paged call, only when the count moved or no list is stored.
  let watchers = baseline?.watchers ?? null;
  if (!watchers || meta.watchers !== baseline?.meta?.watchers)
    watchers = await guard(
      'watchers',
      async () => (await ghApi(`${R}/subscribers`, {paginate: true})).map(u => u.login ?? null),
      watchers ?? []
    );
  let stars = null;
  if (starLogins) {
    stars = baseline?.stars ?? null;
    if (!stars || meta.stars !== baseline?.meta?.stars)
      stars = await guard(
        'stars',
        async () =>
          (
            await ghApi(`${R}/stargazers`, {
              paginate: true,
              headers: ['Accept: application/vnd.github.star+json']
            })
          ).map(s => s.user?.login ?? null),
        stars ?? []
      );
  }

  const releases = {};
  for (const r of await guard('releases', () => ghApi(`${R}/releases?per_page=30`), []))
    releases[r.id] = {
      tag_name: r.tag_name,
      name: r.name,
      draft: Boolean(r.draft),
      prerelease: Boolean(r.prerelease),
      published_at: r.published_at ?? null,
      html_url: r.html_url
    };

  // Every page of both alert lists; `truncated` marks a count stopped by the cap.
  const alertSet = async (route, severity) => {
    try {
      const {list, complete} = await ghApiCursor(`${route}&per_page=100`);
      const set = {open: list.length, by_severity: countBy(list, severity)};
      if (!complete) set.truncated = true;
      return set;
    } catch (err) {
      return {unavailable: err.message, status: err.status ?? null};
    }
  };
  const alerts = {
    dependabot: await alertSet(
      `${R}/dependabot/alerts?state=open`,
      a => a.security_advisory?.severity
    ),
    code_scanning: await alertSet(`${R}/code-scanning/alerts?state=open`, a => a.rule?.severity)
  };

  // The newest run on a default branch is often Dependabot's updater
  // (`event: "dynamic"`, named "github_actions in /. - Update #n"); the CI
  // conclusion wanted is the newest run of a real workflow.
  const lastRun = await guard(
    'ci',
    async () =>
      (
        (
          await ghApi(
            `${R}/actions/runs?branch=${encodeURIComponent(meta.default_branch)}&per_page=10`
          )
        ).workflow_runs ?? []
      ).find(r => r.event !== 'dynamic') ?? null,
    null
  );
  const ci = lastRun
    ? {
        name: lastRun.name,
        status: lastRun.status,
        conclusion: lastRun.conclusion,
        updated_at: lastRun.updated_at,
        html_url: lastRun.html_url
      }
    : null;

  const snapshot = {
    repo,
    html_url: repoMeta.html_url,
    gh_user: ghUser,
    collected_at: collectedAt,
    window: {since, first_run: !baseline},
    meta,
    advisories,
    items,
    discussions,
    forks,
    watchers,
    stars,
    releases,
    alerts,
    ci
  };
  const events = diff(baseline, snapshot, repo);
  return {
    repo,
    project,
    first_run: !baseline,
    collected_at: collectedAt,
    events,
    summary: {
      events: events.length,
      by_kind: countBy(events, e => e.kind),
      open_items: Object.values(items).filter(i => i.state === 'open').length,
      advisories_without_cve: Object.values(advisories).filter(
        a => a.state === 'published' && !a.cve_id
      ).length,
      stars: meta.stars,
      forks: meta.forks,
      comment_scan: scanned >= COMMENT_SCAN_CAP ? 'capped' : 'full'
    },
    errors,
    snapshot
  };
};

// --packages-only still honors the private-repository gate; --fleet already
// filtered at enumeration, so it skips the read.
const probeRepo = async ({owner, name, project}, publicKnown) => {
  const repo = `${owner}/${name}`;
  if (!publicKnown && (await ghApi(`repos/${repo}`)).private)
    return {repo, project, skipped: true, reason: 'private', events: [], summary: {events: 0}};
  return {repo, project, events: [], summary: {events: 0}, errors: []};
};

// ─── Diff ────────────────────────────────────────────────────────────────────

const diff = (b, s, repo) => {
  const events = [];
  const push = (kind, extra) => events.push({kind, repo, ...extra});
  if (!b) return events;

  for (const [id, a] of Object.entries(s.advisories)) {
    const o = b.advisories?.[id];
    const ref = {id, summary: a.summary, severity: a.severity, html_url: a.html_url};
    if (!o) push('advisory.new', {...ref, state: a.state, cve_id: a.cve_id});
    else {
      if (!o.cve_id && a.cve_id) push('advisory.cve_assigned', {...ref, cve_id: a.cve_id});
      if (o.state !== a.state) push('advisory.state', {...ref, from: o.state, to: a.state});
      else if (o.updated_at !== a.updated_at && o.cve_id === a.cve_id)
        push('advisory.updated', {...ref, updated_at: a.updated_at});
    }
  }

  const itemEvents = (type, current, previous, key) => {
    for (const [n, it] of Object.entries(current)) {
      const o = previous?.[n];
      const number = Number(n);
      const ref = {
        number,
        title: it.title,
        author: it.author,
        bot: Boolean(it.bot),
        url: it.html_url ?? it.url
      };
      const state = key.state(it),
        prevState = o ? key.state(o) : null;
      const comments = (it.comments ?? 0) + (it.review_comments ?? 0),
        prevComments = o ? (o.comments ?? 0) + (o.review_comments ?? 0) : 0;
      const reactions = (it.reactions ?? 0) + (it.comment_reactions ?? 0),
        prevReactions = o ? (o.reactions ?? 0) + (o.comment_reactions ?? 0) : 0;
      if (!o) {
        if (it.created_at >= b.collected_at)
          push(`${type}.new`, {...ref, state, comments, reactions, excerpt: it.excerpt ?? null});
        else
          push(`${type}.updated`, {
            ...ref,
            state,
            comments,
            reactions,
            excerpt: it.excerpt ?? null,
            note: 'not in baseline',
            last_comment: it.last_comment ?? null
          });
        continue;
      }
      let moved = false;
      if (state !== prevState) {
        push(`${type}.state`, {...ref, from: prevState, to: state});
        moved = true;
      }
      if (comments > prevComments) {
        push(`${type}.comments`, {
          ...ref,
          delta: comments - prevComments,
          total: comments,
          last_comment: it.last_comment ?? null
        });
        moved = true;
      }
      if (
        it.comment_reactions !== null &&
        o.comment_reactions !== null &&
        reactions !== prevReactions
      ) {
        push(`${type}.reactions`, {...ref, delta: reactions - prevReactions, total: reactions});
        moved = true;
      } else if (it.reactions !== o.reactions) {
        push(`${type}.reactions`, {
          ...ref,
          delta: it.reactions - o.reactions,
          total: it.reactions
        });
        moved = true;
      }
      if (!moved && it.updated_at !== o.updated_at)
        push(`${type}.updated`, {...ref, updated_at: it.updated_at});
    }
  };
  itemEvents(
    'item',
    Object.fromEntries(
      Object.entries(s.items).map(([n, it]) => [n, {...it, kind: it.is_pr ? 'pr' : 'issue'}])
    ),
    b.items,
    {state: it => it.state}
  );
  for (const e of events)
    if (e.kind.startsWith('item.')) {
      const it = s.items[e.number];
      e.kind = `${it?.is_pr ? 'pr' : 'issue'}.${e.kind.slice(5)}`;
    }
  itemEvents('discussion', s.discussions, b.discussions, {
    state: d => (d.closed ? 'closed' : 'open')
  });

  const forkLogins = new Set((s.forks ?? []).map(f => f.login));
  const prevForkLogins = new Set((b.forks ?? []).map(f => f.login));
  for (const f of s.forks ?? [])
    if (!prevForkLogins.has(f.login))
      push('fork.new', {login: f.login, full_name: f.full_name, created_at: f.created_at});
  for (const f of b.forks ?? [])
    if (!forkLogins.has(f.login)) push('fork.removed', {login: f.login, full_name: f.full_name});
  if (s.meta.forks !== b.meta?.forks && !(s.forks && b.forks))
    push('forks.count', {from: b.meta?.forks ?? null, to: s.meta.forks});

  if (s.stars && b.stars) {
    const prev = new Set(b.stars),
      now = new Set(s.stars);
    for (const login of s.stars) if (!prev.has(login)) push('star.new', {login});
    for (const login of b.stars) if (!now.has(login)) push('star.removed', {login});
  } else if (s.meta.stars !== b.meta?.stars) {
    push('stars.count', {
      from: b.meta?.stars ?? null,
      to: s.meta.stars,
      delta: s.meta.stars - (b.meta?.stars ?? 0)
    });
  }
  if (s.watchers && b.watchers) {
    const prev = new Set(b.watchers),
      now = new Set(s.watchers);
    for (const login of s.watchers) if (!prev.has(login)) push('watcher.new', {login});
    for (const login of b.watchers) if (!now.has(login)) push('watcher.removed', {login});
  } else if (s.meta.watchers !== b.meta?.watchers && b.meta?.watchers !== undefined)
    push('watchers.count', {from: b.meta.watchers, to: s.meta.watchers});

  for (const [id, r] of Object.entries(s.releases)) {
    const o = b.releases?.[id];
    const ref = {id: Number(id), tag: r.tag_name, name: r.name, url: r.html_url};
    if (!o) push('release.new', {...ref, draft: r.draft, prerelease: r.prerelease});
    else if (o.draft && !r.draft) push('release.published', {...ref, published_at: r.published_at});
  }

  for (const kind of ['dependabot', 'code_scanning']) {
    const now = s.alerts?.[kind],
      prev = b.alerts?.[kind];
    if (now?.open !== undefined && prev?.open !== undefined && now.open !== prev.open)
      push(`alerts.${kind}`, {from: prev.open, to: now.open, by_severity: now.by_severity});
  }
  if (s.ci && b.ci && s.ci.conclusion !== b.ci.conclusion)
    push('ci.conclusion', {
      from: b.ci.conclusion,
      to: s.ci.conclusion,
      name: s.ci.name,
      url: s.ci.html_url
    });
  return events;
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
                : `fleet-deps --json: ${(stderr || err.message).trim().split('\n').pop()}`
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
// account, grouped by project. `baselines` carries the `## Packages` blocks the
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
  const inScope = repo => mode === 'fleet' || targetByRepo.has(lc(repo));

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
    targets = [{owner: m[1], name: m[2], project: opts.project ?? m[2]}];
  }

  requireGhAuth();
  const ghUser = (await ghApi('user')).login;
  if (mode === 'fleet') targets = listFleet(opts.owner ?? ghUser);

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
          : await collectRepo({...t, baseline, sinceDays, starLogins, ghUser});
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
        `${entry.repo}: ${entry.error ? `ERROR ${entry.error.message}` : `${s.events} event${s.events === 1 ? '' : 's'}${entry.first_run ? ' (first run — baseline only)' : ''}${kinds ? ` [${kinds}]` : ''}`}${entry.errors?.length ? ` — ${entry.errors.length} partial error(s)` : ''}`
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
  if (opts.brief) console.log(renderBrief(digest));
  if (!opts.show && !opts.brief && !opts.out) console.log(out);
};

// Both managed sections in one write: every write re-embeds the document.
const commitRepo = async (entry, {github}) => {
  const {project} = entry;
  const docPath = stateDocPath(project);
  const fresh = new Map();
  if (github) fresh.set(GITHUB_HEADING, githubSection(entry.snapshot));
  if (entry.packages) fresh.set(PACKAGES_HEADING, packagesSection(entry.packages));
  const ordered = source =>
    MANAGED_HEADINGS.map(h => source(h))
      .filter(Boolean)
      .join('\n');
  const doc = await vaultGet(docPath);
  if (!doc) {
    // Same frontmatter check-drift writes, so its --update keeps treating the
    // document as its own; it preserves these sections (patched 2026-08-28, 2026-09-14).
    const body = `Auto-maintained by the \`vault-check-drift\` and \`fleet-status\` skills. Refresh: run\n\`/vault check --update\` from the project directory, or re-run \`/vault resume\`.\n\n${ordered(h => fresh.get(h))}`;
    await vaultPut(
      docPath,
      {title: `${project} — state snapshot`, type: 'state', tags: ['state', 'snapshot', project]},
      body
    );
    return 'created';
  }
  const tail = managedTail(doc.text);
  if (!tail) {
    await vaultEdit(docPath, {op: 'append', text: `\n${ordered(h => fresh.get(h))}`});
    return 'sections added';
  }
  const trim = s => s.replace(/\s+$/, '');
  if (tail.sections) {
    const next = ordered(h => fresh.get(h) ?? tail.sections.get(h));
    if (trim(next) === trim(tail.text)) return 'unchanged';
    await vaultEdit(docPath, {op: 'replace', from: trim(tail.text), to: trim(next)});
    return 'replaced';
  }
  // Something else sits among the managed sections: edit each block on its own.
  for (const [heading, section] of fresh) {
    const found = findBlock(doc.text, heading);
    if (found?.block)
      await vaultEdit(docPath, {
        op: 'replace',
        from: found.block,
        to: /```json\n[\s\S]*?\n```/.exec(section)[0]
      });
    else await vaultEdit(docPath, {op: 'append', text: `\n${section}`});
  }
  return 'replaced block by block';
};

// FLEET_STATUS_DIGEST_PATH: the test seam — point a commit at a scratch note.
const DIGEST_PATH =
  process.env.FLEET_STATUS_DIGEST_PATH || 'projects/agent-workflow/fleet-status.md';
const DIGEST_RUNS_KEPT = 30;

const eventLine = e => {
  const who = e.author ? ` by ${e.author}${e.bot ? ' (bot)' : ''}` : '';
  switch (true) {
    case e.kind.startsWith('advisory.'):
      return `${e.kind} ${e.id}${e.cve_id ? ` ${e.cve_id}` : ''}${e.from ? ` ${e.from} → ${e.to}` : ''} — ${e.summary}`;
    case /^(issue|pr|discussion)\./.test(e.kind): {
      const detail = e.kind.endsWith('.state')
        ? `${e.from} → ${e.to}`
        : e.kind.endsWith('.comments')
          ? `+${e.delta} comment${e.delta === 1 ? '' : 's'}${e.last_comment ? `, last ${e.last_comment.author}${e.last_comment.excerpt ? `: "${e.last_comment.excerpt}"` : ''}` : ''}`
          : e.kind.endsWith('.reactions')
            ? `${e.delta > 0 ? '+' : ''}${e.delta} reaction${Math.abs(e.delta) === 1 ? '' : 's'}`
            : (e.note ?? '');
      return `${e.kind} #${e.number}${who} — ${e.title}${detail ? ` (${detail})` : ''}${e.excerpt ? ` — ${e.excerpt}` : ''}`;
    }
    case e.kind === 'fork.new' || e.kind === 'fork.removed':
      return `${e.kind} ${e.login} (${e.full_name})`;
    case /^(star|watcher)\.(new|removed)$/.test(e.kind):
      return `${e.kind} ${e.login}`;
    case /count$/.test(e.kind):
      return `${e.kind} ${e.from} → ${e.to}`;
    case e.kind.startsWith('release.'):
      return `${e.kind} ${e.tag}${e.name ? ` — ${e.name}` : ''}`;
    case e.kind.startsWith('alerts.'):
      return `${e.kind} ${e.from} → ${e.to} open`;
    case e.kind === 'ci.conclusion':
      return `ci ${e.name}: ${e.from} → ${e.to}`;
    case e.kind === 'package.dependents':
      return `package.dependents ${e.package} ${e.from} → ${e.to}`;
    default:
      return `${e.kind} ${JSON.stringify(e)}`;
  }
};

// One run of the digest note: the brief, then a json block of the run's events
// (snapshots stay in state.md) for `show --fleet` / `show --repo` to read back.
// A packages-only project enters the record only when it moved.
const runRecord = digest => ({
  collected_at: digest.collected_at,
  mode: digest.mode,
  ...(digest.packages_only ? {packages_only: true} : {}),
  gh_user: digest.gh_user ?? null,
  totals: digest.totals,
  repos: digest.repos
    .filter(r => r.github !== false || r.events.length)
    .map(r =>
      r.error
        ? {repo: r.repo, project: r.project, error: r.error, events: [], summary: r.summary}
        : {
            repo: r.repo,
            project: r.project,
            ...(r.github === false ? {github: false} : {}),
            first_run: Boolean(r.first_run),
            since: r.since ?? r.snapshot?.window?.since ?? null,
            events: r.events,
            summary: r.summary,
            errors: r.errors ?? []
          }
    )
});

const writeDigest = async digest => {
  const stamp = digest.collected_at.replace(/\.\d+Z$/, 'Z');
  const lines = [
    `## ${stamp}`,
    '',
    `Mode: ${digest.mode}; repositories: ${digest.totals.repos}; events: ${digest.totals.events}; first-run baselines: ${digest.totals.first_run}; errors: ${digest.totals.errors}.`,
    '',
    renderBrief(digest, {header: false}),
    '',
    '```json',
    JSON.stringify(runRecord(digest), null, 2),
    '```'
  ];
  const runText = lines.join('\n') + '\n';
  if (dryRun) console.log(runText);

  const intro = `Fleet-wide GitHub digest written by the \`fleet-status\` skill — one section per run that carried\nevents (any mode; a fleet run always), newest first, the last ${DIGEST_RUNS_KEPT} kept. A section is the brief\nfollowed by a \`json\` block of the run's events, which \`fleet-status.mjs show --fleet\` and \`show --repo\`\nread back as "movement since WHEN". Review items are filed on each project's own \`queue.md\`.\n\n`;
  const doc = await vaultGet(DIGEST_PATH);
  let runs = [];
  if (doc) {
    const bodyStart = doc.text.indexOf('\n---\n', 4);
    const body = bodyStart < 0 ? doc.text : doc.text.slice(bodyStart + 5);
    runs = body
      .split(/\n(?=## )/)
      .map(s => s.trim())
      .filter(s => s.startsWith('## '))
      .map(s => s + '\n');
  }
  runs = [runText, ...runs].slice(0, DIGEST_RUNS_KEPT);
  await vaultPut(
    DIGEST_PATH,
    {
      title: 'Fleet status — GitHub digest',
      type: 'state',
      tags: ['state', 'github', 'fleet-status']
    },
    intro + runs.join('\n'),
    doc?.etag ?? undefined
  );
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
      `${entry.repo}: ${[github && 'GitHub', entry.packages && 'packages'].filter(Boolean).join(' + ')} baseline ${result} in ${stateDocPath(entry.project)}`
    );
  }
  if ((digest.mode === 'fleet' && !digest.packages_only) || digest.totals?.events > 0) {
    await writeDigest(digest);
    console.log(`digest: ${DIGEST_PATH}`);
  }
  console.log(`committed ${written} of ${digest.repos?.length ?? 0} repositories`);
};

// Upsert one review item under `## Active` of a project's queue: same title →
// the block is replaced in place (the 2026-08-28 ruling: update, never
// duplicate); otherwise it is inserted at the top of Active; a missing queue
// is created in the convention's shape.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fileItem = async () => {
  requireVault();
  const {project, title} = opts;
  const bodyFile = opts['body-file'];
  if (!project || !title || !bodyFile)
    fail(1, `file needs --project, --title, --body-file\n\n${usage}`);
  if (!existsSync(bodyFile)) fail(1, `no such file: ${bodyFile}`);
  const body = readFileSync(bodyFile, 'utf8').trim();
  if (!body) fail(1, 'the item body is empty');
  const heading = /[.!?]$/.test(title) ? title : `${title}.`;
  // every column-0 bullet is its own queue item (topics/project-queue-convention)
  const continuation = body
    .split('\n')
    .map((line, i) => (i === 0 || !line.trim() ? line : `  ${line}`))
    .join('\n');
  const itemText = `- **${heading}** ${continuation}`;
  const docPath = `projects/${project}/queue.md`;
  const doc = await vaultGet(docPath);
  if (!doc) {
    const intro = `Outstanding work for ${project}. Items prefixed \`GitHub:\` under \`## Active\` are review-the-change items filed by the \`fleet-status\` skill; archive an item to \`queue-archive.md\` when it is processed.\n\n`;
    await vaultPut(
      docPath,
      {title: `${project} — Queue`, type: 'project', status: 'active', tags: [project, 'queue']},
      `${intro}## Active\n\n${itemText}\n\n## Backlog\n\n## Watching\n`
    );
    console.log(`${docPath}: created with the item`);
    return;
  }
  const text = doc.text;
  const existing = new RegExp(
    `(?<=^|\\n)- \\*\\*${escapeRe(heading)}\\*\\*[\\s\\S]*?(?=\\n- \\*\\*|\\n## |$)`
  ).exec(text);
  if (existing) {
    // Trim the trailing newline the lazy match swallows, so the blank line
    // before the next item or heading survives the replacement.
    await vaultEdit(docPath, {op: 'replace', from: existing[0].replace(/\s+$/, ''), to: itemText});
    console.log(`${docPath}: item updated in place`);
    return;
  }
  // insert-item: replaces an (empty) placeholder, creates a missing Active (server ≥ 2026-09-06)
  await vaultEdit(docPath, {
    op: 'insert-item',
    section: '## Active',
    item: itemText,
    position: 'start',
    create_section: true
  });
  console.log(`${docPath}: item inserted at the top of Active`);
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
  for (const e of entry.events) lines.push(`    ${eventLine(e)}`);
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
    for (const e of entry.events) lines.push(`    ${eventLine(e)}`);
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

// ─── Brief ───────────────────────────────────────────────────────────────────
// The executive view. Weights order the phrases; a number is action-worthy,
// 'counter' folds into the tail line, null stays in the JSON (the account's own
// single comment, an edit or label change).

const shortRepo = (repo, ghUser) =>
  ghUser && repo.startsWith(`${ghUser}/`) ? repo.slice(ghUser.length + 1) : repo;
const signed = n => (n > 0 ? `+${n}` : String(n));
const itemWord = kind =>
  kind.startsWith('pr.') ? 'PR' : kind.startsWith('discussion.') ? 'discussion' : 'issue';

const isItemKind = kind => /^(issue|pr|discussion)\./.test(kind);

const briefWeight = (e, ghUser) => {
  const k = e.kind;
  if (k.startsWith('advisory.')) return 0;
  if (isItemKind(k)) {
    if (k.endsWith('.new')) return e.bot ? 'counter' : 1;
    if (k.endsWith('.comments'))
      return e.last_comment?.author && e.last_comment.author === ghUser && e.delta === 1 ? null : 2;
    if (k.endsWith('.state')) return 3;
    if (k.endsWith('.updated')) return e.note ? 2 : null;
    return 'counter';
  }
  if (k.startsWith('release.') || k === 'ci.conclusion') return 4;
  if (k.startsWith('alerts.')) return e.to > e.from ? 4 : 'counter';
  return 'counter';
};

const quoteExcerpt = (text, n) => (text ? `: "${clip(text, n)}"` : '');

const briefPhrase = e => {
  const k = e.kind;
  if (k === 'advisory.new')
    return `advisory ${e.id} (${e.state}${e.severity ? `, ${e.severity}` : ''}${e.cve_id ? `, ${e.cve_id}` : ''}) "${e.summary}"`;
  if (k === 'advisory.cve_assigned') return `advisory ${e.id} got ${e.cve_id}`;
  if (k === 'advisory.state') return `advisory ${e.id} ${e.from} → ${e.to}`;
  if (k === 'advisory.updated') return `advisory ${e.id} updated`;
  if (k === 'release.new')
    return `release ${e.tag}${e.draft ? ' (draft)' : ''}${e.prerelease ? ' (prerelease)' : ''}`;
  if (k === 'release.published') return `release ${e.tag} published`;
  if (k === 'ci.conclusion') return `CI ${e.name}: ${e.from} → ${e.to}`;
  if (k.startsWith('alerts.'))
    return `${k === 'alerts.dependabot' ? 'Dependabot' : 'code scanning'} alerts ${e.from} → ${e.to}`;
  if (!isItemKind(k)) return eventLine(e);
  if (k.endsWith('.new'))
    return `new ${itemWord(k)} #${e.number} by ${e.author} "${e.title}"${e.excerpt ? ` — ${clip(e.excerpt, 80)}` : ''}`;
  if (k.endsWith('.comments')) {
    const lc = e.last_comment;
    return `${itemWord(k)} #${e.number} "${clip(e.title, 50)}" +${plural(e.delta, 'comment')}${lc ? ` by ${lc.author}${quoteExcerpt(lc.excerpt, 80)}` : ''}`;
  }
  if (k.endsWith('.state'))
    return `${itemWord(k)} #${e.number} "${clip(e.title, 50)}" ${e.from} → ${e.to}`;
  if (k.endsWith('.updated'))
    return `${itemWord(k)} #${e.number} "${clip(e.title, 50)}" active, not in the baseline (${plural(e.comments ?? 0, 'comment')}${e.last_comment ? `, last by ${e.last_comment.author}${quoteExcerpt(e.last_comment.excerpt, 80)}` : ''})`;
  return eventLine(e);
};

const briefCounters = (repos, ghUser) => {
  const stars = new Map(),
    forks = new Map(),
    forkLogins = new Map(),
    watchers = new Map(),
    watcherLogins = new Map(),
    dependents = new Map(),
    reactions = new Map(),
    bots = [],
    alertsDown = [];
  const add = (m, key, n) => m.set(key, (m.get(key) ?? 0) + n);
  const name_ = (m, key, login) => m.set(key, [...(m.get(key) ?? []), login]);
  for (const r of repos) {
    const name = shortRepo(r.repo, ghUser);
    for (const e of r.events) {
      const k = e.kind;
      if (k === 'package.dependents') add(dependents, e.package, e.delta ?? e.to - e.from);
      else if (k === 'stars.count') add(stars, name, e.delta ?? e.to - e.from);
      else if (k === 'star.new') add(stars, name, 1);
      else if (k === 'star.removed') add(stars, name, -1);
      else if (k === 'fork.new') {
        add(forks, name, 1);
        name_(forkLogins, name, e.login);
      } else if (k === 'fork.removed') add(forks, name, -1);
      else if (k === 'forks.count') add(forks, name, e.to - e.from);
      else if (k === 'watcher.new') {
        add(watchers, name, 1);
        name_(watcherLogins, name, e.login);
      } else if (k === 'watcher.removed') add(watchers, name, -1);
      else if (k === 'watchers.count') add(watchers, name, e.to - e.from);
      else if (isItemKind(k) && k.endsWith('.reactions'))
        add(reactions, `${name}#${e.number}`, e.delta);
      else if (isItemKind(k) && k.endsWith('.new') && e.bot)
        bots.push(`${itemWord(k)} ${name}#${e.number} by ${e.author}`);
      else if (k.startsWith('alerts.') && e.to < e.from)
        alertsDown.push(`${name} ${k.slice(7).replace('_', ' ')} ${e.from} → ${e.to}`);
    }
  }
  const total = m => [...m.values()].reduce((a, b) => a + b, 0);
  const list = (m, fmt) => [...m].map(fmt).join(', ');
  const parts = [];
  if (stars.size)
    parts.push(`stars ${signed(total(stars))} (${list(stars, ([k, v]) => `${k} ${signed(v)}`)})`);
  if (forks.size)
    parts.push(
      `forks ${signed(total(forks))} (${list(forks, ([k, v]) => `${k} ${signed(v)}${forkLogins.has(k) ? `: ${forkLogins.get(k).join(', ')}` : ''}`)})`
    );
  if (watchers.size)
    parts.push(
      `watchers ${signed(total(watchers))} (${list(watchers, ([k, v]) => `${k} ${signed(v)}${watcherLogins.has(k) ? `: ${watcherLogins.get(k).join(', ')}` : ''}`)})`
    );
  if (dependents.size)
    parts.push(
      `dependents ${signed(total(dependents))} (${list(dependents, ([k, v]) => `${k} ${signed(v)}`)})`
    );
  if (reactions.size)
    parts.push(
      `reactions ${signed(total(reactions))} (${list(reactions, ([k, v]) => `${k} ${signed(v)}`)})`
    );
  if (bots.length) parts.push(`bots: ${bots.join(', ')}`);
  if (alertsDown.length) parts.push(`alerts down (${alertsDown.join('; ')})`);
  return parts;
};

const renderBrief = (digest, {header = true} = {}) => {
  if (digest.skipped)
    return `skipped: ${digest.reason}${digest.remote ? ` (${digest.remote})` : ''}`;
  if (digest.error) return `${digest.error}: ${digest.message} — ${digest.hint}`;
  const ghUser = digest.gh_user ?? null;
  const fleet = digest.mode === 'fleet';
  const live = digest.repos.filter(r => !r.error && !r.first_run && !r.skipped);
  const moved = [];
  let active = 0;
  for (const r of live) {
    const weighted = r.events.map(e => ({w: briefWeight(e, ghUser), e})).filter(x => x.w !== null);
    if (weighted.length && r.github !== false) ++active;
    const lead = weighted.filter(x => typeof x.w === 'number').sort((a, b) => a.w - b.w);
    if (lead.length)
      moved.push({
        name: shortRepo(r.repo, ghUser),
        weight: lead[0].w,
        phrases: lead.map(x => briefPhrase(x.e))
      });
  }
  moved.sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name));
  const sinces = live
    .map(r => r.since ?? r.snapshot?.window?.since)
    .filter(Boolean)
    .sort();
  const since = digest.stored?.since ?? sinces[0] ?? null;
  const stamp = since ? short(since) : 'the baseline';
  const stored = digest.stored
    ? ` (${plural(digest.stored.runs, 'stored run')}, newest ${short(digest.collected_at)})`
    : '';
  const lines = [];
  if (header) {
    if (fleet)
      lines.push(
        `Fleet movement since ${stamp} — ${plural(digest.totals?.repos ?? digest.repos.length, 'repository', 'repositories')}, ${moved.length} with movement${stored}`
      );
    else
      lines.push(
        `${digest.repos.map(r => shortRepo(r.repo, ghUser)).join(', ')} — movement since ${stamp}${stored}`
      );
  }
  for (const m of moved) lines.push(`- ${m.name}: ${m.phrases.join('; ')}`);
  const counters = briefCounters(live, ghUser);
  if (counters.length) lines.push(`- counters: ${counters.join('; ')}`);
  const firstRuns = digest.repos.filter(r => r.first_run);
  if (firstRuns.length)
    lines.push(
      fleet
        ? `- first run: ${plural(firstRuns.length, 'repository', 'repositories')} (baseline recorded)`
        : `- first run — baseline recorded (${plural(firstRuns[0].summary.open_items, 'open item')}, ${plural(firstRuns[0].summary.stars, 'star')}, ${plural(firstRuns[0].summary.forks, 'fork')}${firstRuns[0].summary.advisories_without_cve ? `, ${firstRuns[0].summary.advisories_without_cve} published advisories without a CVE` : ''})`
    );
  const errors = digest.repos.filter(r => r.error);
  if (errors.length)
    lines.push(
      `- errors: ${errors.map(r => `${shortRepo(r.repo, ghUser)}: ${r.error.message}`).join('; ')}`
    );
  const partial =
    live.reduce((n, r) => n + (r.errors?.length ?? 0), 0) + (digest.package_errors?.length ?? 0);
  if (partial) lines.push(`- partial errors: ${partial} (details in the collected JSON)`);
  const fleetSize = digest.stored
    ? digest.stored.fleet_size
    : live.filter(r => r.github !== false).length;
  const quiet = fleet && fleetSize !== null ? fleetSize - active : 0;
  if (quiet > 0) lines.push(`- quiet: ${plural(quiet, 'repository', 'repositories')}`);
  if (lines.length === (header ? 1 : 0)) lines.push('- none');
  return lines.join('\n');
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

// The json blocks of the digest note, newest first; prose-only sections (before
// 2026-08-29) are skipped.
const readRuns = async () => {
  const doc = await vaultGet(DIGEST_PATH);
  if (!doc) return [];
  const runs = [];
  for (const section of doc.text.split(/\n(?=## )/)) {
    const m = /```json\n([\s\S]*?)\n```/.exec(section);
    if (!m) continue;
    try {
      runs.push(JSON.parse(m[1]));
    } catch {}
  }
  return runs.sort(byDesc(r => r.collected_at));
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
    console.log(opts.brief ? renderBrief(digest) : renderDigest(digest));
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
        `no stored runs${cutoff ? ` since ${short(cutoff)}` : ''} in ${DIGEST_PATH} — run collect --fleet, then commit`
      );
      return;
    }
    console.log(renderBrief(digest));
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
      `${repo ?? project}: no stored baseline in ${stateDocPath(project)} — run collect, then commit`
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
  if (runs.length && digest.repos.length) console.log(renderBrief(digest));
  else
    console.log(
      `${repo} — no stored movement${cutoff ? ` since ${short(cutoff)}` : ` in the last ${opts.runs} runs`}`
    );
};

const commands = {collect, show, commit, file: fileItem};
if (!commands[command]) fail(1, `Unknown command: ${command}\n\n${usage}`);
commands[command]().catch(err => fail(1, err.stack ?? String(err)));
