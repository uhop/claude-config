#!/usr/bin/env node
// install.mjs — symlink claude-config files into ~/.claude/
// Default: dry-run. Use --apply to execute. Safe to re-run.

import {readdir, mkdir, symlink, lstat, unlink, readlink} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';

if (!import.meta.main)
  throw new Error(
    'install.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const SOURCE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(homedir(), '.claude');
const INSTALL = ['CLAUDE.md', 'settings.json', 'commands', 'skills', 'hooks'];

const APPLY = process.argv.includes('--apply');
const HELP = process.argv.includes('--help') || process.argv.includes('-h');

if (HELP) {
  console.log(`Usage: install.mjs [--apply]

  Symlink claude-config files into ~/.claude/.
  Default mode: dry-run. Pass --apply to execute.
  Idempotent — safe to re-run after a 'git pull'.`);
  process.exit(0);
}

const exists = async path => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const ensureDir = async path => {
  if (APPLY) await mkdir(path, {recursive: true, mode: 0o700});
};

const planFile = async (src, dst) => {
  if (!(await exists(dst))) return {action: 'link', src, dst};
  const stat = await lstat(dst);
  if (stat.isSymbolicLink()) {
    const current = await readlink(dst);
    if (current === src) return {action: 'unchanged', src, dst};
    return {action: 'relink', src, dst, current};
  }
  if (stat.isFile()) return {action: 'replace-file', src, dst};
  return {action: 'skip-unknown', src, dst};
};

const installFile = async (src, dst) => {
  const plan = await planFile(src, dst);
  if (!APPLY || plan.action === 'unchanged' || plan.action === 'skip-unknown') return plan;
  if (await exists(dst)) await unlink(dst);
  await symlink(src, dst);
  return plan;
};

const walk = async (srcDir, dstDir, results) => {
  await ensureDir(dstDir);
  const entries = await readdir(srcDir, {withFileTypes: true});
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await walk(src, dst, results);
    } else if (entry.isFile()) {
      results.push(await installFile(src, dst));
    }
  }
};

const main = async () => {
  console.log(`source: ${SOURCE}`);
  console.log(`target: ${TARGET}`);
  console.log(`mode:   ${APPLY ? 'APPLY' : 'dry-run'}`);
  console.log();

  await ensureDir(TARGET);

  const results = [];
  for (const name of INSTALL) {
    const src = join(SOURCE, name);
    const dst = join(TARGET, name);
    if (!(await exists(src))) {
      console.warn(`skip: ${name} (missing in repo)`);
      continue;
    }
    const stat = await lstat(src);
    if (stat.isDirectory()) {
      await walk(src, dst, results);
    } else {
      results.push(await installFile(src, dst));
    }
  }

  const counts = {};
  for (const r of results) counts[r.action] = (counts[r.action] || 0) + 1;
  for (const [action, n] of Object.entries(counts).sort()) {
    console.log(`  ${action.padEnd(15)} ${n}`);
  }

  const changes = results.filter(
    r => r.action !== 'unchanged' && r.action !== 'skip-unknown'
  ).length;
  if (!APPLY && changes > 0) {
    console.log();
    console.log(`${changes} change(s) pending. Re-run with --apply to execute.`);
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
