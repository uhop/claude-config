#!/usr/bin/env node
// Jev arm on the reflect marker (2026-09-22): can a System One model carry the
// turn classification `reflect.mjs` does with regexes — a correction, a
// withheld deliverable, a sibling the fix missed — over one engineer turn with
// the agent's words around it? Population: every human turn of a `reflect.mjs
// --since=2026-08-25` scan (scan.json, 129 sessions). Labels: every turn a
// reflect report cited since that date, by epoch or by session and minute, as
// `signal`, the reports' "False positives" as `fp`, and hand labels for the
// withheld class written before any answer was seen (labels.json). Floor: the
// scanner's own `correction` cue on the same turns. Private repositories
// (apodict, blog-hugo, articles; `gh api repos/… .private`, 2026-09-22) are
// built and never sent unless `--all` says so.
//
//   node run.mjs build --scan scan.json                → states.json
//   node run.mjs ask --arm before|after [--all] [--limit N] → responses-<arm>.json (needs TYPESAFE_API_KEY)
//   node run.mjs score --arm before|after              → score-<arm>.json + a summary
import {readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {asHumanRow, isHumanUserRow, stripSyntheticBlocks} from '../reflect-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const flag = n => args.includes(n);

const MODEL = 'jev-latest';
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const PRICE_PER_INPUT_TOKEN = 0.042 / 1e6;
const CONCURRENCY = 6;
const THRESHOLDS = [0.5, 0.7, 0.9];
const ARMS = ['before', 'after', 'rule'];
const PRIVATE = new Set([
  '-home-eugene-Open-apodict',
  '-home-eugene-Open-blog-hugo',
  '-home-eugene-Open-articles'
]);
const TURN_MAX = 1500;
const BEFORE_MAX = 700;
const AFTER_MAX = 500;

const DOCUMENT =
  'a transcript of a working session in which a software engineer directs a coding agent; the agent builds, measures, and reports, and the engineer replies in short messages, often typed while the agent works';

// Every criterion is a POSITIVE description of the class: a negatively phrased
// criterion collapsed to 0.23 recall in the apodict run of 2026-09-17.
const QUESTIONS = {
  corrects: {
    type: 'noul',
    instructions:
      'Is the engineer telling the agent that something in its last work, claim, or plan is wrong or off target?',
    criteria: {
      true: 'The engineer names something the agent did, said, or proposed as mistaken, misread, overdone, or the wrong approach — a disagreement, a "no", an "I still see", a "why did you", a redirect to do it differently — so the agent has to change course',
      false:
        'The engineer answers a question the agent asked, supplies domain knowledge or history, approves, gives a go-ahead or the next task, or asks a question about the domain'
    }
  },
  withheld: {
    type: 'noul',
    instructions:
      "Is the engineer asking for something the agent's last report should already have contained?",
    criteria: {
      true: 'The engineer asks for a property of the work just reported that the agent can give without new work — its name, a title for the commit, a count, a path or link, what a term the agent coined means, the next step — such as "What is the short name of arc 4?", "What is Arc 1 for the commit message?", "Give me the full URL"',
      false:
        'The engineer asks about the domain, the code, or a concept the agent did not coin, asks for new work, gives a ruling, or acknowledges'
    }
  },
  sibling: {
    type: 'noul',
    instructions:
      'Is the engineer asking the agent to apply the change it just made to another place it left out?',
    criteria: {
      true: 'The engineer names another file, case, branch, host, or document that the same fix should reach — "fix the trailer too", "do the other two", "and the per-test line", "did you fix it in the browser version?" — so the fix was incomplete',
      false: 'The engineer asks for a different task, approves, discusses, or asks a question'
    }
  }
};
// Arm `rule` (the one-change follow-up, written after the first two arms were
// scored): the reports cite preferences and standing rules far more often than
// corrections, and neither criterion above names that class.
const RULE = {
  rule: {
    type: 'noul',
    instructions:
      'Is the engineer stating how they want the agent to work, beyond the task at hand?',
    criteria: {
      true: 'The engineer states a preference, a standing rule, a house convention, or a criticism of a habit that should hold from now on — "I don\'t put much comments in my code", "in my code I avoid var completely", "I like less fluff", "we should audit our use of custom errors", "when stopping, present me with a short description" — whether or not this task triggered it',
      false:
        'The engineer gives an instruction for this task only, answers a question, supplies facts, approves, or asks something'
    }
  }
};
const questionsFor = arm => (arm === 'rule' ? {...QUESTIONS, ...RULE} : QUESTIONS);
const FAMILIES = Object.keys(QUESTIONS);

const cap = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const tail = (s, n) => (s.length > n ? '…' + s.slice(-(n - 1)) : s);

const textOfUser = row => {
  const c = row.message?.content;
  if (typeof c === 'string') return stripSyntheticBlocks(c).trim();
  if (!Array.isArray(c)) return '';
  return c
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => stripSyntheticBlocks(b.text))
    .filter(Boolean)
    .join('\n')
    .trim();
};
const textOfAssistant = row => {
  const c = row.message?.content;
  if (!Array.isArray(c)) return '';
  return c
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();
};

