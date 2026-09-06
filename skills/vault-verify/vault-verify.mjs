#!/usr/bin/env node
// vault-verify — check a project's vault notes against its repository: every
// backticked path, commit, version and file count the notes assert, verified
// against git and the working tree. Report-only, like vault-lint; the rules
// live in ./verify-claims.mjs (pure, pinned by its test). check-drift asks
// "did the repository move since the baseline?"; this asks "does the
// repository support what the notes say?".
//
//   vault-verify.mjs [project] [--quiet] [--unchecked] [--all] [--fenced]
//                    [--files=decisions,learnings] [--max=N] [--siblings=DIR]
//   --all also reads corpus/, research/, archives and queue-archive.md, which
//   describe other codebases or history and are skipped by default.
//
// Project resolves as check-drift does: the argument, else .claude/vault-project,
// else the repository's directory name. Notes come from /sections under
// projects/<name>/, archives and state.md excluded unless --all. Exit 1 on
// findings, 0 clean, 2 on a git or API error. Exits non-zero — run it solo or
// guard with `|| true` in a parallel Bash batch.

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {extractClaims, verifyClaims} from './verify-claims.mjs';

if (!import.meta.main)
  throw new Error(
    'vault-verify.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  for (const a of args) {
    if (a === name) return true;
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return fallback;
};
const QUIET = flag('--quiet', false) === true;
const UNCHECKED = flag('--unchecked', false) === true;
const ALL = flag('--all', false) === true;
const FENCED = flag('--fenced', false) === true;
const MAX = Number(flag('--max', '40'));
const FILES =
  flag('--files', null)
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean) ?? null;
const projectArg = args.find(a => !a.startsWith('--'));

process.env.GIT_NO_LAZY_FETCH = '1'; // a partial clone must never fetch to answer a lookup
const git = (cwd, ...argv) =>
  execFileSync('git', argv, {cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024});
let root;
try {
  root = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
} catch {
  console.error('vault-verify: not inside a git repository — run it from the project directory');
  process.exit(2);
}
const projectFile = join(root, '.claude', 'vault-project');
const PROJECT =
  projectArg ??
  (existsSync(projectFile) ? readFileSync(projectFile, 'utf8').trim() : basename(root));
const SIBLINGS = flag('--siblings', dirname(root));

// --- facts from git, one run each ---------------------------------------
const tracked = new Set(git(root, 'ls-files', '-z').split('\0').filter(Boolean));
const history = new Map();
const commits = new Map();
{
  const out = git(root, 'log', '--all', '--name-status', '--format=%x01%H %ad', '--date=short');
  let date = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('\x01')) {
      const [sha, d] = line.slice(1).split(' ');
      commits.set(sha, d);
      date = d;
      continue;
    }
    if (!line || !date) continue;
    const parts = line.split('\t');
    const paths =
      parts[0].startsWith('R') || parts[0].startsWith('C') ? [parts[1], parts[2]] : [parts[1]];
    for (const p of paths) {
      if (!p) continue;
      const h = history.get(p) ?? {first: date, last: date};
      if (date < h.first) h.first = date;
      if (date > h.last) h.last = date;
      history.set(p, h);
    }
  }
  for (const [p, h] of history) h.gone = !tracked.has(p);
}
const tags = new Map(
  git(root, 'for-each-ref', 'refs/tags', '--format=%(refname:short) %(creatordate:short)')
    .split('\n')
    .filter(Boolean)
    .map(l => l.split(' '))
);
// Every version the package ever declared, so an unreleased 0.0.1 a note
// cites is a real version here and not a missing tag.
const versions = new Set();
{
  let out = '';
  try {
    out = git(root, 'log', '-p', '--format=', '--', 'package.json');
  } catch {}
  for (const m of out.matchAll(/^\+\s*"version":\s*"([^"]+)"/gm)) versions.add(m[1]);
  try {
    versions.add(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
  } catch {}
}
const topLevel = new Set();
for (const p of tracked) topLevel.add(p.split('/')[0]);
for (const p of history.keys()) topLevel.add(p.split('/')[0]);
const lineCounts = new Map();
const lineCount = path => {
  if (lineCounts.has(path)) return lineCounts.get(path);
  let n = null;
  try {
    const s = readFileSync(join(root, path), 'utf8');
    n = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  } catch {}
  lineCounts.set(path, n);
  return n;
};
const exists = path => existsSync(join(root, path));
const facts = {tracked, exists, history, tags, versions, commits, lineCount, topLevel};

// --- notes from the vault ------------------------------------------------
const api = path =>
  JSON.parse(
    execFileSync('vault-curl', [path, '-s'], {encoding: 'utf8', maxBuffer: 512 * 1024 * 1024})
  );
let notes = [];
try {
  const prefix = encodeURIComponent(`projects/${PROJECT}/`);
  for (let offset = 0; ;) {
    const page = api(`/sections?file_prefix=${prefix}&limit=100&offset=${offset}`);
    notes.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= (page.total ?? offset)) break;
  }
} catch (e) {
  console.error(
    `vault-verify: failed to load projects/${PROJECT}/ via vault-curl — ${e.message.split('\n')[0]}`
  );
  process.exit(2);
}
notes = notes.filter(r => {
  if (r.type === 'state') return false;
  // corpus/ and research/ notes describe other codebases by construction;
  // archives are history. All four are --all territory.
  if (
    !ALL &&
    (/(^|\/)(?:archive|corpus|research)\//.test(r.file_path) ||
      r.file_path.endsWith('/queue-archive.md'))
  )
    return false;
  if (FILES && !FILES.some(f => r.file_path.endsWith(`/${f}.md`) || r.file_path.includes(f)))
    return false;
  return true;
});

