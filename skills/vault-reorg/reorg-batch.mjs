#!/usr/bin/env node

// reorg-batch — mechanical layer for /vault-reorg (2026-10-27, from the reorganization of
// apodict's learnings, on Eugene's rulings that no vault note grows without bound and that "a big
// size should trigger a reorg"). The judgment stays with the agent: classifying each unit is the
// triage agents' work, and the plan (which lessons go in which subject piece, merges, summaries)
// is the main session's.
//
//   reorg-batch measure [--prefix=projects/] [--note-kb=50] [--piece-kb=20] [--json]
//   reorg-batch prepare <path> [--out-dir=DIR] [--shard-kb=110] [--full] [--repo=DIR]
//   reorg-batch merge --dir=DIR
//   reorg-batch build --dir=DIR --plan=FILE
//   reorg-batch write --dir=DIR --plan=FILE [--holder=H] [--dry-run]
//   reorg-batch rebase --dir=DIR
//
// `prepare` reads a flat rolling note (note mode: it becomes a folder of subject pieces) or a piece
// of such a folder (piece mode: it is superseded in place by its live bullets), writes the shards,
// the triage brief, and a snapshot of the notes a session reads, and prints the cost estimate.
// `write` claims the note, supersedes it, writes the pieces, confirms the folder summary (note
// mode), verifies the composed view, and releases the claim.
//
// Exit 0 ok · 1 HTTP or partial failure · 2 usage · 3 input rejected before any write.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import {homedir, hostname, tmpdir} from 'node:os';
import {basename, dirname, isAbsolute, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {vaultSettings} from '../vault/vault-settings.mjs';
import {
  CLASSES,
  archivePathOf,
  buildPieces,
  mergeResults,
  shardRows,
  shardText,
  splitFrontmatter,
  splitNote,
  splitPiece,
  tailRows
} from './reorg-lib.mjs';

if (!import.meta.main)
  throw new Error(
    'reorg-batch.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const NOTE_KB = 50; // C7's bound for a running file (vault-storage design constraints)
const PIECE_KB = 20; // the folder bound the 2026-10-27 reorganization wrote into _about.md
const SHARD_KB = 110;
const TOKENS_PER_KB = 3300; // measured 2026-10-27: 2.3M agent tokens over 697 KB of bullets
const MINUTES_PER_SHARD = 25;
const ATOMIZED = 'Atomized from `';
const LESSONS = /learnings/; // the notes the brief's classes judge; records (decisions, queues, archives) need others
const ENRICH = new URL('../vault-enrich-all/enrich-batch.mjs', import.meta.url).pathname;

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const usage = `Usage:
  reorg-batch measure [--prefix=projects/] [--note-kb=${NOTE_KB}] [--piece-kb=${PIECE_KB}] [--json]
  reorg-batch prepare <path> [--out-dir=DIR] [--shard-kb=${SHARD_KB}] [--full] [--repo=DIR]
  reorg-batch merge --dir=DIR
  reorg-batch build --dir=DIR --plan=FILE
  reorg-batch write --dir=DIR --plan=FILE [--holder=H] [--dry-run]
  reorg-batch rebase --dir=DIR`;

const [command, ...rest] = process.argv.slice(2);
if (!['measure', 'prepare', 'merge', 'build', 'write', 'rebase'].includes(command))
  fail(command === '--help' || command === '-h' ? 0 : 2, usage);

const FLAGS = {
  measure: ['--prefix', '--note-kb', '--piece-kb', '--json'],
  prepare: ['--out-dir', '--shard-kb', '--full', '--repo'],
  merge: ['--dir'],
  build: ['--dir', '--plan'],
  write: ['--dir', '--plan', '--holder', '--dry-run'],
  rebase: ['--dir']
};
const opts = {};
const positional = [];
for (const arg of rest) {
  if (!arg.startsWith('--')) {
    positional.push(arg);
    continue;
  }
  const eq = arg.indexOf('=');
  const flag = eq < 0 ? arg : arg.slice(0, eq);
  if (!FLAGS[command].includes(flag)) fail(2, `unknown option for ${command}: ${flag}\n${usage}`);
  opts[flag.slice(2)] = eq < 0 ? true : arg.slice(eq + 1);
}

const {base, token, problem} = vaultSettings();
if (problem) fail(2, problem);

const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

/** One HTTP exchange; never throws on a status, so a caller can read a 404 as an answer. */
const request = async (method, apiPath, body, headers = {}) => {
  const response = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
      ...headers
    },
    ...(body !== undefined ? {body: JSON.stringify(body)} : {})
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {status: response.status, ok: response.ok, headers: response.headers, text, json};
};

const api = async (method, apiPath, body, headers = {}) => {
  const answer = await request(method, apiPath, body, headers);
  if (!answer.ok)
    throw new Error(`${method} ${apiPath}: ${answer.json?.error ?? answer.status}`, {
      cause: {status: answer.status, code: answer.json?.code ?? 'http_error', details: answer.json}
    });
  return answer.json ?? answer.text;
};

const pool = async (jobs, width = 6) => {
  const results = new Array(jobs.length);
  let next = 0;
  const run = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({length: Math.min(width, jobs.length)}, run));
  return results;
};

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const kb = bytes => Math.round(bytes / 1024);
const inDir = (dir, file) => (isAbsolute(file) ? file : join(dir, file));

