#!/usr/bin/env node
// Validates internal links in a GitHub-wiki working copy.
//
// Usage: validate-wiki-links.mjs <wiki-dir> [page.md ...]
//   (default: every *.md under <wiki-dir>, .git/node_modules excluded)
//
// Findings (one line each, tab-separated):
//   MISSING  file:line  target   — no page resolves (flat namespace + dir-relative)
//   COLON    file:line  target   — bare colon-named destination: parses as a URI
//                                  scheme, GitHub strips the href (renders unlinked);
//                                  needs ./ prefix or %3A — see the vault note
//                                  topics/github-wiki-colon-page-links
//   ASSET    file:line  target   — relative asset (image/pdf) not found on disk
//
// Exit 0 clean, 1 on findings — run solo or guard with `|| true` in parallel batches.

import {readdirSync, readFileSync, statSync, existsSync} from 'node:fs';
import path from 'node:path';

const [root, ...only] = process.argv.slice(2);
if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
  console.error('usage: validate-wiki-links.mjs <wiki-dir> [page.md ...]');
  process.exit(2);
}

const SKIP_DIRS = new Set(['.git', 'node_modules']),
  EXTERNAL = new Set(['http', 'https', 'mailto', 'ftp', 'ftps']),
  ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf)$/i;

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.md')) pages.push(p);
  }
})(root);

// GitHub wiki namespace is flat: a bare target resolves by page name from any folder
const byName = new Set(pages.map(p => path.basename(p, '.md')));

const files = only.length ? only.map(f => path.resolve(root, f)) : pages;
const findings = [];
let checked = 0;

const decode = s => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

for (const file of files) {
  const rel = path.relative(root, file),
    dir = path.dirname(file);
  let fenced = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;
      const text = line.replace(/`[^`]*`/g, '``'),
        targets = [];
      // inline links: angle form first (paren-named pages), then naive
      for (const m of text.matchAll(/\]\(<([^>]+)>\)|\]\(([^)]+?)\)/g)) targets.push(m[1] ?? m[2]);
      const def = text.match(/^\s*\[[^\]]+\]:\s+(\S+)/); // reference-style definition
      if (def) targets.push(def[1]);

      for (let t of targets) {
        t = t.trim();
        if (!t || t.startsWith('#')) continue;
        ++checked;
        const scheme = t.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
        if (scheme) {
          if (EXTERNAL.has(scheme[1].toLowerCase())) continue;
          findings.push(`COLON\t${rel}:${i + 1}\t${t}`);
        }
        let target = decode(t.replace(/^\.\//, '')).replace(/#.*$/, '');
        if (!target) continue;
        if (ASSET_RE.test(target)) {
          if (!existsSync(path.resolve(dir, target)) && !existsSync(path.resolve(root, target)))
            findings.push(`ASSET\t${rel}:${i + 1}\t${t}`);
          continue;
        }
        if (!byName.has(path.basename(target)) && !existsSync(path.resolve(dir, target + '.md')))
          findings.push(`MISSING\t${rel}:${i + 1}\t${t}`);
      }
    });
}

if (findings.length) {
  console.log(findings.join('\n'));
  console.error(`${findings.length} finding(s) in ${checked} links across ${files.length} pages`);
  process.exit(1);
}
console.log(`OK: ${checked} links across ${files.length} pages`);
