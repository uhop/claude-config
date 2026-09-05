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
//   reflect.mjs --include-automated          # analyze headless `claude -p` transcripts (sdk-cli) too
//   reflect.mjs --max-excerpt-chars N        # cap each excerpt (default 800)

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync
} from 'node:fs';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {correlateSession} from '../process-review/git-correlate.mjs';
import {
  classifyUserTurn,
  stripSyntheticBlocks,
  errorSignature,
  isSuppressed,
  isAutomatedEntrypoint,
  firstLine
} from './reflect-lib.mjs';

if (!import.meta.main)
  throw new Error(
    'reflect.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

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
const INCLUDE_AUTOMATED = opt('--include-automated', false) === true;
const MAX_EXCERPT = Number(opt('--max-excerpt-chars', '800'));

const STATE_FILE = join(homedir(), '.cache', 'reflect', 'last-run.json');

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

// Previous report ref for this host, written into the cache by
// reflect-state.mjs step 9. Surfaced as `prior_report` so the carried-forward
// resolution step cannot be skipped by omission — a deferral noted only in a
// report body is write-only (2026-08-09: two deferrals checked two months
// later — one silently dropped, one accidentally re-derived seven weeks late).
const priorReport = (() => {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')).report ?? null;
  } catch {
    return null;
  }
})();

// The pattern library, the per-turn classifier, the failure-suppression list
// and the text helpers live in ./reflect-lib.mjs (pure, pinned by
// reflect.test.mjs). This file is the walk, the passes and the output.

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

// A transcript whose mtime is within LIVE_WINDOW of the scan is still being
// written — its tail is not yet on disk, so analyzing it silently under-reports
// (silent-empty-result-ambiguity, producer side). Skip + surface it loudly so a
// missed live session can't read as a genuinely quiet window.
const scanMs = Date.now();
const LIVE_WINDOW_MS = Number(opt('--live-window-secs', '120')) * 1000;
const liveSessions = [];
// Floor for state_watermark_iso: the next run's window must start at or before
// the earliest row of any session we skipped, or those rows land before
// windowStartMs and get dropped at the row filter below — a skipped session
// silently becoming an unreachable one.
const liveFloorsMs = [];

// First user/assistant row timestamp, read from the head of the file rather
// than the whole transcript (these run to tens of MB). null when undetermined.
const firstRowMs = fp => {
  let fd;
  try {
    fd = openSync(fp, 'r');
    const buf = Buffer.alloc(65536);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const lines = buf.subarray(0, n).toString('utf8').split('\n');
    if (n === buf.length) lines.pop(); // last line may be truncated mid-JSON
    for (const line of lines) {
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.type !== 'user' && row.type !== 'assistant') continue;
      if (row.timestamp) return Date.parse(row.timestamp);
    }
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return null;
};

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
    // A user-role row with no typed text is a tool_result carrier — label it
    // honestly, or excerpt readers attribute tool output to the user (the
    // 2026-07-27 misdiagnosis blamed three signals on `USER:`-rendered rows).
    const prefix = e.role !== 'user' ? 'ASSISTANT' : e.userText ? 'USER' : 'TOOL_RESULT';
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
  surprises: [],
  multi_release: []
};

// Per-session git correlation (Pass 4), reported alongside the signals so a
// reader can see which sessions produced commits and which were talk only.
const sessionGit = [];

// Headless transcripts (entrypoint sdk-cli) are listed, not analyzed, unless
// --include-automated: their "user" turns are a launcher's prompt, and Pass 4
// would attribute the launcher's commits to them (reports/2026-08-30-nuke P4).
const automatedSessions = [];

// Every human-authored turn of every analyzed session, by first line — the
// agent's reading pass (see reflect-lib.mjs § User-turn listing).
const userTurns = [];

// Repeated-failure detection works across sessions: aggregate (toolName, errorSig) → count
const failureBuckets = new Map();
const failureExamples = new Map();

let sessionsAnalyzed = 0;

