// The vault skills' scripts call the vault's API through `vaultFetch`. Two waits, each for an
// answer that applied nothing:
//
// - A 429 that names its `Retry-After` (vault-storage 7z-2, question 383): sent again after it, for
//   five minutes in all.
// - An outage (vault-storage 7as-2, D751, on D457 and D459's rules for the retired adapter): a
//   connection never made, or a 503 that says nothing was applied, is sent again whatever the
//   method; a read also after any other network failure, a 502, a 503, or a 504. The waits grow
//   from 250 ms to 16 s, each at least the answer's `Retry-After`, for two minutes from the first
//   failure. Once a call has waited that out, later calls in the process try once until the server
//   answers with anything else (question 119), so a script's calls in a row do not each wait.
//
// Any other answer or failure, or one past its wait, is the caller's.

const RATE_WAIT_MS = 5 * 60_000;
const OUTAGE_WAIT_MS = 2 * 60_000;
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

/** The process's remembered outage: when a call last waited one out, or null. */
const sharedOutage = {since: null};

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
  {fetchImpl = fetch, wait = sleep, now = Date.now, outage = sharedOutage} = {}
) => {
  const read = isRead(init.method);
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
      if (response) outage.since = null;
      if (failure) throw failure;
      return response;
    }
    // A remembered outage: this call tries once.
    if (firstFailure === null && outage.since !== null) {
      if (failure) throw failure;
      return response;
    }
    firstFailure ??= now();
    const left = OUTAGE_WAIT_MS - (now() - firstFailure);
    if (left <= 0) {
      outage.since ??= firstFailure;
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