// a slash command, a context dump, a harness message, or a bare acknowledgement is not steering
const SKIP =
  /^(?:\/|## Context Usage|\[Request interrupted|The previous response failed|<local-command)/;

const build = () => {
  const scan = JSON.parse(readFileSync(opt('--scan', join(here, 'scan.json')), 'utf8'));
  const bySession = new Map();
  for (const t of scan.user_turns) {
    const k = `${t.project}/${t.session_id}`;
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k).push(t);
  }
  const states = [];
  let skipped = 0;
  for (const [k, turns] of bySession) {
    const [project, session] = k.split('/');
    const path = join(homedir(), '.claude', 'projects', project, `${session}.jsonl`);
    let rows;
    try {
      rows = readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => {
          try {
            return asHumanRow(JSON.parse(l));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      continue;
    }
    const want = new Map(turns.map(t => [t.ts, t]));
    for (let i = 0; i < rows.length; ++i) {
      const row = rows[i];
      if (!isHumanUserRow(row) || !row.timestamp) continue;
      const ts = Date.parse(row.timestamp);
      const t = want.get(ts);
      if (!t) continue;
      want.delete(ts);
      const text = textOfUser(row);
      let before = '';
      for (let j = i - 1; j >= 0 && !before; --j)
        if (rows[j].type === 'assistant') before = textOfAssistant(rows[j]);
      let after = '';
      for (let j = i + 1; j < rows.length && !after; ++j) {
        if (isHumanUserRow(rows[j]) && textOfUser(rows[j])) break;
        if (rows[j].type === 'assistant') after = textOfAssistant(rows[j]);
      }
      const skip = !text || text.length < 12 || SKIP.test(text);
      if (skip) ++skipped;
      states.push({
        id: `${project}|${session.slice(0, 8)}|${ts}`,
        ts,
        project,
        session: session.slice(0, 8),
        ts_iso: t.ts_iso,
        private: PRIVATE.has(project),
        skip,
        regex: {
          correction: !!t.correction,
          scope_extension: !!t.scope_extension,
          did_you: !!t.did_you,
          queued: !!t.queued
        },
        state: {
          message: cap(text, TURN_MAX),
          before: tail(before, BEFORE_MAX),
          after: cap(after, AFTER_MAX)
        }
      });
    }
    if (want.size)
      process.stderr.write(
        `  ${k.slice(0, 40)}: ${want.size} turn(s) not found in the transcript\n`
      );
  }
  if (new Set(states.map(s => s.id)).size !== states.length)
    throw new Error('state ids are not unique');
  writeFileSync(
    join(here, 'states.json'),
    JSON.stringify({model: MODEL, questions: QUESTIONS, document: DOCUMENT, states})
  );
  const n = states.length;
  const pub = states.filter(s => !s.private);
  const askable = states.filter(s => !s.skip);
  process.stdout.write(
    `${n} states from ${bySession.size} sessions; ${skipped} skipped as non-steering; askable ${askable.length} (public ${pub.filter(s => !s.skip).length}, private ${askable.length - pub.filter(s => !s.skip).length})\n`
  );
};

const stateFor = (s, arm) => {
  const st = {
    document: DOCUMENT,
    agent_last_words: s.state.before,
    engineer_message: s.state.message
  };
  if (arm !== 'before') st.agent_reply_start = s.state.after;
  return st;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const askOne = async (key, state, questions) => {
  const body = JSON.stringify({state, model: MODEL, questions});
  let delay = 500;
  for (let attempt = 0; ; ++attempt) {
    const t0 = performance.now();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
      body
    });
    const ms = performance.now() - t0;
    const text = await res.text();
    if (res.ok) return {status: res.status, ms, response: JSON.parse(text)};
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(delay);
      delay *= 2;
      continue;
    }
    return {status: res.status, ms, error: text.slice(0, 2000)};
  }
};
const compact = r =>
  r.response
    ? {
        status: r.status,
        ms: Math.round(r.ms),
        version: r.response.model,
        answers: Object.fromEntries(
          Object.entries(r.response.answers ?? {}).map(([f, a]) => [f, a.noul])
        ),
        tokens: r.response.usage?.input_tokens ?? 0
      }
    : r;