for (const t of transcripts) {
  if (scanMs - t.mtime < LIVE_WINDOW_MS) {
    const firstMs = firstRowMs(t.path);
    liveSessions.push({
      project: t.project,
      session_id: t.session_id,
      path: t.path,
      mtime_iso: new Date(t.mtime).toISOString(),
      age_seconds: Math.round((scanMs - t.mtime) / 1000),
      first_row_iso: firstMs === null ? null : new Date(firstMs).toISOString()
    });
    // undetermined first row → don't advance at all for this session
    liveFloorsMs.push(firstMs === null ? windowStartMs : firstMs);
    continue;
  }
  let content;
  try {
    content = readFileSync(t.path, 'utf8');
  } catch {
    continue;
  }

  const events = [];
  // toolUseIdsByEvent[i] = list of {id, name} emitted by event i so we can
  // map tool_result_id → tool name regardless of how they're interleaved.
  // id → {name, batch}. `batch` is the logical turn that emitted the tool_use
  // (see turnSeq below), so Pass 3 can tell parallel calls from one turn apart
  // from sequential retries across turns.
  const toolUseRegistry = new Map();
  let turnSeq = 0;
  let entrypoint = null;
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
    if (entrypoint === null && row.type === 'user' && typeof row.entrypoint === 'string') {
      entrypoint = row.entrypoint;
    }
    const ts = row.timestamp ? Date.parse(row.timestamp) : null;
    if (ts && ts < windowStartMs) continue;
    // Parallel tool calls are NOT one row: the transcript streams each
    // tool_use as its own assistant row, seconds apart, so neither the row nor
    // the tool_result grouping recovers the batch. What does is contiguity —
    // a run of consecutive assistant rows with no user row between them is one
    // logical turn. Bumping on every user row keeps genuine retries distinct,
    // since those are always separated by their own error result.
    if (row.type === 'user') turnSeq++;
    const f = flatten(row);
    // Register tool_use ids → names for later tool_result name lookup
    const content2 = row.message?.content;
    if (Array.isArray(content2)) {
      for (const block of content2) {
        if (block?.type === 'tool_use' && block.id && block.name) {
          toolUseRegistry.set(block.id, {name: block.name, batch: turnSeq});
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
      turn: turnSeq,
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
  if (!INCLUDE_AUTOMATED && isAutomatedEntrypoint(entrypoint)) {
    const first = events.find(e => e.role === 'user' && e.userText);
    automatedSessions.push({
      project: t.project,
      session_id: t.session_id,
      entrypoint,
      rows: events.length,
      first_turn: firstLine(first?.userText ?? '', 80)
    });
    continue;
  }
  sessionsAnalyzed++;

  // Pass 1: corrections + confirmations + surprises — scan user-authored
  // text only. Synthetic blocks (system reminders, command messages) have
  // already been stripped by flatten(), so userText is the real signal.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.role !== 'user' || !e.userText || e.userText.length < 3) continue;

    const text = e.userText;
    const prevAssistant = i > 0 && events[i - 1].role === 'assistant';
    const fired = classifyUserTurn(text);
    const hasNegation = fired.negation;
    const hasObservational = fired.observational;
    const hasUnlanded = fired.unlanded;
    const hasScopeExtension = fired.scope_extension;
    const hasConfirmation = fired.confirmation;
    const hasSurprise = fired.surprise;

    if (
      !hasNegation &&
      !hasObservational &&
      !hasUnlanded &&
      !hasScopeExtension &&
      !hasConfirmation &&
      !hasSurprise
    )
      continue;

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

    // `unlanded` rides along so step 4 can score one hit as recurrence: the
    // user saying "you still…" is telling you this is the second time.
    // `scope_extension` rides along so step 4 can count a cluster of them.
    if ((hasNegation || hasObservational || hasUnlanded || hasScopeExtension) && prevAssistant)
      signals.corrections.push({
        ...base,
        kind: 'correction',
        ...(hasUnlanded && {unlanded: true}),
        ...(hasScopeExtension && {scope_extension: true})
      });
    if (hasConfirmation && prevAssistant)
      signals.confirmations.push({...base, kind: 'confirmation'});
    if (hasSurprise) signals.surprises.push({...base, kind: 'surprise'});
  }

  // Pass 2: stuck loops — same (toolName + input fingerprint + error
  // signature) repeated ≥ 3×, counting only repetitions whose tool_result
  // came back is_error: true. The error gate kills the iterative-test-runs
  // false-positive class: a refactor → `npm test` → fix → `npm test` cycle
  // issues identical inputs many times, but those runs succeed — progress,
  // not a pathological retry. The error signature in the key kills the
  // by-design-nonzero class: a status probe (check-drift exits 1 on drift)
  // returns different content each run, while a genuine stuck loop replays
  // the same error verbatim (2026-08-05, from the 13× check-drift FP).
  const erroredSigs = new Map(); // tool_use_id → error signature
  for (const e of events) {
    for (const err of e.errorResults) {
      if (err.id) erroredSigs.set(err.id, errorSignature(err.text));
    }
  }
  const loopBuckets = new Map();
  const loopTurns = new Map(); // key → Set of turns already counted
  for (const e of events) {
    if (e.role !== 'assistant') continue;
    for (let j = 0; j < e.toolNames.length; j++) {
      if (!erroredSigs.has(e.toolUseIds[j])) continue;
      const name = e.toolNames[j];
      const fp = inputFingerprint(e.toolInputs[j]);
      const key = `${name}::${fp}::${erroredSigs.get(e.toolUseIds[j])}`;
      const arr = loopBuckets.get(key) ?? [];
      // Parallel calls sharing a fingerprint are one attempt, not N retries,
      // and they stream as separate assistant rows with distinct timestamps —
      // so dedupe on the logical turn, not on `ts`. Same rationale as Pass 3.
      const seen = loopTurns.get(key) ?? new Set();
      if (!seen.has(e.turn)) {
        seen.add(e.turn);
        loopTurns.set(key, seen);
        arr.push(e.ts);
      }
      loopBuckets.set(key, arr);
    }
  }
  for (const [key, tsList] of loopBuckets) {
    if (tsList.length < 3) continue;
    const keyLower = key.toLowerCase();
    if (isSuppressed(keyLower)) continue;
    const [name] = key.split('::', 1);
    signals.stuck_loops.push({
      kind: 'stuck_loop',
      project: t.project,
      session_id: t.session_id,
      ts: tsList[0],
      tool: name,
      repetitions: tsList.length,
      excerpt: `[stuck loop] tool=${name} repeated ${tsList.length}× with same input fingerprint, erroring identically each time`
    });
  }

  // Pass 3: cross-session error aggregation. One bucket per (tool, errSig)
  // built from the actual is_error tool_result text — not concatenated
  // with adjacent successes.
  // Per-transcript: `batch` values are indices into this transcript's events.
  const countedBatches = new Set();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.role !== 'user' || e.errorResults.length === 0) continue;
    for (const err of e.errorResults) {
      const reg = err.id ? toolUseRegistry.get(err.id) : null;
      const resolved = reg?.name ?? (i > 0 ? events[i - 1]?.toolNames?.[0] : null) ?? '(unknown)';
      const errSig = errorSignature(err.text);
      const key = `${resolved}::${errSig}`;
      // Parallel calls fail as a unit: one permission rejection or one
      // cancelled batch is a single decision, but its N results arrive as N
      // separate user events, so per-event counting does not catch it. Dedupe
      // on the assistant turn that issued the calls — same turn, same batch,
      // one occurrence; a genuine retry comes from a later turn and still
      // counts. Without this, one decision clears the ≥3 threshold and reaches
      // `high` confidence on recurrence that never happened. (Origin: reflect
      // 2026-07-20 — one accidental rejection of six parallel Agent calls
      // reported occurrences: 6.)
      const batchKey = `${reg?.batch ?? `evt${i}`}::${key}`;
      if (countedBatches.has(batchKey)) continue;
      countedBatches.add(batchKey);
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

  // Pass 4: git correlation. Transcripts say what was asked; git says what
  // landed. Joining them turns a textual signal into a causal one — a commit
  // whose driving turn was a correction is rework, and two releases inside one
  // session is the cadence rule firing. Fails open: no repo, no git, no
  // correlation — never an error, since most of the value is elsewhere.
  const sessionStartMs = events[0].ts;
  const sessionEndMs = events[events.length - 1].ts;
  const correctionTs = new Set(
    signals.corrections.filter(c => c.session_id === t.session_id).map(c => c.ts)
  );

  // The user-turn listing. `adjacent`: only assistant text between this turn
  // and the previous human one — a reply with no tool call, so the two turns
  // are a quick exchange (a cluster). `correction`: the classifier already
  // fired here, so the unmarked turns are the reading.
  let prevHuman = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.role !== 'user' || !e.userText) continue;
    const between = prevHuman >= 0 ? events.slice(prevHuman + 1, i) : [];
    const adjacent =
      between.length > 0 && between.every(x => x.role === 'assistant' && !x.hasToolUse);
    userTurns.push({
      project: t.project,
      session_id: t.session_id,
      ts: e.ts,
      first_line: firstLine(e.userText),
      chars: e.userText.length,
      ...(adjacent && {adjacent: true}),
      ...(correctionTs.has(e.ts) && {correction: true})
    });
    prevHuman = i;
  }

  const turns = events
    .filter(e => e.role === 'user' && e.userText)
    .map(e => ({ts: e.ts, text: e.userText, isCorrection: correctionTs.has(e.ts)}));

  let git = {repo: null, commits: [], correction_driven: 0, multi_release: null};
  try {
    git = correlateSession(t.project, sessionStartMs, sessionEndMs, turns);
  } catch {
    // correlation is enrichment; a broken repo must not fail the scan
  }

  sessionGit.push({
    project: t.project,
    session_id: t.session_id,
    start_iso: new Date(sessionStartMs).toISOString(),
    end_iso: new Date(sessionEndMs).toISOString(),
    repo: git.repo,
    commits: git.commits.length,
    correction_driven_commits: git.correction_driven ?? 0,
    shas: git.commits.map(c => c.sha)
  });

  if (git.multi_release) {
    signals.multi_release.push({
      kind: 'multi_release',
      project: t.project,
      session_id: t.session_id,
      repo: git.repo,
      ts: sessionStartMs,
      ...git.multi_release,
      note:
        'More than one release in a single session. Possible, but it should be the ' +
        'exception — usually a critical bug surfaced, or the first release was cut ' +
        'early. Known-legitimate case: publishing to debug a dependent repo, which ' +
        'is itself a process gap (link the package locally instead). See ' +
        'topics/semver-and-release-cadence § Release timing.'
    });
  }
}

