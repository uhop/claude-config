// The vault skills' scripts call the vault's API through `vaultFetch` (vault-storage 7z-2, question
// 383): a server of the pool refuses an account past its rate with a 429 that names `Retry-After`,
// before applying anything, so the request goes again after it, for five minutes in all, as the MCP
// adapter does. Any other answer, or the refusal past the five minutes, is the caller's.

const WAIT_MS = 5 * 60_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** `fetch`, with a 429 naming its `Retry-After` waited out; the body must be one a resend can carry. */
export const vaultFetch = async (url, init = {}, {fetchImpl = fetch, wait = sleep} = {}) => {
  for (let waited = 0; ;) {
    const response = await fetchImpl(url, init);
    const after = Number(response.headers.get('retry-after'));
    const left = WAIT_MS - waited;
    if (response.status !== 429 || !(after > 0) || left <= 0) return response;
    await response.body?.cancel();
    const ms = Math.min(after * 1000, left);
    await wait(ms);
    waited += ms;
  }
};