/** Every record under a prefix with the fields asked, paged by what each page returned. */
const listRecords = async (prefix, fields) => {
  const records = [];
  for (let offset = 0; ;) {
    const query = new URLSearchParams({limit: '100', offset: String(offset), fields});
    if (prefix) query.set('file_prefix', prefix);
    const page = await api('GET', `/sections?${query}`);
    if (!page.items.length) break;
    records.push(...page.items);
    offset += page.items.length;
  }
  return records;
};

const allRecords = async prefix =>
  (await listRecords(prefix, 'file_path,body,archived_at')).filter(
    r => !r.archived_at && !r.file_path.includes('/archive/')
  );

const measure = async () => {
  const noteLimit = Number(opts['note-kb'] ?? NOTE_KB) * 1024;
  const pieceLimit = Number(opts['piece-kb'] ?? PIECE_KB) * 1024;
  const records = await allRecords(opts.prefix ?? 'projects/');
  const folders = new Set(
    records
      .filter(
        r => r.file_path.endsWith('/_about.md') && (r.body ?? '').trimStart().startsWith(ATOMIZED)
      )
      .map(r => dirname(r.file_path))
  );
  const over = [];
  for (const r of records) {
    if (r.file_path.endsWith('/_about.md')) continue;
    const bytes = Buffer.byteLength(r.body ?? '', 'utf8');
    const piece = folders.has(dirname(r.file_path));
    const stem = basename(piece ? dirname(r.file_path) : r.file_path, '.md');
    if (bytes > (piece ? pieceLimit : noteLimit))
      over.push({
        path: r.file_path,
        kind: piece ? 'piece' : 'note',
        lessons: LESSONS.test(stem),
        kb: kb(bytes),
        tokens: kb(bytes) * TOKENS_PER_KB
      });
  }
  over.sort((a, b) => b.kb - a.kb);
  if (opts.json) {
    console.log(JSON.stringify({checked: records.length, over}, null, 1));
    return;
  }
  console.log(
    `${records.length} live notes checked; ${over.length} over the bound (notes ${kb(noteLimit)} KB, folder pieces ${kb(pieceLimit)} KB)`
  );
  for (const o of over) {
    const what = o.lessons ? `~${(o.tokens / 1e6).toFixed(1)}M tokens` : 'not lessons, not handled';
    console.log(
      `${String(o.kb).padStart(6)} KB  ${o.kind.padEnd(5)}  ${what.padEnd(24)}  ${o.path}`
    );
  }
};

/** The notes a session reads, mirrored under ref/ for the triage agents to grep. */
const snapshot = async (dir, project, exclude) => {
  const paths = [];
  const walk = async folder => {
    const {files} = await api('GET', `/vault/${encodePath(folder)}/`);
    for (const name of files) {
      if (name.endsWith('/')) {
        if (name !== 'archive/') await walk(`${folder}/${name.slice(0, -1)}`);
      } else if (name.endsWith('.md')) paths.push(`${folder}/${name}`);
    }
  };
  await walk('topics');
  await walk(`projects/${project}`);
  paths.push('projects/agent-workflow/feedback.md');
  const wanted = paths.filter(p => !exclude(p));
  const written = await pool(
    wanted.map(p => async () => {
      const answer = await request('GET', `/vault/${encodePath(p)}`);
      if (!answer.ok) return false;
      mkdirSync(dirname(join(dir, 'ref', p)), {recursive: true});
      writeFileSync(join(dir, 'ref', p), answer.text);
      return true;
    })
  );
  return {planned: wanted.length, written: written.filter(Boolean).length};
};