const ask = async () => {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    process.stderr.write('TYPESAFE_API_KEY is not set\n');
    process.exit(2);
  }
  const arm = opt('--arm', 'before');
  if (!ARMS.includes(arm)) throw new Error(`unknown --arm ${arm}`);
  const {states} = JSON.parse(readFileSync(join(here, 'states.json'), 'utf8'));
  const all = flag('--all');
  const todo = states
    .filter(s => !s.skip && (all || !s.private))
    .slice(0, Number(opt('--limit', states.length)));
  const out = new Array(todo.length);
  let next = 0,
    done = 0;
  const wall0 = performance.now();
  const worker = async () => {
    for (let i; (i = next++) < todo.length;) {
      out[i] = {
        id: todo[i].id,
        ...compact(await askOne(key, stateFor(todo[i], arm), questionsFor(arm)))
      };
      if (++done % 200 === 0) process.stderr.write(`  ${done}/${todo.length}\n`);
    }
  };
  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  const wall = performance.now() - wall0;
  writeFileSync(
    join(here, `responses-${arm}.json`),
    JSON.stringify({model: MODEL, arm, all, wall_ms: wall, concurrency: CONCURRENCY, results: out})
  );
  const ok = out.filter(r => r.answers);
  const tokens = ok.reduce((a, r) => a + r.tokens, 0);
  const lat = ok.map(r => r.ms).sort((a, b) => a - b);
  const pct = p => lat[Math.min(lat.length - 1, Math.floor((lat.length * p) / 100))];
  process.stdout.write(
    `arm ${arm}${all ? ' (all sessions)' : ' (public sessions)'}: asked ${out.length}, ok ${ok.length}, errors ${out.length - ok.length}\n` +
      `wall ${(wall / 1000).toFixed(1)}s at concurrency ${CONCURRENCY}; latency p50 ${pct(50) | 0}ms p95 ${pct(95) | 0}ms max ${lat[lat.length - 1] | 0}ms\n` +
      `input tokens ${tokens}, cost $${(tokens * PRICE_PER_INPUT_TOKEN).toFixed(4)}\n`
  );
  const errs = out.filter(r => !r.answers).slice(0, 3);
  for (const e of errs)
    process.stdout.write(`  error ${e.status}: ${String(e.error).slice(0, 200)}\n`);
};

const rate = (hits, n) => (n ? +(hits / n).toFixed(3) : null);

