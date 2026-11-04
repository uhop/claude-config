// Which tool calls repeat in a row, and which values one call takes from an earlier result: the count
// behind asking whether a repeated sequence should be an operation of its own. Built from the scripts in
// vault `queries/2026-10-25-vault-operation-sequences`.

const LOOK_BACK = 12;
const VIA_BACK = 5;
const SHORTEST_VALUE = 8;
const RESULT_CAP = 200_000;
const LENGTHS = [2, 3, 4];

const textOf = content =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(block => block?.text ?? '').join('\n')
      : '';

/** A transcript's tool calls in order, each once, with its input and result. */
export const callsOf = (rows, {includeSidechain = false} = {}) => {
  const calls = [];
  const byId = new Map();
  for (const row of rows) {
    if (row.isSidechain === true && !includeSidechain) continue;
    const content = row.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (row.type === 'assistant' && block?.type === 'tool_use' && !byId.has(block.id)) {
        const made = {
          tool: block.name ?? '',
          input: block.input ?? {},
          inputText: JSON.stringify(block.input ?? {}),
          result: ''
        };
        byId.set(block.id, made);
        calls.push(made);
      } else if (row.type === 'user' && block?.type === 'tool_result') {
        const made = byId.get(block.tool_use_id);
        if (made) made.result = textOf(block.content).slice(0, RESULT_CAP);
      }
    }
  }
  return calls;
};

const leaves = (value, key = '') => {
  if (typeof value === 'string') return value.length >= SHORTEST_VALUE ? [[key, value]] : [];
  if (Array.isArray(value)) return value.flatMap(item => leaves(item, key));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([name, item]) => leaves(item, name));
  return [];
};

const bump = (table, key, file, fields) => {
  const entry = table.get(key) ?? {...fields, count: 0, fileSet: new Set()};
  ++entry.count;
  entry.fileSet.add(file);
  table.set(key, entry);
};

export const newSequences = tools => ({
  tools,
  files: 0,
  calls: 0,
  grams: new Map(LENGTHS.map(n => [n, new Map()])),
  values: new Map()
});

const nameIn = (state, call) => call.tool.slice(state.tools.length);

/** Adds one transcript's calls; a transcript with none of the family's counts for nothing. */
export const addFile = (state, file, calls) => {
  const inFamily = call => call.tool.startsWith(state.tools);
  const own = calls.filter(inFamily);
  if (own.length === 0) return;
  ++state.files;
  state.calls += own.length;

  const names = own.map(call => nameIn(state, call)).filter((name, i, all) => name !== all[i - 1]);
  for (const n of LENGTHS)
    for (let i = 0; i + n <= names.length; ++i) {
      const gram = names.slice(i, i + n);
      bump(state.grams.get(n), gram.join('\t'), file, {calls: gram});
    }

  calls.forEach((call, i) => {
    if (!inFamily(call)) return;
    const seen = new Set();
    for (const [field, value] of leaves(call.input)) {
      if (seen.has(value)) continue;
      seen.add(value);
      for (let j = i - 1; j >= Math.max(0, i - LOOK_BACK); --j) {
        const earlier = calls[j];
        if (!earlier.result.includes(value) || earlier.inputText.includes(value)) continue;
        let through = null;
        if (!inFamily(earlier))
          for (let k = j - 1; k >= Math.max(0, j - VIA_BACK); --k)
            if (inFamily(calls[k])) {
              through = nameIn(state, calls[k]);
              break;
            }
        const from = inFamily(earlier) ? nameIn(state, earlier) : earlier.tool;
        const to = nameIn(state, call);
        bump(state.values, [from, through, field, to].join('\t'), file, {
          from,
          through,
          field,
          to
        });
        break;
      }
    }
  });
};

const ranked = (table, top) =>
  [...table.values()]
    .map(({fileSet, ...entry}) => ({...entry, files: fileSet.size}))
    .sort((a, b) => b.files - a.files || b.count - a.count)
    .slice(0, top);

/** What was counted, each table ranked by how many transcripts show it. */
export const reportOf = (state, top) => ({
  tools: state.tools,
  files: state.files,
  calls: state.calls,
  sequences: Object.fromEntries(LENGTHS.map(n => [n, ranked(state.grams.get(n), top)])),
  values: ranked(state.values, top)
});
