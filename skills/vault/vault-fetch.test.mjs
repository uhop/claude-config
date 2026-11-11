// Pins the scripts' wait on a 429 (vault-storage 7z-2, question 383). Run: node --test skills/vault/

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {vaultFetch} from './vault-fetch.mjs';

const answer =
  (status, retryAfter = null) =>
  () =>
    new Response(JSON.stringify({code: status === 429 ? 'too_many_requests' : 'ok'}), {
      status,
      headers: retryAfter === null ? {} : {'Retry-After': retryAfter}
    });

const scripted = answers => {
  const sent = [];
  const slept = [];
  const fetchImpl = async (url, init) => {
    sent.push([url, init.method, init.body]);
    return answers[Math.min(sent.length, answers.length) - 1]();
  };
  return {sent, slept, opts: {fetchImpl, wait: async ms => void slept.push(ms)}};
};

test('a 429 is sent again after each Retry-After, body and all, and the answer is returned', async () => {
  const {sent, slept, opts} = scripted([answer(429, '1'), answer(429, '4'), answer(200)]);
  const init = {method: 'POST', body: '{"op":"append"}'};
  const response = await vaultFetch('http://v/vault/edit', init, opts);
  assert.equal(response.status, 200);
  assert.deepEqual(slept, [1_000, 4_000]);
  assert.deepEqual(
    sent.map(([url, method, body]) => `${method} ${url} ${body}`),
    Array(3).fill('POST http://v/vault/edit {"op":"append"}')
  );
});

test('the waits stop at five minutes in all, and the last refusal is returned', async () => {
  const {sent, slept, opts} = scripted([answer(429, '120')]);
  const response = await vaultFetch('http://v/vault/a.md', {}, opts);
  assert.equal(response.status, 429);
  assert.deepEqual(slept, [120_000, 120_000, 60_000], 'the last wait cut to what was left');
  assert.equal(sent.length, 4);
  assert.equal((await response.json()).code, 'too_many_requests', 'its body unread');
});

test('a 429 with no Retry-After, and every other answer, is returned at once', async () => {
  for (const [status, retryAfter] of [[429], [429, 'soon'], [503, '30'], [404]]) {
    const {sent, slept, opts} = scripted([answer(status, retryAfter)]);
    assert.equal((await vaultFetch('http://v/x', {}, opts)).status, status);
    assert.deepEqual([sent.length, slept.length], [1, 0]);
  }
});