// Emit repeated_failures (≥ 3× across window), skipping suppressed sigs.
for (const [key, count] of failureBuckets) {
  if (count < 3) continue;
  const ex = failureExamples.get(key);
  const sigLower = (ex?.error_text ?? '').toLowerCase();
  if (isSuppressed(sigLower)) continue;
  signals.repeated_failures.push({
    kind: 'repeated_failure',
    occurrences: count,
    ...ex
  });
}

// --- Output -------------------------------------------------------------

const totals = Object.fromEntries(Object.entries(signals).map(([k, arr]) => [k, arr.length]));

const output = {
  scan_window: {
    since: SINCE,
    start_iso: new Date(windowStartMs).toISOString(),
    end_iso: new Date(scanMs).toISOString()
  },
  filters: {
    project: PROJECT_FILTER,
    include_sidechain: INCLUDE_SIDECHAIN,
    include_automated: INCLUDE_AUTOMATED
  },
  totals,
  sessions_scanned: sessionsAnalyzed,
  automated: {
    count: automatedSessions.length,
    included: INCLUDE_AUTOMATED,
    sessions: automatedSessions
  },
  transcripts_seen: transcripts.length,
  prior_report: priorReport,
  live_sessions: liveSessions,
  state_watermark_iso: new Date(Math.min(scanMs, ...liveFloorsMs)).toISOString(),
  session_git: sessionGit,
  user_turns: userTurns,
  signals
};

if (liveSessions.length > 0) {
  process.stderr.write(
    `WARNING: ${liveSessions.length} live session(s) skipped — transcript still ` +
      `being written, tail not yet on disk. Re-run /reflect after they close:\n` +
      liveSessions
        .map(s => `  - ${s.project}/${s.session_id} (updated ${s.age_seconds}s ago)`)
        .join('\n') +
      `\nStep 9 MUST pass --watermark="${output.state_watermark_iso}" — advancing ` +
      `past these sessions puts their already-written rows before the next ` +
      `window start, where the row filter drops them.\n`
  );
}

const json = JSON.stringify(output, null, 2);
if (OUT_PATH) {
  mkdirSync(dirname(OUT_PATH), {recursive: true});
  writeFileSync(OUT_PATH, json);
}
console.log(json);
