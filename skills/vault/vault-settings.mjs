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
