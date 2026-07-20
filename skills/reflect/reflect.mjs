#!/usr/bin/env node
// /reflect scanner — walks Claude Code session transcripts under
// ~/.claude/projects/**/*.jsonl and emits candidate workflow-improvement
// signals (corrections, confirmations, stuck loops, repeated failures,
// surprises) for the agent to dedupe + route via SKILL.md.
//
// Detection is structural / regex-based; semantic judgment is the agent's
// job downstream. Better to surface a noisy candidate than to silently drop
// a real signal.
//
// Usage:
//   reflect.mjs                              # default --since=last-run (falls back to 7d)
//   reflect.mjs --since=24h|7d|14d|YYYY-MM-DD
//   reflect.mjs --project=NAME               # filter by project dir basename
//   reflect.mjs --out="$WORK/scan.json"     # write JSON to file (also stdout); $WORK from mktemp -d
//   reflect.mjs --include-sidechain          # include sub-agent transcripts
//   reflect.mjs --max-excerpt-chars N        # cap each excerpt (default 800)

import {readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  for (const a of args) {
    if (a === name) return true;
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return fallback;
};

const SINCE = opt('--since', 'last-run');
const PROJECT_FILTER = opt('--project', null);
const OUT_PATH = opt('--out', null);
const INCLUDE_SIDECHAIN = opt('--include-sidechain', false) === true;
const MAX_EXCERPT = Number(opt('--max-excerpt-chars', '800'));

const STATE_FILE = join(
  homedir(),
  '.cache',
  'reflect',
  'last-run.json'
);

const resolveWindowStart = since => {
  if (since === 'last-run') {
    if (existsSync(STATE_FILE)) {
      try {
        const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        // Guard against a corrupt (far-future) cached value — e.g. a 19-digit
        // <seconds><nanoseconds> blob from a bad `date +%s%3N` write. Allow up
        // to a day of clock skew, else fall through to the 7d default rather
        // than computing a future window that scans nothing.
        if (typeof s.last_run_ms === 'number' && s.last_run_ms <= Date.now() + 86400e3) {
          return s.last_run_ms;
        }
      } catch {}
    }
    return Date.now() - 7 * 86400 * 1000;
  }
  const m = since.match(/^(\d+)([hdw])$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    const ms = unit === 'h' ? n * 3600e3 : unit === 'd' ? n * 86400e3 : n * 7 * 86400e3;
    return Date.now() - ms;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return Date.parse(since + 'T00:00:00Z');
  }
  throw new Error(`unrecognized --since value: ${since}`);
};

const windowStartMs = resolveWindowStart(SINCE);

// --- Pattern library ----------------------------------------------------

const NEGATION_PATTERNS = [
  /\bno+,?\s+(don'?t|stop|not)\b/i,
  /\bdon'?t\s+(do|use|run|call|reach|write|add|create|touch)\b/i,
  /\bstop\s+(doing|using|calling|running)\b/i,
  /\bnever\s+(do|use|run|call|write|amend|force)\b/i,
  /\bplease\s+don'?t\b/i,
  /\bwe\s+don'?t\s+(do|use)\s+(that|this|it)\b/i,
  /\bthat'?s?\s+(wrong|not right|not what)\b/i,
  /\bnot\s+(that|this)\s+(way|one|approach)\b/i,
];

// Cue-less corrections: a steer phrased as an observation-of-a-better-way, with
// none of the sharp NEGATION cues — the class that let the scratch-file/mktemp
// correction fire zero signals across two /reflect runs. Recall-over-precision
// by design (dedupe + agent judgment carry precision downstream); deliberately
// excludes bare imperatives ("do it" / "continue"), which are task directions.
const OBSERVATIONAL_CORRECTION_PATTERNS = [
  /\bI(?:'ve| have)? noticed\b/i,
  /\bthere(?:'s| is)\s+(?:a|an)\s+(better|doc|convention|skill|way|tool|helper|rule|pattern)\b/i,
  /\binstead of\b/i,
  /\brather than\b/i,
  /\bwhy\s+(?:don'?t|not|are you|did you|would you|are we|did we)\b/i,
];

const CONFIRMATION_PATTERNS = [
  /\byes,?\s*(exactly|right|that'?s right|perfect|good|correct)\b/i,
  /\b(perfect|exactly right|nailed it|spot on)\b/i,
  /\bkeep doing (that|this)\b/i,
  /\bthat'?s the (right|correct) (call|approach|move|answer)\b/i,
];

const SURPRISE_PATTERNS = [
  /\bTIL\b/,
  /\boh,?\s+(huh|wow)\b/i,
  /\b(I|we)\s+didn'?t\s+(expect|know|realize)\b/i,
  /^(that'?s|this is|how)\s+(interesting|surprising|unexpected)\b/im,
];

// --- Transcript walking -------------------------------------------------

const ROOT = join(homedir(), '.claude', 'projects');

const collectTranscripts = () => {
  const out = [];
  let projects;
  try {
    projects = readdirSync(ROOT);
  } catch {
    return out;
  }
  for (const projectDir of projects) {
    if (PROJECT_FILTER && !projectDir.includes(PROJECT_FILTER)) continue;
    const projectPath = join(ROOT, projectDir);
    let entries;
    try {
      entries = readdirSync(projectPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const fp = join(projectPath, entry);
      const stat = statSync(fp);
      if (stat.mtimeMs < windowStartMs) continue;
      out.push({
        path: fp,
        project: projectDir,
        session_id: entry.replace(/\.jsonl$/, ''),
        mtime: stat.mtimeMs
      });
    }
  }
  return out;
};

const transcripts = collectTranscripts();

// Strip auto-inserted machine content (system reminders, command-message
// blocks, stdout dumps) that Claude Code interleaves with user messages.
// These are not user-authored text and must not be classified as such.
const stripSyntheticBlocks = s =>
  s
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
    .trim();

// Flatten a row into:
//   - `userText`: user-authored prose only (string content or text blocks),
//     with synthetic blocks stripped. Empty for pure tool_result rows.
//   - `toolResultText`: all tool_result bodies, used for excerpt context.
//   - `errorResults`: [{id, text}] for tool_results with is_error=true,
//     used to compute per-error signatures (don't mix with success bodies).
//   - hasToolUse / toolNames / toolInputs: structural.
const flatten = row => {
  const out = {
    userText: '',
    toolResultText: '',
    errorResults: [],
    hasToolUse: false,
    toolNames: [],
    toolInputs: [],
    toolUseIds: []
  };
  const content = row.message?.content;
  if (typeof content === 'string') {
    out.userText = stripSyntheticBlocks(content);
    return out;
  }
  if (!Array.isArray(content)) return out;
  const extractBody = block => {
    if (typeof block.content === 'string') return block.content;
    if (Array.isArray(block.content)) {
      return block.content
        .filter(s => s?.type === 'text' && typeof s.text === 'string')
        .map(s => s.text)
        .join('\n');
    }
    return '';
  };
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      const cleaned = stripSyntheticBlocks(block.text);
      if (cleaned.length > 0) out.userText += (out.userText ? '\n' : '') + cleaned;
    } else if (block.type === 'tool_use') {
      // Push name / input / id together so the three arrays stay index-aligned
      // — Pass 2's stuck-loop gate reads toolUseIds[j] alongside toolInputs[j].
      out.hasToolUse = true;
      out.toolNames.push(block.name ?? '(unknown)');
      out.toolInputs.push(block.input ?? {});
      out.toolUseIds.push(block.id ?? null);
    } else if (block.type === 'tool_result') {
      const body = extractBody(block);
      if (body) out.toolResultText += (out.toolResultText ? '\n' : '') + body;
      if (block.is_error === true) {
        out.errorResults.push({id: block.tool_use_id, text: body});
      }
    }
  }
  return out;
};

// Build an excerpt from a list of events, capped at MAX_EXCERPT chars.
// Shows whatever's most informative per event: user text, assistant text +
// tool use, or tool result preview.
const buildExcerpt = events => {
  const parts = [];
  for (const e of events) {
    const prefix = e.role === 'user' ? 'USER' : 'ASSISTANT';
    let body = e.userText || e.toolResultText || '';
    if (e.toolNames?.length) body = `[tool_use ${e.toolNames.join(',')}] ` + body;
    if (e.hasToolResultError) body = `[tool_result ERROR] ` + body;
    parts.push(`${prefix}: ${body.replace(/\s+/g, ' ').trim()}`);
  }
  let s = parts.join('\n');
  if (s.length > MAX_EXCERPT) s = s.slice(0, MAX_EXCERPT - 1) + '…';
  return s;
};

// Fingerprint of a tool_use input: sha1 over the full stringify, not a
// truncated prefix. The old 200-char prefix collided distinct calls that
// shared a long preamble — e.g. three `cat > /tmp/foo.md <<'EOF'` heredocs
// with different bodies hashed to one fingerprint, manufacturing a fake
// stuck loop. Hashing the whole input kills that class.
const inputFingerprint = input => {
  try {
    return createHash('sha1').update(JSON.stringify(input)).digest('hex');
  } catch {
    return '';
  }
};

// --- Detection ----------------------------------------------------------

const signals = {
  corrections: [],
  confirmations: [],
  stuck_loops: [],
  repeated_failures: [],
  surprises: []
};

// Repeated-failure detection works across sessions: aggregate (toolName, errorSig) → count
const failureBuckets = new Map();
const failureExamples = new Map();

// Known accepted-as-noise error signatures — suppressed from repeated_failures
// to keep reports actionable. Each entry resolved via /clarify with explicit
// "accept as noise" decision; pattern is the tool-internal error message
// matched as a case-insensitive substring against the (lowercased, whitespace-
// collapsed, first-120-char) error signature.
//
// Don't grow this list lightly — every entry hides real-looking signal. Each
// addition should reference a clarify-queue archive entry.
const SUPPRESSED_FAILURE_SUBSTRINGS = [
  // Q-2026-05-17-001 — accepted as noise. Tool description already says
  // "must Read before Edit/Write"; recovery is one Read call.
  'file has not been read yet'
];

let sessionsAnalyzed = 0;

for (const t of transcripts) {
  let content;
  try {
    content = readFileSync(t.path, 'utf8');
  } catch {
    continue;
  }

  const events = [];
  // toolUseIdsByEvent[i] = list of {id, name} emitted by event i so we can
  // map tool_result_id → tool name regardless of how they're interleaved.
  const toolUseRegistry = new Map(); // id → name
  for (const line of content.split('\n')) {
    if (line.length === 0) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!INCLUDE_SIDECHAIN && row.isSidechain === true) continue;
    if (row.type !== 'user' && row.type !== 'assistant') continue;
    const ts = row.timestamp ? Date.parse(row.timestamp) : null;
    if (ts && ts < windowStartMs) continue;
    const f = flatten(row);
    // Register tool_use ids → names for later tool_result name lookup
    const content2 = row.message?.content;
    if (Array.isArray(content2)) {
      for (const block of content2) {
        if (block?.type === 'tool_use' && block.id && block.name) {
          toolUseRegistry.set(block.id, block.name);
        }
      }
    }
    // Capture tool_result ids on user events so we can look up the tool name
    const toolResultIds = [];
    if (Array.isArray(content2)) {
      for (const block of content2) {
        if (block?.type === 'tool_result' && block.tool_use_id) {
          toolResultIds.push(block.tool_use_id);
        }
      }
    }
    events.push({
      role: row.type,
      ts,
      userText: f.userText,
      toolResultText: f.toolResultText,
      errorResults: f.errorResults,
      hasToolUse: f.hasToolUse,
      hasToolResultError: f.errorResults.length > 0,
      toolNames: f.toolNames,
      toolInputs: f.toolInputs,
      toolUseIds: f.toolUseIds,
      toolResultIds
    });
  }

  if (events.length === 0) continue;
  sessionsAnalyzed++;

  // Pass 1: corrections + confirmations + surprises — scan user-authored
  // text only. Synthetic blocks (system reminders, command messages) have
  // already been stripped by flatten(), so userText is the real signal.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.role !== 'user' || !e.userText || e.userText.length < 3) continue;

    const text = e.userText;
    const prevAssistant = i > 0 && events[i - 1].role === 'assistant';
    const hasNegation = NEGATION_PATTERNS.some(re => re.test(text));
    const hasObservational = OBSERVATIONAL_CORRECTION_PATTERNS.some(re => re.test(text));
    const hasConfirmation = CONFIRMATION_PATTERNS.some(re => re.test(text));
    const hasSurprise = SURPRISE_PATTERNS.some(re => re.test(text));

    if (!hasNegation && !hasObservational && !hasConfirmation && !hasSurprise) continue;

    const ctxStart = Math.max(0, i - 3);
    const ctxEnd = Math.min(events.length, i + 2);
    const excerpt = buildExcerpt(events.slice(ctxStart, ctxEnd));
    // matched_text is the user-typed message that fired the classifier,
    // shown verbatim so the agent always sees the trigger even when the
    // preceding context blows the excerpt budget.
    const matched_text = text.length > 600 ? text.slice(0, 599) + '…' : text;

    const base = {
      project: t.project,
      session_id: t.session_id,
      ts: e.ts,
      matched_text,
      excerpt
    };

    if ((hasNegation || hasObservational) && prevAssistant) signals.corrections.push({...base, kind: 'correction'});
    if (hasConfirmation && prevAssistant) signals.confirmations.push({...base, kind: 'confirmation'});
    if (hasSurprise) signals.surprises.push({...base, kind: 'surprise'});
  }

  // Pass 2: stuck loops — same (toolName + input fingerprint) repeated ≥ 3×,
  // counting only repetitions whose tool_result came back is_error: true.
  // The error gate kills the iterative-test-runs false-positive class: a
  // refactor → `npm test` → fix → `npm test` cycle issues identical inputs
  // many times, but those runs succeed (or fail differently) — they're
  // progress, not a pathological retry. A genuine stuck loop is the same
  // call erroring over and over.
  const erroredIds = new Set();
  for (const e of events) {
    for (const err of e.errorResults) {
      if (err.id) erroredIds.add(err.id);
    }
  }
  const loopBuckets = new Map();
  for (const e of events) {
    if (e.role !== 'assistant') continue;
    for (let j = 0; j < e.toolNames.length; j++) {
      if (!erroredIds.has(e.toolUseIds[j])) continue;
      const name = e.toolNames[j];
      const fp = inputFingerprint(e.toolInputs[j]);
      const key = `${name}::${fp}`;
      const arr = loopBuckets.get(key) ?? [];
      arr.push(e.ts);
      loopBuckets.set(key, arr);
    }
  }
  for (const [key, tsList] of loopBuckets) {
    if (tsList.length < 3) continue;
    const [name] = key.split('::', 1);
    signals.stuck_loops.push({
      kind: 'stuck_loop',
      project: t.project,
      session_id: t.session_id,
      ts: tsList[0],
      tool: name,
      repetitions: tsList.length,
      excerpt: `[stuck loop] tool=${name} repeated ${tsList.length}× with same input fingerprint, each erroring`
    });
  }

  // Pass 3: cross-session error aggregation. One bucket per (tool, errSig)
  // built from the actual is_error tool_result text — not concatenated
  // with adjacent successes.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.role !== 'user' || e.errorResults.length === 0) continue;
    for (const err of e.errorResults) {
      const name = err.id ? toolUseRegistry.get(err.id) : null;
      const resolved = name ?? (i > 0 ? events[i - 1]?.toolNames?.[0] : null) ?? '(unknown)';
      const errSig = err.text.replace(/\s+/g, ' ').slice(0, 120).toLowerCase();
      const key = `${resolved}::${errSig}`;
      failureBuckets.set(key, (failureBuckets.get(key) ?? 0) + 1);
      if (!failureExamples.has(key)) {
        const ctxStart = Math.max(0, i - 2);
        const ctxEnd = Math.min(events.length, i + 1);
        failureExamples.set(key, {
          project: t.project,
          session_id: t.session_id,
          ts: e.ts,
          tool: resolved,
          error_text: err.text.slice(0, 300),
          excerpt: buildExcerpt(events.slice(ctxStart, ctxEnd))
        });
      }
    }
  }
}

// Emit repeated_failures (≥ 3× across window), skipping suppressed sigs.
for (const [key, count] of failureBuckets) {
  if (count < 3) continue;
  const ex = failureExamples.get(key);
  const sigLower = (ex?.error_text ?? '').toLowerCase();
  if (SUPPRESSED_FAILURE_SUBSTRINGS.some(s => sigLower.includes(s))) continue;
  signals.repeated_failures.push({
    kind: 'repeated_failure',
    occurrences: count,
    ...ex
  });
}

// --- Output -------------------------------------------------------------

const totals = Object.fromEntries(
  Object.entries(signals).map(([k, arr]) => [k, arr.length])
);

const output = {
  scan_window: {
    since: SINCE,
    start_iso: new Date(windowStartMs).toISOString(),
    end_iso: new Date().toISOString()
  },
  filters: {
    project: PROJECT_FILTER,
    include_sidechain: INCLUDE_SIDECHAIN
  },
  totals,
  sessions_scanned: sessionsAnalyzed,
  transcripts_seen: transcripts.length,
  signals
};

const json = JSON.stringify(output, null, 2);
if (OUT_PATH) {
  mkdirSync(dirname(OUT_PATH), {recursive: true});
  writeFileSync(OUT_PATH, json);
}
console.log(json);
