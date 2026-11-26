// The installed Program Clerk plugin, whose modules claude-config's scripts load (vault-storage D763,
// D765). PROGRAM_CLERK_PLUGIN_ROOT: the test seam, a plugin folder in place of the installed one.

import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const ID = 'program-clerk@program-clerk';

const listed = () => {
  try {
    const out = execFileSync('claude', ['plugin', 'list', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return JSON.parse(out);
  } catch {
    return [];
  }
};

let root;

/** The enabled plugin's folder, or '' when none is installed. */
export const pluginRoot = () => {
  root ??=
    process.env.PROGRAM_CLERK_PLUGIN_ROOT ||
    (listed().find(p => p.id === ID && p.enabled)?.installPath ?? '');
  return root;
};

/** The path of one of the plugin's files under `scripts/`; throws when it is missing. */
export const pluginScript = relative => {
  const file = path.join(pluginRoot(), 'scripts', relative);
  if (!pluginRoot() || !existsSync(file))
    throw new Error(
      `the Program Clerk plugin's scripts/${relative} is missing (${file}): install or update the plugin, \`claude plugin update ${ID}\``
    );
  return file;
};

/** One of the plugin's modules, by its path under `scripts/`. */
export const pluginModule = async relative => import(pathToFileURL(pluginScript(relative)).href);
