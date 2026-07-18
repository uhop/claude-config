#!/usr/bin/env node

// repo-facts — mechanical fact collector for /fleet-fix (skills-restructuring
// program, filed 2026-07-18). Emits FACTS, never verdicts: the fleet standard
// lives in the vault bundle (topics/fleet-conventions-bundle), read fresh
// each audit, and judgment of compliance stays with the agent — a status
// field here would be slice content hardcoded into the skill, which its
// design forbids. Any checklist item this sheet doesn't cover still gets
// probed by hand; the sheet is an accelerator, not the checklist.
//
//   repo-facts.mjs [project-dir]            # full fact sheet (JSON)
//   repo-facts.mjs [project-dir] --context  # just the project-context block
//                                           # (shared detector for wiki-organize,
//                                           # document-wiki-page, ai-docs-update)
//
// Exit 0 (facts are facts) · 2 usage. Read-only; no network.

import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const contextOnly = args.includes('--context');
const root = path.resolve(args.find(a => !a.startsWith('--')) ?? '.');
if (!existsSync(path.join(root, 'package.json'))) {
  console.error(`no package.json in ${root}`);
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const run = (cmd, argv) => {
  try {
    return execFileSync(cmd, argv, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  } catch {
    return null;
  }
};
const exists = rel => existsSync(path.join(root, rel));
const read = rel => (exists(rel) ? readFileSync(path.join(root, rel), 'utf8') : null);
const list = rel => (exists(rel) ? readdirSync(path.join(root, rel)) : []);

// --- context (the shared detector) -------------------------------------------
const rawRepoUrl = pkg.repository?.url ?? (typeof pkg.repository === 'string' ? pkg.repository : null)
  ?? run('git', ['remote', 'get-url', 'origin']);
const ownerRepo = rawRepoUrl
  ?.replace(/^git\+/, '').replace(/\.git$/, '')
  .match(/(?:github\.com[/:])([^/]+\/[^/]+?)$/)?.[1] ?? null;
const defaultBranch = run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '')
  ?? run('git', ['symbolic-ref', '--short', 'HEAD']);
const wikiDir = ['wiki', 'external_wiki'].find(exists) ?? null;

const context = {
  name: pkg.name ?? null, version: pkg.version ?? null,
  owner_repo: ownerRepo, repo_url_raw: rawRepoUrl ?? null,
  default_branch: defaultBranch ?? null, wiki_dir: wikiDir,
  license: pkg.license ?? null, private: pkg.private ?? false
};
if (contextOnly) {
  console.log(JSON.stringify(context, null, 2));
  process.exit(0);
}

const facts = {generated_at: new Date().toISOString(), root, context};

// --- convention-relevant file inventory ---------------------------------------
const INVENTORY = ['AGENTS.md', 'CLAUDE.md', 'ARCHITECTURE.md', 'llms.txt', 'llms-full.txt',
  'README.md', 'LICENSE', 'CONTRIBUTING.md', '.editorconfig', '.prettierrc', '.prettierignore',
  '.gitmodules', 'tsconfig.check.json', 'tsconfig.json',
  '.github/FUNDING.yml', '.github/copilot-instructions.md', '.github/dependabot.yml',
  '.claude/settings.local.json'];
facts.files = {
  present: INVENTORY.filter(exists),
  absent: INVENTORY.filter(f => !exists(f)),
  prettierrc_variants: list('.').filter(f => f.startsWith('.prettierrc'))
};

// --- retired artifacts (probe every item — the 2026-07-17 miss class) --------
{
  const found = ['.windsurfrules', '.cursorrules', '.clinerules', '.github/COPILOT-INSTRUCTIONS.md', '.windsurf']
    .filter(exists);
  const globalSkills = new Set(list(path.relative(root, path.join(homedir(), '.claude', 'skills'))).length
    ? readdirSync(path.join(homedir(), '.claude', 'skills')) : []);
  for (const file of list('.claude/commands'))
    if (file.endsWith('.md') && globalSkills.has(file.replace(/\.md$/, '')))
      found.push(`.claude/commands/${file} (copy of promoted global skill)`);
  facts.retired_artifacts_found = found;
}

// --- package.json surfaces ----------------------------------------------------
{
  const bins = typeof pkg.bin === 'string' ? {[pkg.name]: pkg.bin} : pkg.bin ?? {};
  facts.pkg = {
    files: pkg.files ?? null,
    exports: pkg.exports ?? null,
    scripts: Object.keys(pkg.scripts ?? {}),
    description_present: !!pkg.description, keywords_count: pkg.keywords?.length ?? 0,
    funding_present: !!pkg.funding,
    llms_fields: ['llms', 'llmsFull'].filter(f => f in pkg),
    engines: pkg.engines ?? null,
    dependencies: Object.keys(pkg.dependencies ?? {}),
    devDependencies_count: Object.keys(pkg.devDependencies ?? {}).length,
    bin_targets: Object.values(bins).map(target => ({
      target, git_mode: run('git', ['ls-files', '-s', target])?.split(' ')[0] ?? null
    }))
  };
}

// --- src sidecar pairing --------------------------------------------------------
{
  const srcDir = path.join(root, 'src');
  if (!existsSync(srcDir)) facts.sidecars = {src_dir: false};
  else {
    const files = [];
    (function walk(dir) {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else files.push(path.relative(root, p));
      }
    })(srcDir);
    const js = files.filter(f => f.endsWith('.js'));
    const dts = new Set(files.filter(f => f.endsWith('.d.ts')));
    const missingSidecar = js.filter(f => !dts.has(f.replace(/\.js$/, '.d.ts')));
    const missingDirective = js.filter(f => dts.has(f.replace(/\.js$/, '.d.ts'))
      && !readFileSync(path.join(root, f), 'utf8').split('\n', 3).join('\n').includes('@ts-self-types='));
    const jsdocInJs = js.filter(f => /\/\*\*/.test(readFileSync(path.join(root, f), 'utf8')));
    facts.sidecars = {src_dir: true, js_files: js.length, dts_files: dts.size,
      missing_sidecar: missingSidecar, missing_directive: missingDirective,
      js_with_jsdoc_blocks: jsdocInJs};
  }
}

