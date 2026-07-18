#!/usr/bin/env node

// release-digest — deterministic probe layer for /release-check (skills-
// restructuring program, filed 2026-07-18). Runs every mechanical check of
// the release checklist against the cwd project and prints one JSON digest;
// the agent reads it and does only the judgment: release-or-not, tier,
// currency of prose docs, the edits themselves, and running the test matrix.
//
//   release-digest.mjs [project-dir] [--no-network]
//
// --no-network skips `npm outdated` (registry round-trip); the tarball
// dry-run is local and always runs. Every check reports
// {status: "ok" | "action" | "skip" | "error", ...detail}. Exit 0 clean,
// 1 when any check is "action"/"error" — run solo or `|| true` in
// parallel Bash batches.

import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const noNetwork = args.includes('--no-network');
const root = path.resolve(args.find(a => !a.startsWith('--')) ?? '.');
if (!existsSync(path.join(root, 'package.json'))) {
  console.error(`no package.json in ${root}`);
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const run = (cmd, argv, opts = {}) => {
  try {
    return {ok: true, out: execFileSync(cmd, argv, {cwd: root, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, ...opts}).trim()};
  } catch (err) {
    return {ok: false, out: (err.stdout ?? '').toString().trim(), err: (err.stderr ?? err.message ?? '').toString().trim(), status: err.status};
  }
};

const exists = rel => existsSync(path.join(root, rel));
const walk = (dir, files = []) => {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
};

const digest = {project: pkg.name, version: pkg.version, generated_at: new Date().toISOString(), checks: {}};
const check = (name, value) => (digest.checks[name] = value);

// --- git: last released tag + changes since (input to the step-0 judgment) --
{
  const tag = run('git', ['describe', '--tags', '--abbrev=0']);
  const lastTag = tag.ok ? tag.out : null;
  const range = lastTag ? [`${lastTag}..HEAD`] : ['HEAD'];
  const log = run('git', ['log', '--format=%h\t%s', ...range]);
  const commits = log.ok && log.out ? log.out.split('\n').map(line => line.replace('\t', ' ')) : [];
  const dirty = run('git', ['status', '--porcelain']).out !== '';
  check('git', {
    status: 'ok',
    last_tag: lastTag,
    tag_is_bare_semver: lastTag === null || /^(?:[a-z0-9-]+-)?\d+\.\d+\.\d+$/.test(lastTag),
    commits_since: commits.slice(0, 50),
    commit_count: commits.length,
    working_tree_dirty: dirty
  });
}

// --- type sidecars: every src .js paired with .d.ts + @ts-self-types --------
{
  const srcDir = path.join(root, 'src');
  if (!existsSync(srcDir)) check('sidecars', {status: 'skip', reason: 'no src/'});
  else {
    const files = walk(srcDir).map(p => path.relative(root, p));
    const js = files.filter(f => f.endsWith('.js'));
    const dts = new Set(files.filter(f => f.endsWith('.d.ts')));
    if (!dts.size) check('sidecars', {status: 'skip', reason: 'no .d.ts sidecars in src/ (not a sidecar project)'});
    else {
      const missingSidecar = [], missingDirective = [];
      for (const file of js) {
        const sidecar = file.replace(/\.js$/, '.d.ts');
        if (!dts.has(sidecar)) {
          missingSidecar.push(file);
          continue;
        }
        const head = readFileSync(path.join(root, file), 'utf8').split('\n', 3).join('\n');
        if (!head.includes('@ts-self-types=')) missingDirective.push(file);
      }
      const orphans = [...dts].filter(d => !js.includes(d.replace(/\.d\.ts$/, '.js')));
      check('sidecars', {
        status: missingSidecar.length || missingDirective.length ? 'action' : 'ok',
        js_files: js.length, paired: js.length - missingSidecar.length,
        missing_sidecar: missingSidecar, missing_directive: missingDirective, orphan_dts: orphans
      });
    }
  }
}

// --- retired artifacts (fleet bundle removable set — probe every item) ------
{
  const found = ['.windsurfrules', '.cursorrules', '.clinerules', '.github/COPILOT-INSTRUCTIONS.md', '.windsurf']
    .filter(exists);
  const commandsDir = path.join(root, '.claude', 'commands');
  if (existsSync(commandsDir)) {
    const globalSkills = new Set(readdirSync(path.join(homedir(), '.claude', 'skills'), {withFileTypes: true})
      .filter(entry => entry.isDirectory()).map(entry => entry.name));
    for (const file of readdirSync(commandsDir)) {
      if (file.endsWith('.md') && globalSkills.has(file.replace(/\.md$/, '')))
        found.push(`.claude/commands/${file} (copy of promoted global skill)`);
    }
  }
  check('retired_artifacts', {status: found.length ? 'action' : 'ok', found});
}

// --- ai-docs presence (currency stays judgment — see /ai-docs-update) -------
check('ai_docs', {
  status: ['llms.txt', 'llms-full.txt', 'AGENTS.md'].every(exists) ? 'ok' : 'action',
  present: ['llms.txt', 'llms-full.txt', 'AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md'].filter(exists),
  absent: ['llms.txt', 'llms-full.txt', 'AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md'].filter(f => !exists(f))
});

// --- package.json: files hygiene, exports shape, description/keywords, bin --
{
  const FORBIDDEN = ['AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md', 'CODEBASE.md',
    '.cursorrules', '.windsurfrules', '.clinerules', '.claude', '.windsurf', '.github'];
  const files = pkg.files ?? null;
  const forbidden = files?.filter(entry => FORBIDDEN.includes(entry.replace(/\/$/, ''))) ?? [];
  const missing = files ? ['llms.txt', 'llms-full.txt'].filter(f => !files.includes(f)) : [];
  check('pkg_files', files
    ? {status: forbidden.length || missing.length ? 'action' : 'ok', missing_required: missing, forbidden_present: forbidden}
    : {status: 'action', reason: 'no files array — tarball contents are implicit'});

  const flagged = [];
  const inspect = (key, value) => {
    if (typeof value === 'object' && value !== null) {
      for (const conditional of Object.values(value)) inspect(key, conditional);
      return;
    }
    if (typeof value !== 'string') return;
    if (key.includes('*')) {
      const suffix = value.slice(value.indexOf('*') + 1);
      if (!value.includes('*') || suffix !== '')
        flagged.push({key, value, reason: 'transforming wildcard — importmap users must enumerate files'});
    } else if (value.endsWith('/index.js')) {
      if (!exists(value.replace(/^\.\//, ''))) flagged.push({key, value, reason: 'barrel target missing'});
    } else if (key !== '.' && !key.endsWith('.js') && value.endsWith('.js')) {
      flagged.push({key, value, reason: 'file-shape substitution (extension added)'});
    }
  };
  if (pkg.exports) for (const [key, value] of Object.entries(pkg.exports)) inspect(key, value);
  check('pkg_exports', pkg.exports
    ? {status: flagged.length ? 'action' : 'ok', flagged}
    : {status: 'skip', reason: 'no exports map'});

  check('pkg_meta', {
    status: pkg.description && pkg.keywords?.length ? 'ok' : 'action',
    description_present: !!pkg.description, keywords_present: !!pkg.keywords?.length
  });

  const bins = typeof pkg.bin === 'string' ? {[pkg.name]: pkg.bin} : pkg.bin ?? {};
  const modes = Object.values(bins).map(target => {
    const ls = run('git', ['ls-files', '-s', target]);
    const mode = ls.out.split(' ')[0] || null;
    return {target, mode, executable: mode === '100755'};
  });
  check('bin_modes', Object.keys(bins).length
    ? {status: 'ok', note: 'tidy, not load-bearing — npm sets the bit on install', targets: modes}
    : {status: 'skip', reason: 'no bin'});
}

// --- LICENSE copyright year covers the current year -------------------------
{
  if (!exists('LICENSE')) check('license_year', {status: 'action', reason: 'no LICENSE file'});
  else {
    const line = readFileSync(path.join(root, 'LICENSE'), 'utf8').split('\n')
      .find(l => /copyright/i.test(l)) ?? '';
    const years = [...line.matchAll(/\d{4}/g)].map(m => +m[0]);
    const covered = years.length > 0 && Math.max(...years) >= new Date().getFullYear();
    check('license_year', {status: covered ? 'ok' : 'action', line: line.trim(), spdx: pkg.license ?? null});
  }
}

// --- release-notes surfaces + wiki search index ----------------------------
{
  const wikiDir = ['wiki', 'external_wiki'].find(exists) ?? null;
  const readme = exists('README.md') ? readFileSync(path.join(root, 'README.md'), 'utf8') : '';
  check('release_notes', {
    status: 'ok',
    readme_release_section: /^#{1,3}\s.*release/im.test(readme),
    wiki_dir: wikiDir,
    wiki_release_notes: wikiDir ? exists(`${wikiDir}/Release-notes.md`) : false
  });
  if (wikiDir && exists(`${wikiDir}/search-index.json`)) {
    const indexMtime = statSync(path.join(root, wikiDir, 'search-index.json')).mtimeMs;
    const staleSources = walk(path.join(root, wikiDir))
      .filter(f => f.endsWith('.md') && statSync(f).mtimeMs > indexMtime)
      .map(f => path.relative(root, f));
    check('wiki_search_index', {
      status: staleSources.length ? 'action' : 'ok',
      note: staleSources.length ? 'regenerate: npx wiki-search-index --wiki . --repo OWNER/REPO' : undefined,
      newer_than_index: staleSources
    });
  } else check('wiki_search_index', {status: 'skip', reason: wikiDir ? 'no search-index.json' : 'no wiki'});
}

// --- dependency freshness (bump EVERYTHING reported, majors included) -------
{
  if (noNetwork) check('deps_outdated', {status: 'skip', reason: '--no-network'});
  else {
    const outdated = run('npm', ['outdated', '--json']);
    let parsed = null;
    try {
      parsed = JSON.parse(outdated.out || '{}');
    } catch {}
    if (parsed === null) check('deps_outdated', {status: 'error', message: outdated.err?.slice(0, 300) ?? 'unparseable npm outdated output'});
    else {
      const dev = new Set(Object.keys(pkg.devDependencies ?? {}));
      const items = Object.entries(parsed).map(([name, info]) => ({
        name, current: info.current, wanted: info.wanted, latest: info.latest,
        dev: dev.has(name), major: info.latest?.split('.')[0] !== info.current?.split('.')[0]
      }));
      check('deps_outdated', {status: items.length ? 'action' : 'ok', count: items.length, items});
    }
  }
}

// --- lockfile version sync (regen is unconditional after edits anyway) ------
{
  if (!exists('package-lock.json')) check('lockfile', {status: 'action', reason: 'no package-lock.json'});
  else {
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    const rootVersion = lock.version, selfVersion = lock.packages?.['']?.version;
    const inSync = rootVersion === pkg.version && (selfVersion === undefined || selfVersion === pkg.version);
    check('lockfile', {status: inSync ? 'ok' : 'action', pkg_version: pkg.version,
      lock_version: rootVersion, lock_self_version: selfVersion ?? null});
  }
}

// --- test matrix: which gates exist (running them stays with the agent) -----
{
  const scripts = Object.keys(pkg.scripts ?? {});
  check('test_matrix', {
    status: scripts.includes('test') ? 'ok' : 'action',
    gates: ['test', 'test:bun', 'test:deno', 'test:browser', 'ts-check', 'js-check', 'lint'].filter(s => scripts.includes(s))
  });
}

// --- tarball contents (npm pack --dry-run is the ground truth) --------------
{
  const pack = run('npm', ['pack', '--dry-run', '--json']);
  let files = null;
  try {
    files = JSON.parse(pack.out)[0].files.map(f => f.path);
  } catch {}
  if (!files) check('tarball', {status: 'error', message: pack.err?.slice(0, 300) ?? 'unparseable npm pack output'});
  else {
    const FORBIDDEN_FILES = ['AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md', 'CODEBASE.md',
      '.cursorrules', '.windsurfrules', '.clinerules'];
    const FORBIDDEN_DIRS = ['.claude/', '.windsurf/', '.github/'];
    const missing = ['llms.txt', 'llms-full.txt', 'README.md', 'LICENSE'].filter(f => !files.includes(f));
    const forbidden = files.filter(f => FORBIDDEN_FILES.includes(f) || FORBIDDEN_DIRS.some(d => f.startsWith(d)));
    check('tarball', {
      status: missing.length || forbidden.length ? 'action' : 'ok',
      file_count: files.length, missing_required: missing, forbidden_present: forbidden,
      has_src: !existsSync(path.join(root, 'src')) || files.some(f => f.startsWith('src/'))
    });
  }
}

// --- project-specific extensions ---------------------------------------------
check('project_specific', {
  status: 'ok',
  agents_releasing_section: exists('AGENTS.md') && /^#{1,3}\s.*releasing/im.test(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')),
  release_check_local: exists('.claude/release-check.local.md')
});

const actions = Object.entries(digest.checks).filter(([, c]) => c.status === 'action' || c.status === 'error');
digest.summary = {
  total: Object.keys(digest.checks).length,
  action: actions.map(([name]) => name),
  clean: actions.length === 0
};

console.log(JSON.stringify(digest, null, 2));
if (actions.length) process.exit(1);