const prepare = async () => {
  const path = positional[0];
  if (!path || !path.endsWith('.md')) fail(2, `prepare needs a note path ending in .md\n${usage}`);
  const project = /^projects\/([^/]+)\//.exec(path)?.[1];
  if (!project) fail(2, `${path} is not a project note (projects/<name>/…)`);
  const note = await request('GET', `/vault/${encodePath(path)}`);
  if (!note.ok) fail(1, `GET ${path}: ${note.status}`);
  if (note.headers.get('x-program-clerk-composed') === 'true')
    fail(
      3,
      `${path} is a folder already: run prepare on the piece past its bound, not on the composed view`
    );
  const about = await request('GET', `/vault/${encodePath(dirname(path))}/_about.md`);
  const mode =
    about.ok && splitFrontmatter(about.text).body.trimStart().startsWith(ATOMIZED)
      ? 'piece'
      : 'note';
  const split = mode === 'piece' ? splitPiece(note.text) : splitNote(note.text);
  const dir = opts['out-dir'] ?? mkdtempSync(join(tmpdir(), 'vault-reorg-'));
  mkdirSync(join(dir, 'shards'), {recursive: true});
  mkdirSync(join(dir, 'out'), {recursive: true});
  const pass = opts.full ? 'full' : 'light';
  const shards = shardRows(split.rows, Number(opts['shard-kb'] ?? SHARD_KB) * 1024).map(
    (rows, i) => ({
      name: `${pass}-${i + 1}`,
      rows
    })
  );
  const unit = mode === 'piece' ? 'BULLET' : 'SECTION';
  for (const shard of shards)
    writeFileSync(join(dir, 'shards', `${shard.name}.md`), shardText(shard.rows, unit));
  const bytes = split.rows.reduce((sum, r) => sum + r.bytes, 0);
  const repo = opts.repo ?? join(homedir(), 'Open', project);
  // The note as planned, which `write` fences its supersede on (3e, vault-storage D546).
  const units = {
    path,
    project,
    mode,
    pass,
    repo,
    intro: split.intro ?? null,
    rows: split.rows,
    etag: note.headers.get('etag'),
    text: note.text
  };
  writeFileSync(join(dir, 'units.json'), JSON.stringify(units));
  const ref = await snapshot(dir, project, p => p === path);
  const fill = {
    NOTE: path,
    PROJECT: project,
    REPO: repo,
    REF: join(dir, 'ref'),
    MODE: mode,
    UNIT: unit.toLowerCase(),
    SIZE_KB: String(kb(bytes)),
    COUNT: String(split.rows.length)
  };
  const template = readFileSync(new URL('./brief.md', import.meta.url), 'utf8');
  writeFileSync(
    join(dir, 'brief.md'),
    template.replace(/\{\{(\w+)\}\}/g, (m, k) => fill[k] ?? m)
  );
  console.log(
    JSON.stringify(
      {
        dir,
        path,
        mode,
        pass,
        units: split.rows.length,
        kb: kb(bytes),
        ref,
        shards: shards.map(s => ({
          name: s.name,
          units: s.rows.length,
          kb: kb(s.rows.reduce((sum, r) => sum + r.bytes, 0)),
          range: `${s.rows[0].n}–${s.rows.at(-1).n}`,
          out: join(dir, 'out', `${s.name}.json`)
        })),
        estimate: {tokens: kb(bytes) * TOKENS_PER_KB, wall_minutes: MINUTES_PER_SHARD}
      },
      null,
      1
    )
  );
};

