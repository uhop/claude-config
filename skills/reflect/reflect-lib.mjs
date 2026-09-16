// reflect-lib.mjs — the pure half of the /reflect scanner: pattern tables,
// the per-turn classifier, the failure-suppression list, and the small text
// helpers. No I/O, no argv, no side effects, so `reflect.test.mjs` can import
// it while `reflect.mjs` stays a flat CLI behind its import.meta.main guard.
// Every rule that decides whether a turn or an error counts lives here, and
// every change to one adds its spellings to the test's fixtures.

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
export const NEGATION_PATTERNS = [
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
export const OBSERVATIONAL_CORRECTION_PATTERNS = [
  /\bI(?:'ve| have)? noticed\b/i,
  /\bthere(?:'s| is)\s+(?:a|an)\s+(better|doc|convention|skill|way|tool|helper|rule|pattern)\b/i,
  /\binstead of\b/i,
  /\brather than\b/i,
  // The negated-auxiliary forms were missing until 2026-09-05: "Why didn't we
  // test PostGres?" (apodict 53989575, 2026-08-25) fell through a list that had
  // `don't` and `did we` but not `didn't` (reports/2026-08-25-nuke).
  /\bwhy\s+(?:don'?t|didn'?t|doesn'?t|wasn'?t|weren'?t|not|are you|did you|would you|are we|did we)\b/i,
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
export const UNLANDED_CORRECTION_PATTERNS = [
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
export const SCOPE_EXTENSION_MAX_CHARS = 160;
export const SCOPE_EXTENSION_PATTERNS = [
  /\b(?:too|as well)\s*[.!?]?\s*$/im,
  /^(?:do|fix|finish|sweep|update)\s+(?:the\s+)?(?:rest|others?|remaining|other\s+\w+)\b/im,
  /^(?:finish|and)\b[^,\n]{0,60},?\s*then\s+(?:do|fix|the)\b/im,
  /\bdid\s+you\s+(?:also\s+)?(?:fix|do|update|apply|handle|change)\b[^?\n]{0,60}\b(?:in|for|on)\b[^?\n]{1,40}\?/i
];

export const CONFIRMATION_PATTERNS = [
  /\byes,?\s*(exactly|right|that'?s right|perfect|good|correct)\b/i,
  /\b(perfect|exactly right|nailed it|spot on)\b/i,
  /\bkeep doing (that|this)\b/i,
  /\bthat'?s the (right|correct) (call|approach|move|answer)\b/i
];

export const SURPRISE_PATTERNS = [
  /\bTIL\b/,
  /\boh,?\s+(huh|wow)\b/i,
  /\b(I|we)\s+didn'?t\s+(expect|know|realize)\b/i,
  /^(that'?s|this is|how)\s+(interesting|surprising|unexpected)\b/im
];

// The bare announced-step check: "Did you <verb> …?" / "Did we …?" with no
// quoted span, as a first line. Not a correction family — a marker on the
// user-turn listing, so the reading pass sees it flagged and judges it. The
// quoted form ("did you do \"Next leg…\"?") stays with `unlanded`. Measured
// by hand across eight windows before this instrument existed: 3 of 6 were
// announced-step checks, the rest genuine questions answered from the record
// (projects/claude-config/queue, the 2026-08-25 item; instrument 2026-09-15).
export const DID_YOU_PATTERN = /^(?:did|didn'?t|have|haven'?t)\s+(?:you|we)\b.*\?\s*$/i;

// One user-authored turn → which families fire. Pass 1 of the scanner reads
// these flags; the test reads them for the fixtures, so both see one function.
// The short-turn gates read the FIRST LINE: a 34-character ask over a two-line
// paste was missed while the whole turn was measured (2026-09-11). The
// scope-extension patterns still run over the whole text when it is short,
// since "…too" may close a second line.
export const classifyUserTurn = text => {
  const head = (text ?? '').split('\n', 1)[0].trim();
  const unlanded = UNLANDED_CORRECTION_PATTERNS.some(re => re.test(text));
  return {
    negation: NEGATION_PATTERNS.some(re => re.test(text)),
    observational: OBSERVATIONAL_CORRECTION_PATTERNS.some(re => re.test(text)),
    unlanded,
    scope_extension:
      head.length <= SCOPE_EXTENSION_MAX_CHARS &&
      SCOPE_EXTENSION_PATTERNS.some(re =>
        re.test(text.length <= SCOPE_EXTENSION_MAX_CHARS ? text : head)
      ),
    did_you: !unlanded && head.length <= SCOPE_EXTENSION_MAX_CHARS && DID_YOU_PATTERN.test(head),
    confirmation: CONFIRMATION_PATTERNS.some(re => re.test(text)),
    surprise: SURPRISE_PATTERNS.some(re => re.test(text))
  };
};

// --- Text helpers -------------------------------------------------------

// Strip auto-inserted machine content (system reminders, command-message
// blocks, stdout dumps) that Claude Code interleaves with user messages.
// These are not user-authored text and must not be classified as such.
//
// A slash command is the one case where the human content is inside the tags:
// the harness writes `<command-name>/vault</command-name><command-args>wrap
// </command-args>` and then appends the whole SKILL.md after a "Base directory
// for this skill:" line. That prose is not the user's — it is full of the
// "never"/"don't" the classifier hunts for, and it reached the user-turn
// listing as a 74 KB line (2026-09-05) — so the turn collapses to its command
// line, `/vault wrap`, which is what the user typed.
export const stripSyntheticBlocks = s => {
  const command = s.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1].trim();
  const commandArgs = s.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1].trim();
  const text = stripMachineText(s);
  if (text) return text;
  return command ? [command, commandArgs].filter(Boolean).join(' ') : '';
};

const stripMachineText = s =>
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
    // A background sub-agent's hand-back arrives the same way in an
    // `<agent-message>` envelope (2026-09-15, reports/2026-09-15-nuke P2);
    // the row loop drops it on `origin.kind`, and this is the fallback for a
    // transcript without `origin`.
    .replace(
      /Another Claude session sent a message:\s*<(?:cross-session-message|agent-message)[\s\S]*/g,
      ''
    )
    // Continuation-summary turns (context-compaction handoffs) are the
    // assistant's own recap of the prior session arriving in a user-role row —
    // correction-dense by construction, since they replay the very language
    // the classifier hunts for. Anchored at turn start so a user merely
    // quoting the phrase keeps their text. (Found 2026-08-09: a summary
    // quoting a `did you check "…"` fixture re-fired it as a fresh signal.)
    .replace(/^\s*This session is being continued from a previous conversation[\s\S]*/, '')
    // The skill expansion that follows a slash command (see stripSyntheticBlocks).
    .replace(/^\s*Base directory for this skill:[\s\S]*/m, '')
    .trim();

// Error signature: the tool's own error line, with the per-run noise removed,
// whitespace-collapsed, capped and lowercased — the shape Pass 3 buckets on,
// shared so Pass 2's stuck-loop key uses the same notion of "the same error".
// Until 2026-09-15 it was the first 120 characters of the whole text, which
// put the agent's own `echo` lines and a `mktemp` path in front of the error:
// five identical jq failures signed five ways and reported `repeated_failures:
// 0` (reports/2026-09-13-nuke P1). Now: strip ANSI, normalize `/tmp/tmp.*` and
// the session scratchpad, drop the harness's `Exit code N` line and stack
// frames, then take the first line that reads as an error. With no such line
// a short text (one or two lines left) signs as its last line — a tool's
// one-line refusal — and a long one signs as '' and is not counted: a
// by-design non-zero exit (check-drift's report, a prettier summary over
// stats) has no error line and different content each run, and a last-line
// fallback over it bucketed six drift reports as one "repeated failure" on
// the first validation scan. A text that is only `Exit code N` signs as ''
// too: the harness line is identical across unrelated failures, and nine such
// results in one session bucketed as one "repeated failure" on 2026-09-12.
const ERROR_LINE =
  /(?:error|exception|cannot|can't|could ?not|couldn't|denied|not found|no such|not permitted|refused|failed|failure|blocked|invalid|unknown command|enoent|eisdir|eacces|eexist|etimedout|econnrefused)\b/i;
const NOISE_LINE = [
  /^exit code \d+$/i,
  /^traceback \(most recent call last\):?$/i,
  /^file "/i,
  /^at\s/,
  /^\^+$/
];
export const normalizeErrorText = text =>
  (text ?? '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\/tmp\/tmp\.[A-Za-z0-9]{6,}/g, '/tmp/tmp.*')
    .replace(/\/tmp\/claude-1000\/[^/\s]+\/[0-9a-f-]{36}/g, '<scratch>');
export const errorSignature = text => {
  const lines = normalizeErrorText(text)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !NOISE_LINE.some(re => re.test(l)));
  const line =
    lines.find(l => ERROR_LINE.test(l)) ?? (lines.length <= 2 ? lines[lines.length - 1] : '') ?? '';
  return line.replace(/\s+/g, ' ').slice(0, 120).toLowerCase();
};

// Known accepted-as-noise error signatures — suppressed from repeated_failures
// to keep reports actionable. Each entry resolved via /clarify with explicit
// "accept as noise" decision; pattern is the tool-internal error message
// matched as a substring, or a RegExp where the text varies, against the
// (lowercased, whitespace-collapsed, first-120-char) error signature.
//
// Don't grow this list lightly — every entry hides real-looking signal. Each
// addition should reference a clarify-queue archive entry, and add its
// spellings to reflect.test.mjs — three windows in a row patched one entry's
// spelling (2026-08-29, 08-30, 09-03) before the fixture existed.
export const SUPPRESSED_FAILURE_PATTERNS = [
  // Q-2026-05-17-001 — accepted as noise. Tool description already says
  // "must Read before Edit/Write"; recovery is one Read call.
  'file has not been read yet',
  // 2026-08-29 (reports/2026-08-29-nuke P3) — the CLAUDE.md § Background shells
  // registry probe: the error text is the enumeration, not a failure. The id is
  // whatever the agent types (probe-no-such-task, probe-none, nonexistent-probe,
  // …), so match `probe` anywhere in it (prefix 2026-08-30, reports/2026-08-30-nuke
  // P2; regex 2026-09-03, reports/2026-09-03-nuke P2), or the bare `x` the
  // rule's own example shows, which the rule now prescribes (2026-09-15,
  // reports/2026-09-15-nuke P1).
  /no task found with id: (x\b|\S*probe)/
];
export const isSuppressed = text =>
  SUPPRESSED_FAILURE_PATTERNS.some(s => (typeof s === 'string' ? text.includes(s) : s.test(text)));

// --- Session populations ------------------------------------------------

// A headless `claude -p` run writes a transcript like any other, but its
// "user" turns are a launcher's prompt: apodict's model-sensitivity arms and
// its one-turn probes counted as 14 of a window's 16 sessions on 2026-08-30
// (reports/2026-08-30-nuke P4). The discriminator is structural, not textual:
// every row of such a transcript carries `entrypoint: "sdk-cli"`, where an
// interactive session carries `"cli"` (measured 2026-09-05 over 140 transcripts
// from 30 days: 13 sdk-cli, 127 cli, no third value). An absent entrypoint is
// treated as human — the fail-open direction, since a missed automated run
// costs a noisier count while a missed human session costs a signal.
export const AUTOMATED_ENTRYPOINTS = new Set(['sdk-cli']);
export const isAutomatedEntrypoint = entrypoint =>
  typeof entrypoint === 'string' && AUTOMATED_ENTRYPOINTS.has(entrypoint);

// --- User-turn listing --------------------------------------------------

// The listing shows every human-authored turn by its first line so the agent's
// reading pass is one Read, not a jq script (the manual pass beat the
// classifier in five consecutive windows, 2026-08-25 → 09-01). Cap the FIRST
// LINE, never the turn: a short ask over a long paste is the shape most worth
// reading (2026-08-30), and a one-paragraph ruling on a single 326-character
// line must be truncated, not hidden (2026-09-04).
export const USER_TURN_LINE_MAX = 220;
export const firstLine = (text, cap = USER_TURN_LINE_MAX) => {
  const line = (text ?? '').split('\n', 1)[0].trim();
  return line.length > cap ? line.slice(0, cap - 1) + '…' : line;
};

// --- Exchange rendering -------------------------------------------------

// A moment in a transcript rendered for a human: the rows around a timestamp
// with ISO times and roles, the text the user typed and the assistant wrote,
// each tool call as one line. This is what a question or a report quotes
// (projects/agent-workflow/feedback § A question carries its context and can
// be hung, 2026-09-15); `reflect-context.mjs` is the CLI over it. A user row
// that is not the human's (`origin.kind` peer or task-notification) is left
// out, the same rule the scanner applies.
const rowTime = row => (row.timestamp ?? '').replace(/\.\d+Z$/, 'Z');
const resultBody = block =>
  typeof block.content === 'string'
    ? block.content
    : (block.content ?? [])
        .filter(s => s?.type === 'text' && typeof s.text === 'string')
        .map(s => s.text)
        .join('\n');

export const isHumanUserRow = row =>
  row?.type === 'user' && !(typeof row.origin?.kind === 'string' && row.origin.kind !== 'human');

export const renderRow = (row, {maxChars = 1500} = {}) => {
  const cap = s => (s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s);
  const c = row.message?.content;
  if (row.type === 'user') {
    if (typeof c === 'string') {
      const text = stripSyntheticBlocks(c);
      return text ? `── ${rowTime(row)} USER\n${cap(text)}` : null;
    }
    if (!Array.isArray(c)) return null;
    const texts = c
      .filter(b => b?.type === 'text' && typeof b.text === 'string')
      .map(b => stripSyntheticBlocks(b.text))
      .filter(Boolean);
    if (texts.length) return `── ${rowTime(row)} USER\n${cap(texts.join('\n'))}`;
    const results = c.filter(b => b?.type === 'tool_result');
    if (!results.length) return null;
    const lines = results.map(
      b => `[tool_result${b.is_error ? ' ERROR' : ''}] ${firstLine(resultBody(b), 160)}`
    );
    return `── ${rowTime(row)} TOOL_RESULT\n${lines.join('\n')}`;
  }
  if (row.type === 'assistant') {
    if (typeof c === 'string')
      return c.trim() ? `── ${rowTime(row)} ASSISTANT\n${cap(c.trim())}` : null;
    if (!Array.isArray(c)) return null;
    const parts = [];
    for (const b of c) {
      if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim())
        parts.push(cap(b.text.trim()));
      else if (b?.type === 'tool_use')
        parts.push(
          `[tool_use ${b.name ?? '(unknown)'}] ${firstLine(JSON.stringify(b.input ?? {}), 160)}`
        );
    }
    return parts.length ? `── ${rowTime(row)} ASSISTANT\n${parts.join('\n')}` : null;
  }
  return null;
};

// The rows around `atMs`: `before` rows earlier and `after` rows later, over
// the human and assistant rows that carry a timestamp. Returns the rendered
// text and the index of the centre row, or null when nothing is renderable.
export const renderExchange = (rows, atMs, {before = 2, after = 3, maxChars = 1500} = {}) => {
  const usable = rows.filter(r => r?.timestamp && (r.type === 'assistant' || isHumanUserRow(r)));
  if (!usable.length) return null;
  const at = Number(atMs);
  let centre = 0;
  let best = Infinity;
  usable.forEach((r, i) => {
    const d = Math.abs(Date.parse(r.timestamp) - at);
    if (d < best) {
      best = d;
      centre = i;
    }
  });
  const slice = usable.slice(Math.max(0, centre - before), centre + after + 1);
  const text = slice
    .map(r => renderRow(r, {maxChars}))
    .filter(Boolean)
    .join('\n');
  return {text, centre, first: usable.find(isHumanUserRow) ?? null};
};
