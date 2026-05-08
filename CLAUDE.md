# Cross-project user preferences

Coding-style and workflow rules that apply to **every** project on this
machine, not just the one of the current working directory. Project-
specific guidance lives in per-project `~/.claude/projects/<hash>/memory/`
auto-memory; this file is the global tier.

## Coding style — C-family languages

**Prefer prefix increment (`++i`, `--i`) when the result is unused.**
Reserve postfix (`i++`, `i--`) for the cases where its post-increment
value is load-bearing — `arr[i++]`, `*p++`, `return iter++`. Applies to
C, C++, Java, JavaScript, TypeScript, C#, and any other language that
offers both forms (Go's `i++` is statement-only — preference is moot;
Rust and Python don't have `++` at all).

Reading order is the rationale: prefix parses as verb-then-object
("increment i"), postfix as noun-then-verb ("i, post-increment"). Both
compile to identical machine code when the result is unused; the
choice is purely about which form to reach for when free. Full prose
+ language list at `[[topics/prefix-increment-when-result-unused]]` in
the user's vault (vault-storage at `croc.lan:8123` — see
`vault-curl /vault/topics/prefix-increment-when-result-unused.md`).

## Performance — measure with `nano-bench`

**For any perf experiment or claim across the fleet, prototype the
change and measure with `nano-bench`** — the user's purpose-built
benchmarking library — rather than rolling ad-hoc `performance.now()`
loops, `console.time()` snippets, or one-shot timing scripts. Numbers
before claims; never ship a perf change without a comparison run.

`nano-bench` lives at `~/Open/nano-bench/`, is fully fleet-documented
(`AGENTS.md`, `llms.txt`, `wiki/`), and ships two Claude Code skills
in `~/Open/nano-bench/skills/`:
- `write-bench` — author a benchmark file from a description.
- `write-watch` — watch-mode iteration on a benchmark.

When to reach for it: any perf-claim validation, perf-driven refactor,
perf TODO ("X is slow") that would otherwise file without numbers, and
regression check after a correctness fix to a hot path. When NOT:
pure correctness work, or micro-changes whose benefit is clearly
below measurement noise.

Full prose + per-project hot-path anchors at
`[[topics/nano-bench-for-perf-experiments]]` (vault-storage at
`croc.lan:8123` — see
`vault-curl /vault/topics/nano-bench-for-perf-experiments.md`).
