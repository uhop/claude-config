#!/usr/bin/env node
// A project's queue for claude-config's scripts, served by the installed Program Clerk plugin's queue
// module and script (vault-storage D765). The procedure is the plugin's `queue` skill.
//
//   queue-items.mjs list <project> [--section S] [--json]
//   queue-items.mjs fleet [--section S] [--priority N] [--limit N] [--json]   # the plugin's `all`
//   queue-items.mjs file <project> --title T [--section S] [--priority N] [--source S]
//                        [--blocked-by B] (--body B | --body-file F)
//   queue-items.mjs move <project> <title or slug> --section S [--priority N]
//   queue-items.mjs archive <project> <title or slug> --reason R [--trail T]
//   queue-items.mjs trackers <project> [--json]

import process from 'node:process';
import {pluginModule} from './program-clerk-plugin.mjs';

const fail = err => {
  console.error(err.message);
  process.exit(2);
};

const queue = await pluginModule('lib/queue.mjs').catch(fail);
const {NO_KEY, connectionOf} = await pluginModule('lib/common.mjs').catch(fail);
const {request} = await pluginModule('lib/http.mjs').catch(fail);

export const {SOURCE_RE, SOURCE_HELP} = queue;

const api = () => {
  const conn = connectionOf();
  if (conn === null) throw new Error(NO_KEY);
  return (route, options = {}) => request(conn, route, options);
};

/** A project's tracker declaration, validated. */
export const trackersOf = async project => (await queue.queueOf(api(), project)).trackers;

/** Files an item; an open item with the same source or title is replaced where it stands. */
export const fileItem = (project, item) => queue.fileItem(api(), project, item);

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'fleet') argv[0] = 'all';
  const {run} = await pluginModule('lib/queue-cli.mjs').catch(fail);
  try {
    await run(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