// --- git: tags, submodules ------------------------------------------------------
facts.git = {
  recent_tags: run('git', ['for-each-ref', '--sort=-creatordate', '--count=5',
    '--format=%(refname:short)', 'refs/tags'])?.split('\n').filter(Boolean) ?? [],
  submodules: [...(read('.gitmodules') ?? '').matchAll(/path\s*=\s*(.+)\n\s*url\s*=\s*(.+)/g)]
    .map(m => ({path: m[1].trim(), url: m[2].trim()}))
};

// --- CI workflows ---------------------------------------------------------------
facts.workflows = list('.github/workflows').filter(f => /\.ya?ml$/.test(f)).map(file => {
  const text = read(`.github/workflows/${file}`) ?? '';
  return {
    file,
    has_workflow_level_permissions: /^permissions:/m.test(text),
    job_level_permissions: (text.match(/^\s+permissions:/gm) ?? []).length,
    node_versions: text.match(/node-version[^\n[]*(\[[^\]]*\])/)?.[1] ?? null,
    pull_request_branches: text.match(/pull_request:\s*\n\s*branches:\s*(\[[^\]]*\])/)?.[1] ?? null
  };
});

// --- dependabot (regex-level facts over the YAML) --------------------------------
{
  const text = read('.github/dependabot.yml');
  facts.dependabot = text === null ? {present: false} : {
    present: true,
    ecosystems: [...text.matchAll(/package-ecosystem:\s*["']?([\w-]+)/g)].map(m => m[1]),
    has_wildcard_groups: /patterns:\s*\n?\s*-?\s*["']\*["']|patterns:\s*\[\s*["']\*["']\s*\]/.test(text),
    versioning_strategy: text.match(/versioning-strategy:\s*["']?([\w-]+)/)?.[1] ?? null,
    schedules: [...text.matchAll(/interval:\s*["']?(\w+)/g)].map(m => m[1])
  };
}

// --- README surfaces --------------------------------------------------------------
{
  const text = read('README.md') ?? '';
  facts.readme = {
    h1_has_shield: /^#\s.*(\[!\[|\!\[)/m.test(text.split('\n').slice(0, 5).join('\n'))
      || /^\[!\[.*badge/m.test(text),
    npm_shield_referenced: /img\.shields\.io\/npm\/v\//.test(text),
    has_release_section: /^#{1,3}\s.*release/im.test(text),
    links_wiki: ownerRepo ? text.includes(`${ownerRepo}/wiki`) : /\/wiki\b/.test(text)
  };
}

// --- wiki surfaces -----------------------------------------------------------------
if (wikiDir) {
  const home = read(`${wikiDir}/Home.md`) ?? '';
  facts.wiki = {
    dir: wikiDir,
    home_present: home !== '',
    home_title: home.match(/^#\s+(.+)$/m)?.[1] ?? null,
    home_has_search_section: /^#{1,2}\s+Search\b/m.test(home),
    home_has_documentation_section: /^#{1,2}\s+Documentation\b/m.test(home),
    home_ci_shield: /actions\/workflows\/.*badge\.svg/.test(home),
    home_npm_shield: /img\.shields\.io\/npm\/v\//.test(home),
    sidebar_present: exists(`${wikiDir}/_Sidebar.md`),
    search_index_present: exists(`${wikiDir}/search-index.json`),
    release_notes_present: exists(`${wikiDir}/Release-notes.md`),
    page_count: list(wikiDir).filter(f => f.endsWith('.md')).length
  };
  if (facts.wiki.search_index_present) {
    const indexMtime = statSync(path.join(root, wikiDir, 'search-index.json')).mtimeMs;
    facts.wiki.pages_newer_than_search_index = list(wikiDir)
      .filter(f => f.endsWith('.md') && statSync(path.join(root, wikiDir, f)).mtimeMs > indexMtime);
  }
} else facts.wiki = {dir: null};

// --- LICENSE file ------------------------------------------------------------------
{
  const text = read('LICENSE');
  facts.license_file = text === null ? {present: false} : {
    present: true,
    first_line: text.split('\n')[0].trim(),
    copyright_line: text.split('\n').find(l => /copyright/i.test(l))?.trim() ?? null,
    line_count: text.split('\n').length
  };
}

console.log(JSON.stringify(facts, null, 2));