// --- verify --------------------------------------------------------------
const CATS = ['path', 'commit', 'version', 'date', 'count'];
const byCat = Object.fromEntries(CATS.map(c => [c, []]));
const unchecked = [];
let claimTotal = 0;
for (const r of notes) {
  const claims = extractClaims(r.body == null ? '' : String(r.body), {fenced: FENCED});
  claimTotal += claims.length;
  const {findings, unchecked: u} = verifyClaims(claims, facts);
  for (const f of findings) byCat[f.cat].push({...f, note: r.file_path});
  for (const f of u) unchecked.push({...f, note: r.file_path});
}

// An unknown commit that resolves in a sibling checkout is a cross-project
// citation, not a defect: demote it with the repository named.
{
  const unknown = byCat.commit.filter(f => f.sha);
  if (unknown.length && existsSync(SIBLINGS)) {
    const found = new Map();
    for (const d of readdirSync(SIBLINGS)) {
      const dir = join(SIBLINGS, d);
      if (dir === root || !existsSync(join(dir, '.git'))) continue;
      let out;
      try {
        out = execFileSync('git', ['-C', dir, 'cat-file', '--batch-check'], {
          input: unknown.map(f => f.sha).join('\n') + '\n',
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
      } catch {
        continue;
      }
      for (const line of out.split('\n')) {
        const m = /^([0-9a-f]+) commit /.exec(line);
        if (m)
          for (const f of unknown) if (m[1].startsWith(f.sha) && !found.has(f)) found.set(f, d);
      }
    }
    byCat.commit = byCat.commit.filter(f => !found.has(f));
    for (const [f, d] of found)
      unchecked.push({
        ...f,
        detail: `\`${f.sha}\` — not in this repository; it is a commit of ${d}`
      });
  }
}

// --- output --------------------------------------------------------------
const total = CATS.reduce((n, c) => n + byCat[c].length, 0);
const where = f => `${f.note}:${f.line}`;
if (QUIET) {
  for (const c of CATS) for (const f of byCat[c]) console.log(`${c}\t${where(f)}\t${f.detail}`);
  if (UNCHECKED)
    for (const f of unchecked) console.log(`unchecked-${f.cat}\t${where(f)}\t${f.detail}`);
} else {
  console.log(
    `vault-verify — ${PROJECT}: ${notes.length} notes, ${claimTotal} claims, against ${root}`
  );
  if (total === 0) console.log('clean — every checkable claim holds.');
  for (const c of CATS) {
    if (!byCat[c].length) continue;
    console.log(`\n${c.toUpperCase()} (${byCat[c].length})`);
    for (const f of byCat[c].slice(0, MAX)) console.log(`  ${where(f)}: ${f.detail}`);
    if (byCat[c].length > MAX)
      console.log(`  (+${byCat[c].length - MAX} more — --quiet for the full list)`);
  }
  if (UNCHECKED && unchecked.length) {
    console.log(`\nUNCHECKED (${unchecked.length}) — enumerated, nothing to verify them against`);
    for (const f of unchecked.slice(0, MAX)) console.log(`  ${where(f)}: ${f.detail}`);
    if (unchecked.length > MAX)
      console.log(`  (+${unchecked.length - MAX} more — --quiet for the full list)`);
  }
  if (total)
    console.log(
      `\n${total} findings — ${CATS.map(c => `${c}:${byCat[c].length}`).join(' ')}; ${unchecked.length} unchecked`
    );
}
process.exit(total > 0 ? 1 : 0);
