#!/usr/bin/env node

// make-migration — generates the fleet package-migration script from the
// canonical template (skills-restructuring program, filed 2026-07-18);
// replaces hand-adapting the ~130-line bash block that lived in SKILL.md.
// The template is the sidecar migrate.sh.tmpl (__TOKEN__ placeholders —
// kept out of JS so bash ${...} needs no escaping). Emits the native→brew
// direction (the recorded precedents: imagemagick 293b54b, exiftool
// 9b4fad5); reverse (brew→native) has no precedent-tested template —
// refuse and hand-adapt per SKILL.md when it first comes up.
//
//   make-migration.mjs --tool=exiftool --brew=exiftool \
//     [--apt=libimage-exiftool-perl] [--dnf=perl-Image-ExifTool] \
//     [--sha=<chezmoi commit>] [--out=/tmp/<tool>-migrate.sh]
//
// The output lands chmod+x and bash -n checked at the documented fleet
// path /tmp/<tool>-migrate.sh (deliberately fixed — it's the path the
// user runs on every host). Exit 0 ok · 1 bash -n failed · 2 usage.

import {execFileSync} from 'node:child_process';
import {chmodSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const opts = {
  tool: null,
  brew: null,
  apt: null,
  dnf: null,
  sha: '<pending>',
  out: null,
  reverse: false
};
for (const arg of process.argv.slice(2)) {
  const [flag, value] = arg.includes('=')
    ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    : [arg, null];
  switch (flag) {
    case '--tool':
      opts.tool = value;
      break;
    case '--brew':
      opts.brew = value;
      break;
    case '--apt':
      opts.apt = value;
      break;
    case '--dnf':
      opts.dnf = value;
      break;
    case '--sha':
      opts.sha = value;
      break;
    case '--out':
      opts.out = value;
      break;
    case '--reverse':
      opts.reverse = true;
      break;
    case '--help':
    case '-h':
      console.log(
        'Usage: make-migration.mjs --tool=T --brew=B [--apt=A] [--dnf=D] [--sha=SHA] [--out=FILE]'
      );
      process.exit(0);
    default:
      fail(2, `unknown option: ${arg}`);
  }
}
if (opts.reverse)
  fail(
    2,
    'reverse (brew→native) has no precedent-tested template — adapt by hand per SKILL.md § Reverse direction'
  );
if (!opts.tool || !opts.brew) fail(2, '--tool and --brew are required');
if (!opts.apt && !opts.dnf)
  fail(2, 'at least one of --apt / --dnf is required (the native package being replaced)');
const out = opts.out ?? `/tmp/${opts.tool}-migrate.sh`;

const template = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrate.sh.tmpl'),
  'utf8'
);
const script = template
  .replaceAll('__TOOL__', opts.tool)
  .replaceAll('__BREW_PKG__', opts.brew)
  .replaceAll('__APT_PKG__', opts.apt ?? '')
  .replaceAll('__DNF_PKG__', opts.dnf ?? '')
  .replaceAll('__SHA__', opts.sha);

writeFileSync(out, script);
chmodSync(out, 0o755);
try {
  execFileSync('bash', ['-n', out], {stdio: ['ignore', 'pipe', 'pipe']});
} catch (err) {
  fail(1, `bash -n failed on ${out}:\n${err.stderr}`);
}
console.log(
  `${out} — generated, chmod +x, bash -n clean. Review it, then: playbash put linux,mac --self ${out} ${out}`
);
