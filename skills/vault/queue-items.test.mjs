// The shim over the plugin's queue, against a stand-in plugin folder. Run:
// node --test skills/vault/queue-items.test.mjs

import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const shim = fileURLToPath(new URL('./queue-items.mjs', import.meta.url));
const work = mkdtempSync(path.join(os.tmpdir(), 'queue-items-'));
after(() => rmSync(work, {recursive: true, force: true}));

const plugin = path.join(work, 'plugin');
const lib = path.join(plugin, 'scripts', 'lib');
mkdirSync(lib, {recursive: true});
const MODULES = {
  'queue.mjs': `export const SOURCE_RE = /^github /;
export const SOURCE_HELP = 'names a ticket';
export const calls = [];
export const queueOf = async (api, project) => {
  calls.push(['queueOf', project, await api('/probe', {method: 'GET'})]);
  return {notes: [], trackers: {project, trackers: [{kind: 'github', ref: 'a/b'}]}};
};
export const fileItem = async (api, project, item) => {
  calls.push(['fileItem', typeof api, project, item]);
  return {path: 'projects/' + project + '/queue/x.md', replaced: false};
};
`,
  'common.mjs': `export const NO_KEY = 'no key';
export const connectionOf = () => ({base: 'http://pc.test', key: 'k'});
`,
  'http.mjs': `export const request = async (conn, route, options) => ({conn, route, options});
`,
  'queue-cli.mjs': `export const run = async argv => console.log(JSON.stringify(argv));
`
};
for (const [name, text] of Object.entries(MODULES)) writeFileSync(path.join(lib, name), text);

process.env.PROGRAM_CLERK_PLUGIN_ROOT = plugin;
const {SOURCE_RE, fileItem, trackersOf} = await import(pathToFileURL(shim).href);
const {calls} = await import(pathToFileURL(path.join(lib, 'queue.mjs')).href);

const cli = (args, root = plugin) =>
  spawnSync(process.execPath, [shim, ...args], {
    encoding: 'utf8',
    env: {...process.env, PROGRAM_CLERK_PLUGIN_ROOT: root}
  });

test('the shim answers the plugin module’s constants', () => {
  assert.ok(SOURCE_RE.test('github a/b#1'));
});

test('trackersOf answers the declaration, read through the connection', async () => {
  calls.length = 0;
  const view = await trackersOf('p');
  assert.deepEqual(view.trackers, [{kind: 'github', ref: 'a/b'}]);
  assert.deepEqual(calls[0], [
    'queueOf',
    'p',
    {conn: {base: 'http://pc.test', key: 'k'}, route: '/probe', options: {method: 'GET'}}
  ]);
});

test('fileItem passes the project and the item, with the connection first', async () => {
  calls.length = 0;
  const item = {title: 'T.', section: 'active', source: null, body: 'b'};
  assert.deepEqual(await fileItem('p', item), {path: 'projects/p/queue/x.md', replaced: false});
  assert.deepEqual(calls[0], ['fileItem', 'function', 'p', item]);
});

test('the command line runs the plugin’s, with fleet as its all', () => {
  const fleet = cli(['fleet', '--section', 'active']);
  assert.equal(fleet.status, 0, fleet.stderr);
  assert.deepEqual(JSON.parse(fleet.stdout), ['all', '--section', 'active']);
  const list = cli(['list', 'p', '--json']);
  assert.deepEqual(JSON.parse(list.stdout), ['list', 'p', '--json']);
});

test('with no plugin, the command line says how to install it', () => {
  const empty = path.join(work, 'empty');
  mkdirSync(empty);
  const r = cli(['list', 'p'], empty);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /claude plugin update program-clerk@program-clerk/);
});
