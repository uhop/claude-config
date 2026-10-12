// Pins the vault settings' names (vault-storage D141, plan arc 7p-2): the product's names first,
// each falling back to the old name it replaces, every missing setting named. Run: node --test skills/vault/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {vaultSettings} from './vault-settings.mjs';

const BOTH_MISSING =
  'PROGRAM_CLERK_URL (or the old VAULT_API_URL) and PROGRAM_CLERK_KEY (or the old VAULT_API_TOKEN) must be set (see ~/.env)';

test('the new names alone', () => {
  assert.deepEqual(vaultSettings({PROGRAM_CLERK_URL: 'http://new:1', PROGRAM_CLERK_KEY: 'pck'}), {
    base: 'http://new:1',
    token: 'pck',
    problem: ''
  });
});

test('the new names win over the old', () => {
  const env = {
    PROGRAM_CLERK_URL: 'http://new:1',
    PROGRAM_CLERK_KEY: 'pck',
    VAULT_API_URL: 'http://old:2',
    VAULT_API_TOKEN: 'old'
  };
  assert.deepEqual(vaultSettings(env), {base: 'http://new:1', token: 'pck', problem: ''});
});

test('the old names alone', () => {
  assert.deepEqual(vaultSettings({VAULT_API_URL: 'http://old:2', VAULT_API_TOKEN: 'old'}), {
    base: 'http://old:2',
    token: 'old',
    problem: ''
  });
});

test('each name falls back on its own, an empty value included', () => {
  const env = {PROGRAM_CLERK_URL: '', VAULT_API_URL: 'http://old:2', PROGRAM_CLERK_KEY: 'pck'};
  assert.deepEqual(vaultSettings(env), {base: 'http://old:2', token: 'pck', problem: ''});
});

test('trailing slashes come off the base', () => {
  assert.equal(
    vaultSettings({PROGRAM_CLERK_URL: 'http://new:1//', PROGRAM_CLERK_KEY: 'pck'}).base,
    'http://new:1'
  );
});

test('nothing set names both settings in one problem', () => {
  assert.deepEqual(vaultSettings({}), {base: '', token: '', problem: BOTH_MISSING});
  assert.equal(vaultSettings({PROGRAM_CLERK_URL: '', VAULT_API_TOKEN: ''}).problem, BOTH_MISSING);
});

test('one missing names that one only', () => {
  assert.equal(
    vaultSettings({VAULT_API_URL: 'http://old:2'}).problem,
    'PROGRAM_CLERK_KEY (or the old VAULT_API_TOKEN) must be set (see ~/.env)'
  );
  assert.equal(
    vaultSettings({PROGRAM_CLERK_KEY: 'pck'}).problem,
    'PROGRAM_CLERK_URL (or the old VAULT_API_URL) must be set (see ~/.env)'
  );
});
