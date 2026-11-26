// The installed plugin's files and exports that claude-config's scripts load, pinned so a plugin
// release that renames or reshapes one fails here. A host without the plugin skips it. Run:
// node --test skills/vault/program-clerk-plugin.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {pluginRoot, pluginScript} from './program-clerk-plugin.mjs';

// Each module with the exports its readers take, and the arity where a reader passes arguments by
// position: queue-items.mjs (queue, common, http, queue-cli) and fleet-status.mjs (github).
const MODULES = {
  'lib/queue.mjs': {SOURCE_RE: 'object', SOURCE_HELP: 'string', queueOf: 2, fileItem: 3},
  'lib/common.mjs': {NO_KEY: 'string', connectionOf: 0},
  'lib/http.mjs': {request: 2},
  'lib/queue-cli.mjs': {run: 1},
  'lib/github.mjs': {
    collectRepo: 1,
    commitBaseline: 'function',
    appendRuns: 'function',
    eventLine: 1,
    renderBrief: 1
  }
};
// Command lines a reader runs: reorg-batch.mjs spawns enrich's `prepare --refresh` and `apply`.
const SCRIPTS = ['sweep/enrich.mjs'];

const installed = pluginRoot() !== '';

for (const [relative, exports] of Object.entries(MODULES)) {
  test(`the plugin's ${relative} has what claude-config takes`, {skip: !installed}, async () => {
    const module = await import(pathToFileURL(pluginScript(relative)).href);
    for (const [name, shape] of Object.entries(exports)) {
      const value = module[name];
      if (typeof shape === 'number') {
        assert.equal(typeof value, 'function', `${relative} exports ${name}`);
        assert.equal(value.length, shape, `${relative}'s ${name} takes ${shape} arguments`);
      } else {
        assert.equal(typeof value, shape, `${relative} exports ${name} as ${shape}`);
      }
    }
  });
}

test("the plugin's scripts claude-config runs are there", {skip: !installed}, () => {
  for (const relative of SCRIPTS) assert.ok(pluginScript(relative));
});
