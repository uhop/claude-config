// How a session divides between the agent working and the session waiting on the user. A wait runs
// from the last agent row to the prompt that answers it, labeled by what that row's message asked for.

import {
  asHumanRow,
  isAutomatedEntrypoint,
  isHumanUserRow,
  stripSyntheticBlocks
} from '../reflect/reflect-lib.mjs';

// A longer gap is often work in another session.
export const SHORT_WAIT_MS = 30 * 60_000;

const FENCE = /```[^\n]*\n([\s\S]*?)```/g;
const SUBJECT = /^[A-Z][^\n]{5,71}\.$/;

const closingParagraph = text =>
  text
    .replace(FENCE, '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph && paragraph !== '---')
    .at(-1) ?? '';

// A question's pick follows it, so the closing paragraph holds the `?` rather than ends on it, and an
// earlier paragraph's is mostly a quote (read on 30 days of stops, claude-config D67).
export const labelOf = text => {
  const blocks = [...text.matchAll(FENCE)].map(match => match[1].trim());
  const endsOnBlock = text
    .trimEnd()
    .replace(/(?:\s*\n---)+$/, '')
    .endsWith('```');
  const labels = [];
  if (blocks.some(block => block.startsWith('!'))) labels.push('command');
  if (closingParagraph(text).includes('?')) labels.push('question');
  if (endsOnBlock && SUBJECT.test(blocks.at(-1) ?? '')) labels.push('commit');
  return labels.join('+') || 'report';
};

const NOT_A_PROMPT = /^(?:\[Request interrupted|Stop hook feedback:)/;

const textOf = content =>
  Array.isArray(content)
    ? content
        .filter(block => block?.type === 'text')
        .map(block => block.text)
        .join('\n')
    : (content ?? '');

const isToolResult = content =>
  Array.isArray(content) && content.some(block => block?.type === 'tool_result');

/** One session's rows: its span, the split, and each wait. A headless session has no waits: null. */
export const waitsOf = rows => {
  let first = null;
  let last = null;
  let lastAgent = null;
  let lastText = '';
  const waits = [];
  for (const raw of rows) {
    if (isAutomatedEntrypoint(raw.entrypoint)) return null;
    if (raw.isSidechain === true) continue;
    const when = raw.timestamp ? Date.parse(raw.timestamp) : NaN;
    if (Number.isNaN(when)) continue;
    const row = asHumanRow(raw);
    const content = row.message?.content;
    if (row.type === 'assistant') {
      first ??= when;
      last = lastAgent = when;
      const said = textOf(content);
      if (said.trim()) lastText = said;
      continue;
    }
    if (!isHumanUserRow(row)) continue;
    if (isToolResult(content)) {
      first ??= when;
      last = lastAgent = when;
      continue;
    }
    const text = stripSyntheticBlocks(textOf(content)).trim();
    if (!text || NOT_A_PROMPT.test(text)) continue;
    first ??= when;
    last = when;
    if (row.queued === true || lastAgent === null) continue;
    waits.push({ms: when - lastAgent, label: labelOf(lastText)});
    lastAgent = null;
  }
  const spanMs = first === null ? 0 : last - first;
  const waitingMs = waits.reduce((sum, wait) => sum + wait.ms, 0);
  return {span_ms: spanMs, working_ms: spanMs - waitingMs, waiting_ms: waitingMs, waits};
};

const median = sorted => sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;

const sumOf = waits => ({count: waits.length, ms: waits.reduce((sum, wait) => sum + wait.ms, 0)});

/** Totals over sessions: the split, waits either side of the threshold, and each label. */
export const summarize = sessions => {
  const waits = sessions.flatMap(session => session.waits);
  const isShort = wait => wait.ms < SHORT_WAIT_MS;
  const labels = {};
  for (const label of new Set(waits.map(wait => wait.label))) {
    const of = waits.filter(wait => wait.label === label);
    const shortOnes = sumOf(of.filter(isShort));
    labels[label] = {
      ...sumOf(of),
      median_ms: median(of.map(wait => wait.ms).sort((a, b) => a - b)),
      short_count: shortOnes.count,
      short_ms: shortOnes.ms
    };
  }
  const total = field => sessions.reduce((sum, session) => sum + session[field], 0);
  return {
    sessions: sessions.length,
    span_ms: total('span_ms'),
    working_ms: total('working_ms'),
    waiting_ms: total('waiting_ms'),
    short: sumOf(waits.filter(isShort)),
    long: sumOf(waits.filter(wait => !isShort(wait))),
    labels,
    by_session: sessions.map(({project, session, span_ms, working_ms, waiting_ms, waits: own}) => ({
      project,
      session,
      span_ms,
      working_ms,
      waiting_ms,
      waits: own.length
    }))
  };
};
