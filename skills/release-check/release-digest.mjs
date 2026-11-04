#!/usr/bin/env node

// release-digest — deterministic probe layer for /release-check + /release-prep (skills-
// restructuring program, filed 2026-07-18). Runs every mechanical check of
// the release checklist against the cwd project and prints one JSON digest;
// the agent reads it and does only the judgment: release-or-not, tier,
// currency of prose docs, the edits themselves, and running the test matrix.
//
//   release-digest.mjs [project-dir] [--no-network]
//
// --no-network skips `npm outdated` (registry round-trip) and the read of the
// pushed commit's CI runs; the tarball dry-run is local and always runs. Every check reports
// {status: "ok" | "action" | "skip" | "error", ...detail}. Exit 0 clean,
// 1 when any check is "action"/"error" or unchecked (skipped by
// --no-network) — run solo or `|| true` in parallel Bash batches.

import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {assertionChanges, TEST_PATHS, TEST_PLACES} from '../process-review/test-assertions.mjs';

if (!import.meta.main)
  throw new Error(
    'release-digest.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

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
    return {
      ok: true,
      out: execFileSync(cmd, argv, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024,
        ...opts
      }).trim()
    };
  } catch (err) {
    return {
      ok: false,
      out: (err.stdout ?? '').toString().trim(),
      err: (err.stderr ?? err.message ?? '').toString().trim(),
      status: err.status
    };
  }
};

const exists = rel => existsSync(path.join(root, rel));

// Installed version of a dependency, or null when it is not on disk.
const readInstalledVersion = name => {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'))
      .version;
  } catch {
    return null;
  }
};
const walk = (dir, files = []) => {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
};

const digest = {
  project: pkg.name,
  version: pkg.version,
  generated_at: new Date().toISOString(),
  checks: {}
};
const check = (name, value) => (digest.checks[name] = value);

// --- git: last released tag + changes since (input to the step-0 judgment) --
{
  // A package below the repository root releases as `<dir>-<version>` and answers for its own
  // directory alone; the root package never takes such a tag for its own.
  const prefix = run('git', ['rev-parse', '--show-prefix']).out;
  const scope = prefix ? ['--', '.'] : [];
  const tagFilter = prefix
    ? ['--match', `${path.basename(prefix)}-[0-9]*`]
    : ['--exclude', '*-[0-9]*'];
  const tag = run('git', ['describe', '--tags', '--abbrev=0', ...tagFilter]);
  const lastTag = tag.ok ? tag.out : null;
  const range = lastTag ? [`${lastTag}..HEAD`] : ['HEAD'];
  const log = run('git', ['log', '--format=%h\t%s', ...range, ...scope]);
  const commits = log.ok && log.out ? log.out.split('\n').map(line => line.replace('\t', ' ')) : [];
  const dirty = run('git', ['status', '--porcelain', ...scope]).out !== '';
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
    if (!dts.size)
      check('sidecars', {
        status: 'skip',
        reason: 'no .d.ts sidecars in src/ (not a sidecar project)'
      });
    else {
      const missingSidecar = [],
        missingDirective = [];
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
        js_files: js.length,
        paired: js.length - missingSidecar.length,
        missing_sidecar: missingSidecar,
        missing_directive: missingDirective,
        orphan_dts: orphans
      });
    }
  }
}

