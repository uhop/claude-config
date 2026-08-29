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

// --- Pattern library ----------------------------------------------------

// The don't/stop/never patterns deliberately carry no action-verb list: three
// runs (2026-08-02 ×2, 2026-08-03) showed corrections about state, perception,
// or prior discussion ("I don't mind…", "I don't see hA5-grid", "I don't like
// it") falling through closed verb lists. Recall-over-precision, same tradeoff
// as OBSERVATIONAL below; measured 2026-08-09 over 30 days: 63 → 163 correction
// firings, 51 of the 100 new ones real — including previously invisible sharp
// corrections ("stop creating excuses", "Never print it again", "don't import
// random files"). Noise is epistemic prose ("I don't know/think") the dedupe
// step drops; verb exclusions tested lossy (real corrections fire only via
// "don't think" turns), and a prev-assistant-tool_use gate doesn't
// discriminate (82/100 new firings, real ones included, follow text turns).
const NEGATION_PATTERNS = [
  /\bno+,?\s+(don'?t|stop|not)\b/i,
  /\bdon'?t\s+\w+/i,
  /\bstop\s+\w+ing\b/i,
  /\bnever\s+\w+/i,
  /\bplease\s+don'?t\b/i,
  /\bwe\s+don'?t\s+(do|use)\s+(that|this|it)\b/i,
  /\bthat'?s?\s+(wrong|not right|not what)\b/i,
  /\bnot\s+(that|this)\s+(way|one|approach)\b/i
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
  // Sentence-final bare "Why?" — the form actually used to open a challenge
  // ("…yet we never talked about it. Why?"); the pattern above requires an
  // interrogative immediately after "why", so it never matched (2026-08-02).
  /(?:^|[.!?\n])\s*why\s*\?/im
];

// "Still" corrections: the user reporting that a correction already given has
// not landed. Structurally the highest-value signal here — the turn *is* the
// second occurrence, so one hit already meets the recurrence bar — and blind to
// both families above: no negation cue, no closed verb list. Anchored on second
// person, an interrogative, a negation, or a quoted artifact so ordinary
// concessive "still" stays out; "we still" alone is deliberately NOT a cue
// ("we still need a list", "do we still need overrides" are planning talk, and
// were most of the false positives when it was included). Measured over 30 days
// of transcripts: 59 turns contain "still", these fire on 10, of which 9 are
// real (the survivor is a "why we still" buried in a long anecdote) — acceptable
// under the same recall-over-precision tradeoff as OBSERVATIONAL above.
const UNLANDED_CORRECTION_PATTERNS = [
  /\byou\b(?:'re|'ve|\s+(?:are|were|have|had|do|did|keep))?\s+still\b/i,
  /\bwhy\s+(?:\w+\s+){0,3}still\b/i,
  /\bstill\s+(?:\w+\s+)?(?:not|no\b|don'?t|doesn'?t|does not|isn'?t|is not|didn'?t|hasn'?t|haven'?t|won'?t|can'?t|cannot)\b/i,
  // quoted artifact + "still <verb>": the quotes carry the specificity, so this
  // needs no verb list — "'// null -> Do stops' still wraps."
  /["'`][^"'`\n]{3,80}["'`]\s+still\s+\w+/i,
  /\bI\s+still\s+(?:see|notice|find|get|have)\b/i,
  /\bI\s+(?:see|notice|find)\b[^.!?\n]{0,40}\bstill\b/i,
  // Quoted follow-up: `did you <verb>` + a quoted span is the user replaying a
  // commitment ("did you do \"Next leg: …\"?"). The quotes carry the
  // specificity — bare "did you push?" chatter stays out. Measured 2026-08-09
  // over 30 days: 16 `did you` user turns, fires on 2, both real (the third
  // hit was a continuation-summary turn, now stripped as synthetic).
  /\bdid\s+you\s+(?:do|check|handle|finish|address)\b[^"'`\n]{0,40}["'`][^"'`\n]{3,}["'`]/i
];

// Scope extensions: a short user turn that appends a sibling target to a fix
// just reported done — "fix the trailer too", "do the other two drafts' dashes
// too", "do the rest", "finish wiki-search, then do double-meh", "Did you fix
// the bail-out bug in browser?". No corrective vocabulary at all, which is why
// the two richest transcripts of the 2026-08-16 run scored zero while carrying
// the whole "fix the class" finding, and why the same shape scored zero again
// on 2026-08-18. Gated on turn length (SCOPE_EXTENSION_MAX_CHARS) so content
// turns that merely end in "too" stay out. Measured 2026-08-18 over 30 days on
// nuke: 1,780 user turns, the tail-"too" cue fires on 36 (~28 real; the misses
// are planning talk — "Node started to work on it too"), the three companions
// on 4 more, all real. Recall-over-precision, same footing as OBSERVATIONAL.
// A cluster of these in one session is direct evidence for CLAUDE.md § Fix the
// class — the flag rides along so step 4 can count it.
const SCOPE_EXTENSION_MAX_CHARS = 160;
const SCOPE_EXTENSION_PATTERNS = [
  /\b(?:too|as well)\s*[.!?]?\s*$/im,
  /^(?:do|fix|finish|sweep|update)\s+(?:the\s+)?(?:rest|others?|remaining|other\s+\w+)\b/im,
  /^(?:finish|and)\b[^,\n]{0,60},?\s*then\s+(?:do|fix|the)\b/im,
  /\bdid\s+you\s+(?:also\s+)?(?:fix|do|update|apply|handle|change)\b[^?\n]{0,60}\b(?:in|for|on)\b[^?\n]{1,40}\?/i
];

const CONFIRMATION_PATTERNS = [
  /\byes,?\s*(exactly|right|that'?s right|perfect|good|correct)\b/i,
  /\b(perfect|exactly right|nailed it|spot on)\b/i,
  /\bkeep doing (that|this)\b/i,
  /\bthat'?s the (right|correct) (call|approach|move|answer)\b/i
];

const SURPRISE_PATTERNS = [
  /\bTIL\b/,
  /\boh,?\s+(huh|wow)\b/i,
  /\b(I|we)\s+didn'?t\s+(expect|know|realize)\b/i,
  /^(that'?s|this is|how)\s+(interesting|surprising|unexpected)\b/im
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
    // Peer traffic from another Claude session (SendMessage): preamble,
    // envelope and harness trailer are all machine-authored, and the
    // trailer's own "never …" wording fires the patterns, so the whole
    // turn goes. Requires the envelope to follow the preamble, so a user
    // quoting the phrase keeps their text.
    .replace(/Another Claude session sent a message:\s*<cross-session-message[\s\S]*/g, '')
    // Continuation-summary turns (context-compaction handoffs) are the
    // assistant's own recap of the prior session arriving in a user-role row —
    // correction-dense by construction, since they replay the very language
    // the classifier hunts for. Anchored at turn start so a user merely
    // quoting the phrase keeps their text. (Found 2026-08-09: a summary
    // quoting a `did you check "…"` fixture re-fired it as a fresh signal.)
    .replace(/^\s*This session is being continued from a previous conversation[\s\S]*/, '')
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

// Error signature: whitespace-collapsed, truncated, lowercased — the shape
// Pass 3 buckets on, shared so Pass 2's stuck-loop key uses the same notion
// of "the same error".
const errorSignature = text => (text ?? '').replace(/\s+/g, ' ').slice(0, 120).toLowerCase();

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
  'file has not been read yet',
  // 2026-08-29 (reports/2026-08-29-nuke P3) — the CLAUDE.md § Background shells
  // registry probe: the error text is the enumeration, not a failure.
  'no task found with id: probe-no-such-task'
];

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
    const hasUnlanded = UNLANDED_CORRECTION_PATTERNS.some(re => re.test(text));
    const hasScopeExtension =
      text.length <= SCOPE_EXTENSION_MAX_CHARS &&
      SCOPE_EXTENSION_PATTERNS.some(re => re.test(text));
    const hasConfirmation = CONFIRMATION_PATTERNS.some(re => re.test(text));
    const hasSurprise = SURPRISE_PATTERNS.some(re => re.test(text));

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
  if (SUPPRESSED_FAILURE_SUBSTRINGS.some(s => sigLower.includes(s))) continue;
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
    include_sidechain: INCLUDE_SIDECHAIN
  },
  totals,
  sessions_scanned: sessionsAnalyzed,
  transcripts_seen: transcripts.length,
  prior_report: priorReport,
  live_sessions: liveSessions,
  state_watermark_iso: new Date(Math.min(scanMs, ...liveFloorsMs)).toISOString(),
  session_git: sessionGit,
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