const score = () => {
  const arm = opt('--arm', 'before');
  const {states} = JSON.parse(readFileSync(join(here, 'states.json'), 'utf8'));
  const {labels} = JSON.parse(readFileSync(join(here, 'labels.json'), 'utf8'));
  const {results, wall_ms, all} = JSON.parse(
    readFileSync(join(here, `responses-${arm}.json`), 'utf8')
  );
  const byId = new Map(results.filter(r => r.answers).map(r => [r.id, r.answers]));
  const rows = states
    .filter(s => byId.has(s.id))
    .map(s => ({...s, p: byId.get(s.id), lab: labels[String(s.ts)] ?? null}));
  const pos = rows.filter(r => r.lab?.label === 'signal');
  const fps = rows.filter(r => r.lab?.label === 'fp');
  const wpos = rows.filter(r => r.lab?.withheld === true);
  const wneg = rows.filter(r => r.lab?.withheld === false);
  const hasRule = rows.some(r => r.p.rule !== undefined);
  const any = r => Math.max(r.p.corrects ?? 0, r.p.withheld ?? 0, r.p.sibling ?? 0, r.p.rule ?? 0);
  const cr = r => Math.max(r.p.corrects ?? 0, r.p.rule ?? 0);
  const predictors = {
    regex_correction: r => r.regex.correction,
    ...Object.fromEntries(THRESHOLDS.map(t => [`corrects>=${t}`, r => (r.p.corrects ?? 0) >= t])),
    ...(hasRule
      ? Object.fromEntries(THRESHOLDS.map(t => [`rule>=${t}`, r => (r.p.rule ?? 0) >= t]))
      : {}),
    ...(hasRule
      ? Object.fromEntries(THRESHOLDS.map(t => [`corrects|rule>=${t}`, r => cr(r) >= t]))
      : {}),
    ...Object.fromEntries(THRESHOLDS.map(t => [`any>=${t}`, r => any(r) >= t])),
    ...Object.fromEntries(
      THRESHOLDS.map(t => [
        `regex|corrects>=${t}`,
        r => r.regex.correction || (r.p.corrects ?? 0) >= t
      ])
    ),
    ...(hasRule
      ? Object.fromEntries(
          THRESHOLDS.map(t => [`regex|c|rule>=${t}`, r => r.regex.correction || cr(r) >= t])
        )
      : {})
  };
  const signal = {};
  for (const [name, pred] of Object.entries(predictors)) {
    const flagged = rows.filter(pred);
    signal[name] = {
      recall: rate(pos.filter(pred).length, pos.length),
      recall_n: `${pos.filter(pred).length}/${pos.length}`,
      flagged: flagged.length,
      share: rate(flagged.length, rows.length),
      cited_among_flagged: rate(
        flagged.filter(r => r.lab?.label === 'signal').length,
        flagged.length
      ),
      known_fp_flagged: `${fps.filter(pred).length}/${fps.length}`
    };
  }
  const withheld = {};
  for (const t of THRESHOLDS) {
    const pred = r => (r.p.withheld ?? 0) >= t;
    withheld[`>=${t}`] = {
      recall: `${wpos.filter(pred).length}/${wpos.length}`,
      hard_negatives_flagged: `${wneg.filter(pred).length}/${wneg.length}`,
      flagged: rows.filter(pred).length,
      share: rate(rows.filter(pred).length, rows.length)
    };
  }
  const list = (f, n) =>
    rows
      .slice()
      .sort((a, b) => (b.p[f] ?? 0) - (a.p[f] ?? 0))
      .slice(0, n)
      .map(r => ({
        p: r.p[f],
        label: r.lab?.label ?? null,
        withheld: r.lab?.withheld ?? null,
        at: `${r.project.replace('-home-eugene-Open-', '')} ${r.session} ${r.ts_iso.slice(0, 16)}`,
        ts: r.ts,
        text: r.state.message.slice(0, 160)
      }));
  const missed = pos
    .filter(r => any(r) < 0.5)
    .map(r => ({
      p: r.p,
      at: `${r.project.replace('-home-eugene-Open-', '')} ${r.session} ${r.ts_iso.slice(0, 16)}`,
      ts: r.ts,
      kind: r.lab.kind,
      text: r.state.message.slice(0, 160)
    }));
  const summary = {
    arm,
    all_sessions: !!all,
    n: rows.length,
    positives: pos.length,
    known_fp: fps.length,
    withheld_pos: wpos.length,
    withheld_neg: wneg.length,
    wall_ms,
    signal,
    withheld,
    missed_signals: missed,
    top_withheld: list('withheld', 30),
    top_corrects: list('corrects', 30),
    top_sibling: list('sibling', 15),
    top_rule: hasRule ? list('rule', 40) : []
  };
  writeFileSync(join(here, `score-${arm}.json`), JSON.stringify(summary, null, 2));
  process.stdout.write(
    `arm ${arm}: ${rows.length} turns scored; signal positives ${pos.length}, known false positives ${fps.length}; withheld +${wpos.length} −${wneg.length}\n\n`
  );
  process.stdout.write(
    `predictor              recall        flagged  share   cited/flagged  knownFP\n`
  );
  for (const [name, s] of Object.entries(signal))
    process.stdout.write(
      `${name.padEnd(22)} ${s.recall_n.padEnd(8)} ${String(s.recall).padEnd(5)} ${String(s.flagged).padStart(5)}   ${String(s.share).padEnd(6)}  ${String(s.cited_among_flagged).padEnd(12)}   ${s.known_fp_flagged}\n`
    );
  process.stdout.write(`\nwithheld:\n`);
  for (const [t, w] of Object.entries(withheld))
    process.stdout.write(
      `  ${t}: recall ${w.recall}, hard negatives flagged ${w.hard_negatives_flagged}, flagged ${w.flagged} (${w.share})\n`
    );
  process.stdout.write(`\nmissed signal positives (corrects<0.5 and any<0.5): ${missed.length}\n`);
  for (const m of missed.slice(0, 12))
    process.stdout.write(
      `  [${m.kind}] ${m.at}  c=${(m.p.corrects ?? 0).toFixed(2)} w=${(m.p.withheld ?? 0).toFixed(2)} s=${(m.p.sibling ?? 0).toFixed(2)}  ${m.text.slice(0, 110)}\n`
    );
  process.stdout.write(`\ntop withheld:\n`);
  for (const x of summary.top_withheld.slice(0, 15))
    process.stdout.write(
      `  ${x.p.toFixed(2)} [${x.withheld === true ? '+' : x.withheld === false ? '−' : (x.label ?? ' ')}] ${x.at}  ${x.text.slice(0, 100)}\n`
    );
  if (hasRule) {
    process.stdout.write(`\ntop rule:\n`);
    for (const x of summary.top_rule.slice(0, 25))
      process.stdout.write(
        `  ${x.p.toFixed(2)} [${x.label ?? ' '}] ${x.at}  ${x.text.slice(0, 100).replace(/\n/g, ' ')}\n`
      );
  }
  process.stdout.write(`\nwrote score-${arm}.json\n`);
};

if (cmd === 'build') build();
else if (cmd === 'ask') await ask();
else if (cmd === 'score') score();
else {
  process.stderr.write(
    `usage: run.mjs build --scan <scan.json> | ask --arm ${ARMS.join('|')} [--all] [--limit N] | score --arm ${ARMS.join('|')}\n`
  );
  process.exit(1);
}