const merge = () => {
  const dir = opts.dir ?? fail(2, usage);
  const names = readdirSync(join(dir, 'shards'))
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort();
  const absent = names.filter(n => !existsSync(join(dir, 'out', `${n}.json`)));
  if (absent.length) fail(3, `no result yet for: ${absent.join(', ')}`);
  let merged;
  try {
    merged = mergeResults(
      names.map(name => ({name, result: readJson(join(dir, 'out', `${name}.json`))}))
    );
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(3, err.message);
  }
  writeFileSync(join(dir, 'keep-all.json'), JSON.stringify(merged, null, 1));
  const bySubject = Map.groupBy(merged.keep, k => k.subject);
  const lines = [];
  for (const [subject, items] of [...bySubject].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`\n##### ${subject} (${items.length})`);
    for (const k of items.toSorted(
      (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.n - b.n
    )) {
      const ev =
        k.class === 'D' ? '' : ` || ${(k.evidence ?? '').replace(/\s+/g, ' ').slice(0, 160)}`;
      lines.push(`[${k.id}] §${k.n} ${k.date} ${k.class}: ${k.text}${ev}`);
    }
  }
  writeFileSync(join(dir, 'keep-read.txt'), lines.join('\n') + '\n');
  const total = CLASSES.reduce((sum, c) => sum + merged.bytes[c], 0) || 1;
  console.log(`shards ${names.length}, units ${merged.sections}, bullets ${merged.bullets}`);
  for (const c of CLASSES)
    console.log(
      `  ${c.padEnd(7)} ${String(merged.counts[c]).padStart(5)} bullets  ${((100 * merged.bytes[c]) / total).toFixed(1).padStart(5)}%`
    );
  const keptBytes = merged.keep.reduce((sum, k) => sum + Buffer.byteLength(k.text), 0);
  console.log(
    `keep ${merged.keep.length} items, ${kb(keptBytes)} KB of text; read ${join(dir, 'keep-read.txt')}`
  );
  for (const [subject, items] of bySubject) console.log(`  ${subject}: ${items.length}`);
  console.log(`defects reported: ${merged.defects.length}`);
  for (const {shard, defect} of merged.defects) console.log(`  [${shard}] ${defect}`);
};

const loadPlan = dir => {
  const plan = readJson(opts.plan ?? fail(2, usage));
  const problems = [];
  for (const piece of plan.pieces ?? []) {
    for (const key of ['name', 'title', 'tags', 'summary', 'key_concepts', 'items'])
      if (!(key in piece)) problems.push(`piece ${piece.name ?? '?'} lacks \`${key}\``);
    if (!/^[a-z0-9-]+$/.test(piece.name ?? ''))
      problems.push(`piece name ${piece.name} is not kebab-case`);
    if ((piece.summary ?? '').length >= 3000)
      problems.push(`piece ${piece.name}'s summary is 3,000 characters or more`);
  }
  if (!plan.pieces?.length) problems.push('the plan names no pieces');
  if (problems.length) fail(3, `plan rejected:\n${problems.join('\n')}`);
  return plan;
};

const piecesOf = (dir, plan, units) => {
  const merged = readJson(join(dir, 'keep-all.json'));
  const folder = units.mode === 'piece' ? dirname(units.path) : units.path.slice(0, -3);
  const archive = archivePathOf(units.path, new Date().getUTCFullYear()).slice(0, -3);
  const intro =
    plan.intro ??
    (units.mode === 'piece'
      ? units.intro
      : 'One piece of the current view of this project’s learnings ' +
        `([[${folder}]]). Each lesson ends with its source in the archived note ([[${archive}]]): ` +
        '`§n` is that note’s nth `##` section, `§0` its opening block. A *half-saved* lesson also ' +
        'lives where sessions rarely read; an *unsure* one names what would settle it.');
  const sources = units.mode === 'piece' ? Object.fromEntries(units.rows.map(r => [r.n, r])) : null;
  let built;
  try {
    built = buildPieces(merged.keep, plan, {sources, intro});
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(3, err.message);
  }
  return built.map(b => {
    const piece = plan.pieces.find(p => p.name === b.name);
    const frontmatter = {
      title: piece.title,
      type: 'project',
      status: 'active',
      tags: piece.tags,
      related: piece.related ?? [`[[${folder}]]`, `[[${archive}]]`],
      agent: {
        summary: piece.summary,
        key_concepts: piece.key_concepts,
        tags_suggested: [],
        related_proposed: [],
        edge_classifications: {},
        complexity: 'prose',
        derived_from_hash: 'auto'
      }
    };
    return {...b, path: `${folder}/${b.name}.md`, frontmatter};
  });
};

const build = () => {
  const dir = opts.dir ?? fail(2, usage);
  const units = readJson(join(dir, 'units.json'));
  const pieces = piecesOf(dir, loadPlan(dir), units);
  mkdirSync(join(dir, 'pieces'), {recursive: true});
  for (const p of pieces) {
    writeFileSync(join(dir, 'pieces', `${p.name}.md`), p.body);
    writeFileSync(join(dir, 'pieces', `${p.name}.fm.json`), JSON.stringify(p.frontmatter, null, 1));
    const flag = p.bytes > PIECE_KB * 1024 ? `  over ${PIECE_KB} KB: split it` : '';
    console.log(`${p.path}  ${p.items} items  ${(p.bytes / 1024).toFixed(1)} KB${flag}`);
  }
  console.log(
    `${pieces.length} pieces, ${pieces.reduce((s, p) => s + p.items, 0)} lessons, ${kb(pieces.reduce((s, p) => s + p.bytes, 0))} KB; read ${join(dir, 'pieces')} before write`
  );
};