// --- retired artifacts (fleet bundle removable set — probe every item) ------
{
  const found = [
    '.windsurfrules',
    '.cursorrules',
    '.clinerules',
    '.github/COPILOT-INSTRUCTIONS.md',
    '.windsurf'
  ].filter(exists);
  const commandsDir = path.join(root, '.claude', 'commands');
  if (existsSync(commandsDir)) {
    const globalSkills = new Set(
      readdirSync(path.join(homedir(), '.claude', 'skills'), {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    );
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
  present: ['llms.txt', 'llms-full.txt', 'AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md'].filter(
    exists
  ),
  absent: ['llms.txt', 'llms-full.txt', 'AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md'].filter(
    f => !exists(f)
  )
});

// --- package.json: files hygiene, exports shape, description/keywords, bin --
{
  const FORBIDDEN = [
    'AGENTS.md',
    'ARCHITECTURE.md',
    'CLAUDE.md',
    'CODEBASE.md',
    '.cursorrules',
    '.windsurfrules',
    '.clinerules',
    '.claude',
    '.windsurf',
    '.github'
  ];
  const files = pkg.files ?? null;
  const forbidden = files?.filter(entry => FORBIDDEN.includes(entry.replace(/\/$/, ''))) ?? [];
  const missing = files ? ['llms.txt', 'llms-full.txt'].filter(f => !files.includes(f)) : [];
  check(
    'pkg_files',
    files
      ? {
          status: forbidden.length || missing.length ? 'action' : 'ok',
          missing_required: missing,
          forbidden_present: forbidden
        }
      : {status: 'action', reason: 'no files array — tarball contents are implicit'}
  );

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
        flagged.push({
          key,
          value,
          reason: 'transforming wildcard — importmap users must enumerate files'
        });
    } else if (value.endsWith('/index.js')) {
      if (!exists(value.replace(/^\.\//, '')))
        flagged.push({key, value, reason: 'barrel target missing'});
    } else if (key !== '.' && !key.endsWith('.js') && value.endsWith('.js')) {
      flagged.push({key, value, reason: 'file-shape substitution (extension added)'});
    }
  };
  if (pkg.exports) for (const [key, value] of Object.entries(pkg.exports)) inspect(key, value);
  check(
    'pkg_exports',
    pkg.exports
      ? {status: flagged.length ? 'action' : 'ok', flagged}
      : {status: 'skip', reason: 'no exports map'}
  );

  // repository / homepage / bugs are what npm renders as the links back to the
  // project; without repository the package page has no source link at all, and
  // npm provenance has nothing to attest against. Measured 2026-08-20 across the
  // fleet: 34/35 published repos carry all three — more universal than `funding`
  // (30/35), which is already a bundle slice. invariants-sidecar shipped 0.0.1
  // and 0.1.0 without them precisely because this check looked only at
  // description/keywords; a consumer found it, not the release check.
  {
    const meta = {
      description_present: !!pkg.description,
      keywords_present: !!pkg.keywords?.length,
      repository_present: !!pkg.repository,
      homepage_present: !!pkg.homepage,
      bugs_present: !!pkg.bugs,
      funding_present: !!pkg.funding
    };
    const absent = Object.entries(meta)
      .filter(([, present]) => !present)
      .map(([key]) => key.replace(/_present$/, ''));
    check('pkg_meta', {status: absent.length ? 'action' : 'ok', ...meta, absent});
  }

  const bins = typeof pkg.bin === 'string' ? {[pkg.name]: pkg.bin} : (pkg.bin ?? {});
  const modes = Object.values(bins).map(target => {
    const ls = run('git', ['ls-files', '-s', target]);
    const mode = ls.out.split(' ')[0] || null;
    return {target, mode, executable: mode === '100755'};
  });
  check(
    'bin_modes',
    Object.keys(bins).length
      ? {status: 'ok', note: 'tidy, not load-bearing — npm sets the bit on install', targets: modes}
      : {status: 'skip', reason: 'no bin'}
  );
}

// --- LICENSE copyright year covers the current year -------------------------
{
  if (!exists('LICENSE')) check('license_year', {status: 'action', reason: 'no LICENSE file'});
  else {
    const line =
      readFileSync(path.join(root, 'LICENSE'), 'utf8')
        .split('\n')
        .find(l => /copyright/i.test(l)) ?? '';
    const years = [...line.matchAll(/\d{4}/g)].map(m => +m[0]);
    const covered = years.length > 0 && Math.max(...years) >= new Date().getFullYear();
    check('license_year', {
      status: covered ? 'ok' : 'action',
      line: line.trim(),
      spdx: pkg.license ?? null
    });
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
      note: staleSources.length
        ? 'regenerate: npx -y wiki-search-index@latest --wiki . --repo OWNER/REPO'
        : undefined,
      newer_than_index: staleSources
    });
  } else
    check('wiki_search_index', {
      status: 'skip',
      reason: wikiDir ? 'no search-index.json' : 'no wiki'
    });
}

// --- dependency freshness (bump EVERYTHING reported, majors included) -------
//
// Two independent staleness mechanisms, both reported here (see the vault's
// topics/dep-version-freshness):
//   installed_behind      — npm outdated's whole remit: the resolved tree lags.
//   declared_floor_behind — the manifest range's floor lags while the install
//                           is already current. npm outdated compares INSTALLED
//                           against the registry and never looks at the declared
//                           range, so this class is invisible to it.
// The floor pass costs no extra registry calls: npm outdated stays silent about
// a package exactly when current === wanted === latest, so for anything it did
// not report, latest is the installed version.
{
  if (noNetwork) check('deps_outdated', {status: 'skip', reason: '--no-network'});
  else {
    const outdated = run('npm', ['outdated', '--json']);
    let parsed = null;
    try {
      parsed = JSON.parse(outdated.out || '{}');
    } catch {}
    if (parsed === null)
      check('deps_outdated', {
        status: 'error',
        message: outdated.err?.slice(0, 300) ?? 'unparseable npm outdated output'
      });
    else {
      const dev = new Set(Object.keys(pkg.devDependencies ?? {}));
      const declared = {...pkg.dependencies, ...pkg.devDependencies};
      const items = Object.entries(parsed).map(([name, info]) => ({
        name,
        declared: declared[name] ?? null,
        current: info.current,
        wanted: info.wanted,
        latest: info.latest,
        dev: dev.has(name),
        major: info.latest?.split('.')[0] !== info.current?.split('.')[0],
        reason: 'installed_behind'
      }));

      // Only the range forms the fleet actually writes. Anything else — a URL,
      // a tag, a disjunction, a bare `*` — yields null: unknown, not "current",
      // since guessing would report a stale floor as fresh.
      const floorOf = range =>
        /^[\^~]?(\d+\.\d+\.\d+)$/.exec(String(range ?? '').trim())?.[1] ?? null;
      const reported = new Set(Object.keys(parsed));
      for (const [name, range] of Object.entries(declared)) {
        if (reported.has(name)) continue; // already an item, on the stronger reason
        const floor = floorOf(range);
        if (!floor) continue;
        // Silent in npm outdated ⇒ current === wanted === latest, so the
        // installed version IS latest. Read it rather than re-querying.
        const installed = readInstalledVersion(name);
        if (!installed || floor === installed) continue;
        items.push({
          name,
          declared: range,
          current: installed,
          wanted: installed,
          latest: installed,
          dev: dev.has(name),
          major: installed.split('.')[0] !== floor.split('.')[0],
          reason: 'declared_floor_behind'
        });
      }

      check('deps_outdated', {status: items.length ? 'action' : 'ok', count: items.length, items});
    }
  }
}

// --- lockfile version sync (regen is unconditional after edits anyway) ------
{
  if (!exists('package-lock.json'))
    check('lockfile', {status: 'action', reason: 'no package-lock.json'});
  else {
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    const rootVersion = lock.version,
      selfVersion = lock.packages?.['']?.version;
    const inSync =
      rootVersion === pkg.version && (selfVersion === undefined || selfVersion === pkg.version);
    check('lockfile', {
      status: inSync ? 'ok' : 'action',
      pkg_version: pkg.version,
      lock_version: rootVersion,
      lock_self_version: selfVersion ?? null
    });
  }
}

// --- test matrix: which gates exist (running them stays with the agent) -----
{
  const scripts = Object.keys(pkg.scripts ?? {});
  check('test_matrix', {
    status: scripts.includes('test') ? 'ok' : 'action',
    gates: ['test', 'test:bun', 'test:deno', 'test:browser', 'ts-check', 'js-check', 'lint'].filter(
      s => scripts.includes(s)
    )
  });
}

// --- CI: what a push to this branch fires, and what CI says of what is pushed --
// The `on:` block alone, read by indentation: the digest carries no YAML parser.
const readOn = text => {
  const words = value =>
    value
      .replace(/\s#.*$/, '')
      .replace(/[[\]'"]/g, '')
      .split(',')
      .map(word => word.trim())
      .filter(Boolean);
  const lines = text.split('\n');
  const at = lines.findIndex(line => /^["']?on["']?\s*:/.test(line));
  if (at < 0) return {};
  const inline = words(lines[at].slice(lines[at].indexOf(':') + 1));
  if (inline.length) return Object.fromEntries(inline.map(event => [event, {}]));
  const on = {};
  let eventIndent = 0,
    event = null,
    key = null;
  for (const line of lines.slice(at + 1)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    if (!indent) break;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item) {
      if (event && key) on[event][key].push(...words(item[1]));
      continue;
    }
    const entry = line.match(/^\s*([\w-]+)\s*:(.*)$/);
    if (!entry) continue;
    eventIndent ||= indent;
    if (indent === eventIndent) {
      event = entry[1];
      on[event] = {};
      key = null;
    } else {
      key = entry[1];
      on[event][key] = words(entry[2]);
    }
  }
  return on;
};

const pushFires = (push, branch) => {
  if (!push) return false;
  // A `*` in a filter counts as a match: the fleet writes `*`, `**`, or a plain name.
  const names = list => list.includes(branch) || list.some(name => name.includes('*'));
  if (push.branches) return names(push.branches);
  if (push['branches-ignore']) return !push['branches-ignore'].includes(branch);
  return !push.tags && !push['tags-ignore'];
};

const readRuns = sha => {
  const list = run('gh', [
    'run',
    'list',
    '--commit',
    sha,
    '--json',
    'databaseId,workflowName,status,conclusion,url'
  ]);
  if (!list.ok) return {message: (list.err || list.out).slice(0, 300)};
  const green = new Set(['success', 'skipped', 'neutral']);
  const isGreen = item => green.has(item.conclusion);
  const runs = JSON.parse(list.out);
  const notGreen = [];
  for (const item of runs.filter(item => !isGreen(item))) {
    const view = run('gh', ['run', 'view', String(item.databaseId), '--json', 'jobs']);
    if (!view.ok) return {message: (view.err || view.out).slice(0, 300)};
    notGreen.push({
      workflow: item.workflowName,
      status: item.status,
      conclusion: item.conclusion,
      url: item.url,
      jobs: JSON.parse(view.out)
        .jobs.filter(job => !isGreen(job))
        .map(job => `${job.name}: ${job.status === 'completed' ? job.conclusion : job.status}`)
    });
  }
  return {
    runs: runs.map(({workflowName, status, conclusion, url}) => ({
      workflow: workflowName,
      status,
      conclusion,
      url
    })),
    not_green: notGreen,
    pending: runs.some(item => item.status !== 'completed'),
    no_runs: runs.length === 0
  };
};

{
  const top = run('git', ['rev-parse', '--show-toplevel']).out;
  const dir = path.join(top || root, '.github/workflows');
  const files = existsSync(dir) ? readdirSync(dir).filter(name => /\.ya?ml$/.test(name)) : [];
  const url = run('git', ['remote', 'get-url', 'origin']).out;
  const repo = url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/)?.[1] ?? null;
  if (!files.length) check('ci', {status: 'skip', reason: 'no workflows'});
  else if (!repo) check('ci', {status: 'skip', reason: 'no GitHub remote'});
  else {
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out;
    const workflows = files.sort().map(file => {
      const on = readOn(readFileSync(path.join(dir, file), 'utf8'));
      return {
        file,
        on_push: pushFires(on.push, branch),
        path_filter: Boolean(on.push?.paths || on.push?.['paths-ignore']),
        dispatch: 'workflow_dispatch' in on
      };
    });
    const fired = workflows.filter(workflow => workflow.on_push);
    const ci = {
      repo,
      branch,
      workflows,
      wait_commands: fired.map(
        ({file}) =>
          `gh run watch --exit-status --repo ${repo} "$(gh run list --repo ${repo} --commit "$(git rev-parse HEAD)" --workflow ${file} --json databaseId --jq '.[0].databaseId')"`
      ),
      dispatch_commands: workflows
        .filter(workflow => workflow.dispatch)
        .map(({file}) => `gh workflow run ${file} --repo ${repo} --ref ${branch}`),
      head: null
    };
    const upstream = run('git', ['rev-parse', '@{u}']);
    if (noNetwork) check('ci', {status: 'skip', reason: '--no-network', ...ci});
    else if (!upstream.ok) check('ci', {status: 'ok', ...ci});
    else {
      const read = readRuns(upstream.out);
      if (read.message) check('ci', {status: 'error', message: read.message, ...ci});
      else {
        const unpushed = Number(run('git', ['rev-list', '--count', '@{u}..HEAD']).out);
        const missing = read.no_runs && fired.length > 0;
        check('ci', {
          status: read.not_green.length || missing ? 'action' : 'ok',
          ...ci,
          head: {sha: upstream.out, unpushed, ...read}
        });
      }
    }
  }
}

// --- what changed for users since the last tag --------------------------------
// Each list is for the agent to judge, so none of it stops a clean digest: a README may
// name a theme and not its items, and an assertion can change with no behavior changing.
const TYPE_PATHS = [
  ':(glob)**/*.d.ts',
  ...TEST_PLACES.map(place => `:(exclude,glob)**/${place}/**`)
];
const DIFF_FLAGS = [
  '--relative',
  '--no-color',
  '--unified=0',
  '-M',
  '--src-prefix=a/',
  '--dst-prefix=b/'
];

const changedLines = args => {
  const lines = [];
  let from = null,
    to = null;
  for (const line of run('git', args).out.split('\n')) {
    const header = line.match(/^(---|\+\+\+) (?:[ab]\/(.*)|\/dev\/null)$/);
    if (header) {
      if (header[1] === '---') from = header[2] ?? null;
      else to = header[2] ?? null;
    } else if (line.startsWith('+')) lines.push({added: true, file: to, text: line.slice(1)});
    else if (line.startsWith('-')) lines.push({added: false, file: from, text: line.slice(1)});
  }
  return lines;
};

const declared = text => {
  const line = text.trim();
  if (line.endsWith(',')) return [];
  const list = line.match(/^export\s+(?:type\s+)?\{([^}]*)\}|^export\{([^}]*)\}/);
  if (list)
    return (list[1] ?? list[2])
      .split(',')
      .map(part =>
        part
          .trim()
          .split(/\s+as\s+/)
          .pop()
      )
      .filter(Boolean);
  const named = line.match(
    /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|const|let|var|enum|namespace|module)\s+([\w$]+)/
  );
  if (named) return [named[1]];
  const member = line.match(
    /^(?:(?:public|protected|readonly|static|abstract|async|get|set)\s+)*([\w$]+)\??\s*(?:<[^>]*>)?\s*[(:]/
  );
  return member ? [member[1]] : [];
};

const namesOn = (lines, added) =>
  new Set(lines.filter(line => line.added === added).flatMap(line => declared(line.text)));

// The new release's text in both tiers: its section in the wiki, its bullet in the README.
const notesFor = version => {
  const named = new RegExp(`(?:^|[^\\d.])${version.replaceAll('.', '\\.')}(?![\\d.])`);
  const wiki = ['wiki', 'external_wiki'].find(exists);
  const read = rel => (exists(rel) ? readFileSync(path.join(root, rel), 'utf8').split('\n') : []);
  const kept = [];
  for (const rel of [...(wiki ? [`${wiki}/Release-notes.md`] : []), 'README.md']) {
    let level = 0;
    for (const line of read(rel)) {
      const heading = line.match(/^(#{1,6})\s/)?.[1].length ?? 0;
      if (heading && level && heading <= level) level = 0;
      if (heading && !level && named.test(line)) level = heading;
      if (level || (/^\s*[-*]\s/.test(line) && named.test(line))) kept.push(line);
    }
  }
  return new Set(kept.join('\n').match(/[\w$]+/g) ?? []);
};

{
  const tag = digest.checks.git.last_tag;
  if (!tag) {
    check('type_surface', {status: 'skip', reason: 'no tag'});
    check('test_assertions', {status: 'skip', reason: 'no tag'});
  } else {
    const typeLines = changedLines(['diff', ...DIFF_FLAGS, tag, '--', ...TYPE_PATHS]);
    const plus = namesOn(typeLines, true);
    const minus = namesOn(typeLines, false);
    const added = [...plus].filter(name => !minus.has(name));
    const changed = [...plus].filter(name => minus.has(name));
    const removed = [...minus].filter(name => !plus.has(name));
    const notes = tag.endsWith(pkg.version) ? new Set() : notesFor(pkg.version);
    const unmentioned = [...plus].filter(name => !notes.has(name));
    const fixes = [];
    const log = run('git', ['log', '--format=%h%x09%s', `${tag}..HEAD`, '--', ...TYPE_PATHS]).out;
    for (const entry of log ? log.split('\n') : []) {
      const [sha, subject] = entry.split('\t');
      if (!/\b(?:bug)?fix/i.test(subject)) continue;
      const lines = changedLines(['show', '--format=', ...DIFF_FLAGS, sha, '--', ...TYPE_PATHS]);
      const gone = namesOn(lines, false);
      const fresh = [...namesOn(lines, true)].filter(name => !gone.has(name));
      if (fresh.length) fixes.push({commit: sha, subject, added: fresh});
    }
    check('type_surface', {
      status: 'ok',
      review: Boolean(unmentioned.length || removed.length || fixes.length),
      added,
      changed,
      removed,
      unmentioned,
      fix_commits_adding_surface: fixes
    });

    const testLines = changedLines(['diff', ...DIFF_FLAGS, tag, '--', ...TEST_PATHS]);
    const {rewritten, added: addedCount} = assertionChanges(testLines);
    const byFile = new Map();
    for (const {file, text} of rewritten.slice(0, 30))
      byFile.set(file, [...(byFile.get(file) ?? []), text]);
    check('test_assertions', {
      status: 'ok',
      review: rewritten.length > 0,
      removed_count: rewritten.length,
      added_count: addedCount,
      removed: [...byFile].map(([file, lines]) => ({file, lines}))
    });
  }
}

// --- the paths a wiki page's code names ----------------------------------------
// For the agent to judge: a page can show a path in the reader's own project, as in `tests/test-foo.js`.
const wikiCode = text => {
  const code = [];
  let fence = null;
  text.split('\n').forEach((raw, index) => {
    const mark = raw.trim().match(/^(`{3,}|~{3,})/)?.[1];
    const line = index + 1;
    if (fence) {
      if (mark?.[0] === fence[0] && mark.length >= fence.length) fence = null;
      else code.push({line, text: raw});
    } else if (mark) fence = mark;
    else for (const span of raw.matchAll(/`([^`]+)`/g)) code.push({line, text: span[1]});
  });
  return code;
};

{
  const wiki = ['wiki', 'external_wiki'].find(exists);
  const pages = wiki
    ? readdirSync(path.join(root, wiki)).filter(
        // Release notes and an old version's pages are history.
        name => name.endsWith('.md') && !/^(?:release-notes|v\d|.*\d+\.\d+\.x)/i.test(name)
      )
    : [];
  if (!wiki) check('wiki_paths', {status: 'skip', reason: 'no wiki'});
  else if (!pages.length) check('wiki_paths', {status: 'skip', reason: 'no wiki pages'});
  else {
    const files = run('git', ['ls-files']).out.split('\n');
    const tracked = new Set(files);
    const tops = new Set(files.filter(file => file.includes('/')).map(file => file.split('/')[0]));
    const SUFFIXES = ['.js', '.mjs', '.cjs', '.ts', '.d.ts', '.json'];
    const resolves = name => exists(name) || SUFFIXES.some(suffix => exists(name + suffix));
    const unresolved = [];
    const partial = [];
    let read = 0;
    for (const page of pages.sort()) {
      const named = new Map();
      for (const {line, text} of wikiCode(readFileSync(path.join(root, wiki, page), 'utf8'))) {
        for (const [, token] of text.matchAll(
          /(?:^|[\s'"`(=:,[])((?:\.\/)?[\w.@*<>${}-]+(?:\/[\w.@*<>${},-]+)+\/?)/g
        )) {
          const name = token.replace(/^\.\//, '').replace(/[/.]+$/, '');
          if (/[*<>${}]/.test(name) || !tops.has(name.split('/')[0])) continue;
          ++read;
          if (!resolves(name)) unresolved.push({page, line, path: name});
          else if (tracked.has(name)) {
            const dir = path.posix.dirname(name);
            named.set(dir, (named.get(dir) ?? new Set()).add(name));
          }
        }
      }
      for (const [dir, names] of named) {
        const kids = files.filter(file => path.posix.dirname(file) === dir);
        if (names.size >= 3 && names.size < kids.length)
          partial.push({
            page,
            dir,
            named: names.size,
            of: kids.length,
            missing: kids.filter(file => !names.has(file))
          });
      }
    }
    check('wiki_paths', {
      status: 'ok',
      review: unresolved.length + partial.length > 0,
      pages_read: pages.length,
      paths_read: read,
      unresolved_count: unresolved.length,
      unresolved: unresolved.slice(0, 30),
      partial_listings: partial
    });
  }
}

// --- tarball contents (npm pack --dry-run is the ground truth) --------------
{
  const pack = run('npm', ['pack', '--dry-run', '--json']);
  let files = null;
  try {
    files = JSON.parse(pack.out)[0].files.map(f => f.path);
  } catch {}
  if (!files)
    check('tarball', {
      status: 'error',
      message: pack.err?.slice(0, 300) ?? 'unparseable npm pack output'
    });
  else {
    const FORBIDDEN_FILES = [
      'AGENTS.md',
      'ARCHITECTURE.md',
      'CLAUDE.md',
      'CODEBASE.md',
      '.cursorrules',
      '.windsurfrules',
      '.clinerules'
    ];
    const FORBIDDEN_DIRS = ['.claude/', '.windsurf/', '.github/'];
    const missing = ['llms.txt', 'llms-full.txt', 'README.md', 'LICENSE'].filter(
      f => !files.includes(f)
    );
    const forbidden = files.filter(
      f => FORBIDDEN_FILES.includes(f) || FORBIDDEN_DIRS.some(d => f.startsWith(d))
    );
    check('tarball', {
      status: missing.length || forbidden.length ? 'action' : 'ok',
      file_count: files.length,
      missing_required: missing,
      forbidden_present: forbidden,
      has_src: !existsSync(path.join(root, 'src')) || files.some(f => f.startsWith('src/'))
    });
  }
}

// --- project-specific extensions ---------------------------------------------
check('project_specific', {
  status: 'ok',
  agents_releasing_section:
    exists('AGENTS.md') &&
    /^#{1,3}\s.*releasing/im.test(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')),
  release_check_local: exists('.claude/release-check.local.md')
});

const actions = Object.entries(digest.checks).filter(
  ([, c]) => c.status === 'action' || c.status === 'error'
);
// A check the flag skipped is not a pass: an offline digest once carried a
// release past the dependency sweep (apodict 0.8.0, 2026-10-06).
const unchecked = Object.entries(digest.checks)
  .filter(([, c]) => c.status === 'skip' && c.reason === '--no-network')
  .map(([name]) => name);
digest.summary = {
  total: Object.keys(digest.checks).length,
  action: actions.map(([name]) => name),
  unchecked,
  review: Object.entries(digest.checks)
    .filter(([, c]) => c.review)
    .map(([name]) => name),
  clean: actions.length === 0 && unchecked.length === 0
};

console.log(JSON.stringify(digest, null, 2));
// process.exit drops what a pipe has not taken yet, so a digest past its 64 KB loses its tail.
if (actions.length || unchecked.length) process.exitCode = 1;
