// The product's names (vault-storage D141), each with the old name it replaces, read until the switch.
const SETTINGS = [
  ['PROGRAM_CLERK_URL', 'VAULT_API_URL'],
  ['PROGRAM_CLERK_KEY', 'VAULT_API_TOKEN']
];

export const vaultSettings = (env = process.env) => {
  const [url, token] = SETTINGS.map(([name, old]) => env[name] || env[old] || '');
  const missing = SETTINGS.filter(([name, old]) => !env[name] && !env[old]).map(
    ([name, old]) => `${name} (or the old ${old})`
  );
  return {
    base: url.replace(/\/+$/, ''),
    token,
    problem: missing.length ? `${missing.join(' and ')} must be set (see ~/.env)` : ''
  };
};

// A session keeps the environment it started with, so a key saved to ~/.env later goes unseen (8d).
// hooks/vault-resume-brief.sh carries this text verbatim, as its test checks.
export const KEY_RENEWAL =
  'make a new key on /ui/keys.html (a fresh sign-in), save it in ~/.env, and start a new session from a new shell or after `. ~/.env`, since a running session keeps the key it started with';

// As the shell that sources the file would set it: the last assignment wins.
export const envFileKey = text => {
  const found = {};
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?(PROGRAM_CLERK_KEY|VAULT_API_TOKEN)=(.*)$/.exec(line);
    if (m) found[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return found.PROGRAM_CLERK_KEY || found.VAULT_API_TOKEN || '';
};

export const refusedKeyLine = (sent, fileKey) =>
  fileKey && fileKey !== sent
    ? 'the vault refused PROGRAM_CLERK_KEY (401), and ~/.env holds a different key, saved after this session started: start a new session from a new shell, or run `. ~/.env` before the command'
    : `the vault refused PROGRAM_CLERK_KEY (401): expired or recalled; ${KEY_RENEWAL}`;