/** Confirms the folder's summary against the composed note, through enrich-batch's refresh. */
const confirmFolderSummary = (dir, aboutPath, holder) => {
  writeFileSync(join(dir, 'about.txt'), `${aboutPath}\n`);
  const ws = join(dir, 'about-ws.json');
  const run = args => spawnSync(process.execPath, [ENRICH, ...args], {encoding: 'utf8'});
  const prepared = run([
    'prepare',
    '--refresh',
    `--records=${join(dir, 'about.txt')}`,
    `--holder=${holder}-about`,
    `--out=${ws}`
  ]);
  if (prepared.status !== 0) return `prepare exited ${prepared.status}: ${prepared.stderr.trim()}`;
  writeFileSync(join(dir, 'about-enr.json'), JSON.stringify({[aboutPath]: {summary_holds: true}}));
  const applied = run([
    'apply',
    `--worksheet=${ws}`,
    `--enrichments=${join(dir, 'about-enr.json')}`
  ]);
  return applied.status === 0 ? null : `apply exited ${applied.status}: ${applied.stderr.trim()}`;
};

const verify = async (folder, expected) => {
  const composed = await request('GET', `/vault/${encodePath(folder)}.md`);
  const listing = await listRecords(`${folder}/`, 'file_path,agent_summary');
  const direct = listing.filter(r => !r.file_path.slice(folder.length + 1).includes('/'));
  const resolved = await request('GET', `/resolve?${new URLSearchParams({wikilink: folder})}`);
  const lint = await api('GET', '/system/lint');
  return {
    composed: composed.headers.get('x-program-clerk-composed') === 'true',
    composed_kb: kb(Buffer.byteLength(composed.text)),
    records: direct.length,
    expected,
    without_summary: direct.filter(r => !r.agent_summary).map(r => r.file_path),
    resolves_to: resolved.json?.file_path ?? null,
    lint: {ok: lint.ok, total_issues: lint.total_issues}
  };
};

const write = async () => {
  const dir = opts.dir ?? fail(2, usage);
  const units = readJson(join(dir, 'units.json'));
  const plan = loadPlan(dir);
  const pieces = piecesOf(dir, plan, units);
  const holder = opts.holder ?? `${hostname().split('.')[0]}/vault-reorg`;
  const folder = units.mode === 'piece' ? dirname(units.path) : units.path.slice(0, -3);
  let successor;
  if (units.mode === 'note') {
    const about = plan.about ?? fail(3, 'note mode needs `about` in the plan');
    const body = readFileSync(inDir(dir, about.body_file), 'utf8');
    if (!body.trimStart().startsWith(ATOMIZED))
      fail(
        3,
        `the _about.md body must open with "${ATOMIZED}" so the server reads the folder as a note's pieces`
      );
    if (body.includes('> Supersedes'))
      fail(3, 'the _about.md body must not carry a Supersedes footer: the server appends it');
    successor = {
      path: `${folder}/_about.md`,
      frontmatter: {
        title: about.title,
        type: 'meta',
        status: 'active',
        tags: about.tags,
        related: about.related ?? [],
        agent: {
          summary: about.summary,
          key_concepts: about.key_concepts,
          tags_suggested: [],
          related_proposed: [],
          edge_classifications: {},
          complexity: 'hub',
          derived_from_hash: 'auto'
        }
      },
      body
    };
  } else {
    const same = pieces.find(p => p.path === units.path);
    if (!same)
      fail(
        3,
        `piece mode needs a plan piece named ${basename(units.path, '.md')}, which takes the old path`
      );
    successor = same;
  }
  const rest = pieces.filter(p => p !== successor);
  console.log(
    `${units.mode} mode: supersede ${units.path} by ${successor.path}, then write ${rest.length} pieces under ${folder}/`
  );
  if (opts['dry-run']) {
    for (const p of rest)
      console.log(`  would write ${p.path} (${(p.bytes / 1024).toFixed(1)} KB)`);
    return;
  }
  const items = units.mode === 'note' ? [units.path, `${folder}/`] : [units.path];
  const claim = await api('POST', '/claims', {
    holder,
    purpose: 'compact',
    items,
    ttl_seconds: 3600
  });
  if (claim.held?.length)
    fail(3, `another pass holds: ${claim.held.map(h => `${h.item} (${h.holder})`).join(', ')}`);
  const release = () => api('POST', '/claims/release', {holder, claim_token: claim.claim_token});
  let written = 0;
  let archived = null;
  try {
    const superseded = await api(
      'POST',
      '/vault/supersede',
      {
        old_path: units.path,
        new_path: successor.path,
        frontmatter: successor.frontmatter,
        body: successor.body,
        claim_token: claim.claim_token,
        strict_tags: true
      },
      units.etag ? {'If-Match': units.etag} : {}
    );
    archived = superseded.old.path;
    console.log(`archived ${units.path} at ${archived}; ${superseded.new.path} written`);
    for (const p of rest) {
      await api('PUT', `/vault/${encodePath(p.path)}`, {
        frontmatter: p.frontmatter,
        body: p.body,
        strict_tags: true
      });
      written++;
      console.log(`  wrote ${p.path}`);
    }
  } catch (err) {
    await release();
    const next = archived
      ? `the old note is archived at ${archived}, so never re-run write (its path is gone): put each missing piece from ${join(dir, 'pieces')} with vault-put.mjs <path> --fm <name>.fm.json --body <name>.md, then confirm the folder summary and verify`
      : err.cause?.status === 412
        ? `nothing was superseded: ${units.path} changed since prepare, so run rebase --dir=${dir} for what was added`
        : 'nothing was superseded, so fix the cause and run write again';
    fail(
      1,
      `${err.message}\nwritten ${written} of ${rest.length} pieces; the claim is released; ${next}`
    );
  }
  console.log(`written ${written} of ${rest.length} pieces planned`);
  if (units.mode === 'note') {
    const problem = confirmFolderSummary(dir, successor.path, holder);
    console.log(
      problem
        ? `folder summary not confirmed (${problem}); the sweep's folder stage refreshes it`
        : 'folder summary confirmed against the composed note'
    );
  } else
    console.log(
      "folder summary left to the sweep's folder stage, since the pieces under it changed"
    );
  await release();
  const expected = units.mode === 'note' ? pieces.length + 1 : null;
  console.log(JSON.stringify(await verify(folder, expected), null, 1));
};

