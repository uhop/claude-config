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
//   fleet-status.mjs show --fleet --table                     # standing counts per repository, from the baselines
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
// collection can move to a schedule without consuming the events a later look
// needs. Items and comments carry an `excerpt` (first line of the body) for it.
//
// Parallel collection and watcher logins (2026-09-05): repositories are read by
// a pool of --jobs workers (default 6) — the fleet of 51 took 5m52s of wall
// clock for 1m23s of CPU when sequential, every `gh api` call being a process
// plus a TLS handshake. Progress lines print in completion order; the digest
// keeps enumeration order. Watchers carry the login like forks: a watcher
// subscribes to notifications, so a spam account watching is worth a name.
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
  fleet-status.mjs show FILE [--brief]                         # a collected file: full view, or the brief
  fleet-status.mjs show (--cwd | --repo OWNER/NAME | --project NAME) [--since WHEN | --runs N]
                                                               # stored baseline + stored movement, no GitHub access
  fleet-status.mjs show --fleet [--since WHEN | --runs N]      # stored movement across the fleet (the brief)
  fleet-status.mjs show --fleet --table                        # standing counts per repository, from the baselines
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
  '--jobs'
]);
const BOOL_FLAGS = new Set([
  '--cwd',
  '--fleet',
  '--star-logins',
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

// One REST read. With paginate, walks `page=` until a short page — never
// `--paginate`, whose output shape depends on the gh version.
const ghApi = async (route, {paginate = false, headers = []} = {}) => {
  const sep = route.includes('?') ? '&' : '?';
  const page = async n => {
    const argv = ['api'];
    for (const h of headers) argv.push('-H', h);
    argv.push(paginate ? `${route}${sep}per_page=100&page=${n}` : route);
    const r = await runAsync('gh', argv);
    if (!r.ok) {
      let message = r.err || 'gh api failed',
        status = null;
      try {
        const j = JSON.parse(r.out);
        if (j.message) message = j.message;
        if (j.status) status = Number(j.status);
      } catch {}
      const m = /HTTP (\d{3})/.exec(r.err ?? '');
      if (m) status = Number(m[1]);
      throw new GhError(status, message, route);
    }
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

// Discussions exist only on GraphQL. The query is fixed text; the mutation
// assertion is the documented guard behind the 2026-08-28 ruling that the
// collector, not the agent's command line, issues it.
const DISCUSSIONS_QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url body createdAt updatedAt closed isAnswered
        author { login }
        category { name }
        reactions { totalCount }
        comments(first: 100) {
          totalCount
          nodes { updatedAt body author { login } reactions { totalCount } }
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

// The `## GitHub` section of state.md: the heading, one fenced json block.
const GITHUB_HEADING = '## GitHub';
const findGithubBlock = text => {
  const at = text.indexOf(`\n${GITHUB_HEADING}\n`);
  if (at < 0) return null;
  const m = /```json\n([\s\S]*?)\n```/.exec(text.slice(at));
  if (!m) return {heading: true, block: null, json: null};
  let json = null;
  try {
    json = JSON.parse(m[1]);
  } catch {}
  return {heading: true, block: m[0], json};
};

const githubSection = snapshot =>
  `${GITHUB_HEADING}\n\nAuto-maintained by the \`fleet-status\` skill (\`/fleet-status\`, \`/vault resume\`); the\nbaseline the next GitHub collection diffs against. Refresh: \`fleet-status.mjs commit\`.\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n`;

const stateDocPath = project => `projects/${project}/state.md`;

const readBaseline = async project => {
  const doc = await vaultGet(stateDocPath(project));
  if (!doc) return {doc: null, baseline: null};
  const found = findGithubBlock(doc.text);
  return {doc, baseline: found?.json ?? null};
};

// ─── Repository resolution ───────────────────────────────────────────────────

const parseGithubRemote = url => {
  const m =
    /^(?:git@github\.com:|https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git:\/\/github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
      (url ?? '').trim()
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

const isBot = login => /\[bot\]$/.test(login ?? '');

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

const collectRepo = async ({owner, name, project, baseline, sinceDays, starLogins}) => {
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
      bot: isBot(it.user?.login),
      created_at: it.created_at,
      updated_at: it.updated_at,
      comments: it.comments ?? 0,
      review_comments: 0,
      reactions: it.reactions?.total_count ?? 0,
      comment_reactions: null,
      last_comment: null,
      labels: (it.labels ?? []).map(l => l.name),
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
      }
    } else if (record.comments === 0 && !isPr) {
      record.comment_reactions = 0;
    }
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
              category: d.category?.name ?? null,
              created_at: d.createdAt,
              updated_at: d.updatedAt,
              comments: d.comments.totalCount,
              reactions: d.reactions.totalCount,
              comment_reactions: d.comments.nodes.reduce((s, c) => s + c.reactions.totalCount, 0),
              last_comment: latestComment(d.comments.nodes),
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

  // Dependabot alerts reject `page=` (cursor pagination only): one 100-item
  // read for both alert lists, flagged when it may be short.
  const alertSet = async (route, severity) => {
    try {
      const list = await ghApi(`${route}&per_page=100`);
      const set = {open: list.length, by_severity: countBy(list, severity)};
      if (list.length >= 100) set.truncated = true;
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
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < targets.length) {
      const i = nextIndex++;
      const t = targets[i];
      const {baseline} = await readBaseline(t.project);
      let entry;
      try {
        entry = await collectRepo({...t, baseline, sinceDays, starLogins});
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
  const digest = {
    collected_at: new Date().toISOString(),
    mode,
    gh_user: ghUser,
    repos,
    totals: {
      repos: repos.length,
      events: repos.reduce((n, r) => n + r.events.length, 0),
      first_run: repos.filter(r => r.first_run).length,
      errors: repos.filter(r => r.error).length,
      partial_errors: repos.reduce((n, r) => n + (r.errors?.length ?? 0), 0)
    }
  };
  console.error(
    `total: repos=${digest.totals.repos} events=${digest.totals.events} first_run=${digest.totals.first_run} errors=${digest.totals.errors} partial=${digest.totals.partial_errors}`
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

const commitRepo = async entry => {
  const {project, snapshot} = entry;
  const docPath = stateDocPath(project);
  const doc = await vaultGet(docPath);
  const section = githubSection(snapshot);
  if (!doc) {
    // Same frontmatter check-drift writes, so its --update keeps treating the
    // document as its own; it preserves this section (patched 2026-08-28).
    const body = `Auto-maintained by the \`vault-check-drift\` and \`fleet-status\` skills. Refresh: run\n\`/vault check --update\` from the project directory, or re-run \`/vault resume\`.\n\n${section}`;
    await vaultPut(
      docPath,
      {title: `${project} — state snapshot`, type: 'state', tags: ['state', 'snapshot', project]},
      body
    );
    return 'created';
  }
  const found = findGithubBlock(doc.text);
  if (found?.block) {
    const to = /```json\n[\s\S]*?\n```/.exec(section)[0];
    await vaultEdit(docPath, {op: 'replace', from: found.block, to});
    return 'replaced';
  }
  await vaultEdit(docPath, {op: 'append', text: `\n${section}`});
  return found ? 'block added' : 'section added';
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
    default:
      return `${e.kind} ${JSON.stringify(e)}`;
  }
};

// One run of the digest note: the brief, then a json block of the run's events
// (snapshots stay in state.md) for `show --fleet` / `show --repo` to read back.
const runRecord = digest => ({
  collected_at: digest.collected_at,
  mode: digest.mode,
  gh_user: digest.gh_user ?? null,
  totals: digest.totals,
  repos: digest.repos.map(r =>
    r.error
      ? {repo: r.repo, project: r.project, error: r.error, events: [], summary: r.summary}
      : {
          repo: r.repo,
          project: r.project,
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
    if (entry.error || !entry.snapshot) {
      console.log(`${entry.repo}: not committed (${entry.error?.message ?? 'no snapshot'})`);
      continue;
    }
    const result = await commitRepo(entry);
    ++written;
    console.log(`${entry.repo}: baseline ${result} in ${stateDocPath(entry.project)}`);
  }
  if (digest.mode === 'fleet' || digest.totals?.events > 0) {
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
  const itemText = `- **${heading}** ${body}`;
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
  if (text.includes('\n## Active\n')) {
    await vaultEdit(docPath, {
      op: 'replace',
      from: '\n## Active\n',
      to: `\n## Active\n\n${itemText}\n`
    });
    console.log(`${docPath}: item inserted at the top of Active`);
    return;
  }
  if (text.includes('\n## Backlog\n')) {
    await vaultEdit(docPath, {
      op: 'replace',
      from: '\n## Backlog\n',
      to: `\n## Active\n\n${itemText}\n\n## Backlog\n`
    });
    console.log(`${docPath}: Active section created with the item`);
    return;
  }
  await vaultEdit(docPath, {op: 'append', text: `\n## Active\n\n${itemText}\n`});
  console.log(`${docPath}: Active section appended with the item`);
};

// ─── Show ────────────────────────────────────────────────────────────────────

const plural = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
const short = iso => (iso ?? '').replace(/T(\d\d:\d\d).*$/, ' $1');
const byDesc = key => (a, b) => (key(b) ?? '').localeCompare(key(a) ?? '');

const renderRepo = entry => {
  if (entry.error) return `${entry.repo}: ERROR ${entry.error.message}`;
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
    return `${a.open}${a.truncated ? '+' : ''}${bySeverity ? ` (${bySeverity})` : ''}`;
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
    reactions = new Map(),
    bots = [],
    alertsDown = [];
  const add = (m, key, n) => m.set(key, (m.get(key) ?? 0) + n);
  const name_ = (m, key, login) => m.set(key, [...(m.get(key) ?? []), login]);
  for (const r of repos) {
    const name = shortRepo(r.repo, ghUser);
    for (const e of r.events) {
      const k = e.kind;
      if (k === 'stars.count') add(stars, name, e.delta ?? e.to - e.from);
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
    if (weighted.length) ++active;
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
  const partial = live.reduce((n, r) => n + (r.errors?.length ?? 0), 0);
  if (partial) lines.push(`- partial errors: ${partial} (details in the collected JSON)`);
  const fleetSize = digest.stored ? digest.stored.fleet_size : live.length;
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
    if (run.mode === 'fleet' && run.totals?.repos)
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

// Standing counts per repository from every stored baseline: a Markdown table.
const renderTable = async () => {
  const r = await vaultFetch('/vault/projects/');
  if (!r.ok) throw new Error(`GET /vault/projects/: ${r.status} ${r.statusText}`);
  const folders = ((await r.json()).files ?? [])
    .filter(f => f.endsWith('/'))
    .map(f => f.slice(0, -1));
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
      return !a || a.unavailable ? 'off' : `${a.open}${a.truncated ? '+' : ''}`;
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
  return [head, head.map(() => '---'), ...rows].map(r => `| ${r.join(' | ')} |`).join('\n');
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
      console.log(await renderTable());
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
  const {baseline} = await readBaseline(project);
  if (!baseline) {
    console.log(
      `${repo ?? project}: no stored baseline in ${stateDocPath(project)} — run collect, then commit`
    );
    return;
  }
  repo = baseline.repo ?? repo ?? project;
  console.log(
    renderRepo({
      repo,
      project,
      stored: true,
      first_run: false,
      events: [],
      errors: [],
      snapshot: baseline
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
