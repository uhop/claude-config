// The vault skills' scripts call the vault's API through `vaultFetch`. Two waits, each for an
// answer that applied nothing:
//
// - A 429 that names its `Retry-After` (vault-storage 7z-2, question 383): sent again after it, for
//   five minutes in all.
// - An outage (vault-storage 7as-2, D751, D752, question 430, on D457 and D459's rules for the
//   retired adapter): a connection never made, or a 503 that says nothing was applied, is sent
//   again whatever the method; a read also after any other network failure, a 502, a 503, or a 504.
//   The waits grow from 250 ms to 16 s, each at least the answer's `Retry-After`, for 90 s from the
//   first failure, under an agent's 120 s command limit, or `VAULT_FETCH_OUTAGE_S` seconds, which a
//   hook that runs a script sets to its own few seconds. The first failure marks the outage in a
//   file, so a call that starts while it is marked, in this process or another, tries once until an
//   answer clears it, and only an outage's first call waits.
//
// Any other answer or failure, or one past its wait, is the caller's.

import {existsSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const RATE_WAIT_MS = 5 * 60_000;
const OUTAGE_WAIT_MS = 90_000;
const STEPS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000, 16_000];

// The request was never sent: no connection was made.
const NOT_SENT = new Set([
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
  'ENETDOWN',
  'EAI_AGAIN'
]);

// A wrong URL, which no wait mends.
const NO_SUCH_HOST = 'ENOTFOUND';

// A pool server's 503s that applied nothing; the balancer's own carries no code of ours.
const APPLIED_NOTHING = new Set([
  'tenant_unavailable',
  'verification_unavailable',
  'writes_paused'
]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The outage's mark, a file every process of the user reads. */
const fileOutage = () => {
  const file = join(
    process.env.XDG_RUNTIME_DIR || tmpdir(),
    `vault-fetch-outage-${process.getuid?.() ?? 'user'}`
  );
  return {
    active: () => existsSync(file),
    mark: () => {
      try {
        writeFileSync(file, `${new Date().toISOString()}\n`);
      } catch {
        // A mark that cannot be written leaves the next call to wait its own window.
      }
    },
    clear: () => rmSync(file, {force: true})
  };
};

const isRead = method => method === undefined || /^(?:GET|HEAD)$/i.test(method);

const causeOf = err => err?.cause?.code ?? err?.code;

const repeatableFailure = (err, read, signal) => {
  if (signal?.aborted) return false;
  const cause = causeOf(err);
  if (cause === NO_SUCH_HOST) return false;
  return NOT_SENT.has(cause) || read;
};

const codeOf = async response => {
  try {
    const body = await response.clone().json();
    return typeof body?.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
};

const repeatableAnswer = async (response, read) => {
  if (response.status === 502 || response.status === 504) return read;
  if (response.status !== 503) return false;
  const code = await codeOf(response);
  return code === null || APPLIED_NOTHING.has(code) || read;
};

/** `fetch`, with the waits above; the body must be one a resend can carry. */
export const vaultFetch = async (
  url,
  init = {},
  {fetchImpl = fetch, wait = sleep, now = Date.now, outage = fileOutage()} = {}
) => {
  const read = isRead(init.method);
  const window = Number(process.env.VAULT_FETCH_OUTAGE_S) * 1000;
  const outageMs = window > 0 ? window : OUTAGE_WAIT_MS;
  let rateWaited = 0;
  let firstFailure = null;
  for (let step = 0; ;) {
    let response = null;
    let failure = null;
    try {
      response = await fetchImpl(url, init);
    } catch (err) {
      failure = err;
    }
    if (response) {
      const after = Number(response.headers.get('retry-after'));
      const left = RATE_WAIT_MS - rateWaited;
      if (response.status === 429 && after > 0 && left > 0) {
        await response.body?.cancel();
        const ms = Math.min(after * 1000, left);
        await wait(ms);
        rateWaited += ms;
        continue;
      }
    }
    const repeatable = failure
      ? repeatableFailure(failure, read, init.signal)
      : await repeatableAnswer(response, read);
    if (!repeatable) {
      if (response && outage.active()) outage.clear();
      if (failure) throw failure;
      return response;
    }
    // A marked outage: this call tries once.
    if (firstFailure === null && outage.active()) {
      if (failure) throw failure;
      return response;
    }
    if (firstFailure === null) {
      firstFailure = now();
      outage.mark();
    }
    const left = outageMs - (now() - firstFailure);
    if (left <= 0) {
      if (failure) throw failure;
      return response;
    }
    const after = response ? Number(response.headers.get('retry-after')) * 1000 || 0 : 0;
    const ms = Math.min(Math.max(STEPS_MS[Math.min(step, STEPS_MS.length - 1)], after), left);
    ++step;
    await response?.body?.cancel();
    await wait(ms);
  }
};