/**
 * After write's supersede was refused because the note changed since prepare (3e, vault-storage
 * D546): the units appended since go into a shard of their own for the same triage, and the note
 * as read now becomes the one write fences on.
 */
const rebase = async () => {
  const dir = opts.dir ?? fail(2, usage);
  const units = readJson(join(dir, 'units.json'));
  if (!units.etag || typeof units.text !== 'string')
    fail(
      3,
      `${join(dir, 'units.json')} carries no tag, from a prepare before the fence: run prepare again`
    );
  const note = await request('GET', `/vault/${encodePath(units.path)}`);
  if (!note.ok) fail(1, `GET ${units.path}: ${note.status}`);
  const etag = note.headers.get('etag');
  if (etag === units.etag) {
    console.log(`${units.path} is as prepare read it: run write again`);
    return;
  }
  let rows;
  try {
    rows = tailRows(units.mode, units.text, note.text, Math.max(0, ...units.rows.map(r => r.n)));
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(3, `${units.path}: ${err.message}; run prepare again`);
  }
  const name = `tail-${readdirSync(join(dir, 'shards')).filter(f => /^tail-\d+\.md$/.test(f)).length + 1}`;
  if (rows.length)
    writeFileSync(
      join(dir, 'shards', `${name}.md`),
      shardText(rows, units.mode === 'piece' ? 'BULLET' : 'SECTION')
    );
  writeFileSync(
    join(dir, 'units.json'),
    JSON.stringify({...units, rows: [...units.rows, ...rows], etag, text: note.text})
  );
  console.log(
    JSON.stringify(
      {
        path: units.path,
        appended: rows.length,
        ...(rows.length
          ? {
              shard: {
                name,
                units: rows.length,
                range: `${rows[0].n}–${rows.at(-1).n}`,
                out: join(dir, 'out', `${name}.json`)
              },
              next: 'triage the shard with brief.md into its out file, merge, place its kept items in the plan, then build and write'
            }
          : {next: 'nothing but whitespace was added: write again'})
      },
      null,
      1
    )
  );
};

const commands = {measure, prepare, merge, build, write, rebase};
try {
  await commands[command]();
} catch (err) {
  fail(1, err.cause ? `${err.message} (${JSON.stringify(err.cause)})` : err.message);
}
