// The vault project of a checkout. `hooks/lib/vault-project.sh` reads it the same way for the hooks.

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';

/** A linked worktree's folder says nothing of its project, so its main checkout stands for it. */
export const mainCheckout = (top, commonDir) =>
  basename(commonDir) === '.git' ? dirname(commonDir) : top;

/** The main checkout of the folder at `top`, or `top` itself outside a repository. */
export const checkoutOf = top => {
  try {
    const commonDir = execFileSync(
      'git',
      ['-C', top, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}
    );
    return mainCheckout(top, commonDir.trim());
  } catch {
    return top;
  }
};

/** The project: `.claude/vault-project` at `top`, else its main checkout's folder. */
export const projectOf = top => {
  const marker = join(top, '.claude/vault-project');
  return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : basename(checkoutOf(top));
};
