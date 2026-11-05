---
name: tmux
description: "Remote control tmux sessions for interactive CLIs — REPLs (python, node), debuggers (lldb, gdb), and other TTY/full-screen apps — by sending keystrokes, scraping pane output, and polling for prompts. Uses a private socket isolated from the user's own tmux. Only where `HERDR_ENV` is not 1: inside a Herdr session, run interactive programs in a Herdr pane instead, whether or not the user named Herdr."
---

# tmux Skill

> Vendored 2026-08-06 from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) (Apache-2.0). Local fixes: `-L "$SOCKET"` → `-S "$SOCKET"` (`-L` takes a socket *name*, `-S` a path); `-S` on `wait-for-text.sh`, and tmux's error on its timeout; targets by session name, since a config's `base-index` moves window 0; `find-sessions.sh`'s format, which printed a literal `\t` and no start time on tmux 3.6; helper paths that run from any directory.

**Inside a Herdr session (`HERDR_ENV=1`), use a Herdr pane, not this skill**, whether or not the user named Herdr (ruled 2026-11-04), so the work runs on the terminal path the user works in: `herdr pane split --current --direction right --cwd "$PWD" --no-focus`, then `herdr pane run`, `herdr pane wait-output --regex '(?m)^>>>' --source recent-unwrapped --timeout 15000`, and `herdr pane read`. Read the tail and `herdr pane close` a pane you split once its work ends. The `herdr` skill has the rest.

Use tmux as a programmable terminal multiplexer for interactive work. Works on Linux and macOS with stock tmux. A private socket keeps agent sessions off the user's own server, but a server on it still loads the user's config unless you start it with `-f /dev/null`.

## Quickstart (isolated socket)

```bash
CLAUDE_TMUX_SOCKET_DIR=${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}  # well-known dir for all agent sockets
mkdir -p "$CLAUDE_TMUX_SOCKET_DIR"
SOCKET="$CLAUDE_TMUX_SOCKET_DIR/claude.sock"    # keep agent sessions separate from your personal tmux
SESSION=claude-python                           # slug-like names; avoid spaces
tmux -S "$SOCKET" new -d -s "$SESSION" -n shell
tmux -S "$SOCKET" send-keys -t "$SESSION" -- 'PYTHON_BASIC_REPL=1 python3 -q' Enter
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION" -S -200  # watch output
tmux -S "$SOCKET" kill-session -t "$SESSION"                   # clean up
```

After starting a session ALWAYS tell the user how to monitor the session by giving them a command to copy paste:

```
To monitor this session yourself:
  tmux -S "$SOCKET" attach -t claude-lldb

Or to capture the output once:
  tmux -S "$SOCKET" capture-pane -p -J -t claude-lldb -S -200
```

This must ALWAYS be printed right after a session was started and once again at the end of the tool loop.  But the earlier you send it, the happier the user will be.

## Socket convention

- Agents MUST place tmux sockets under `CLAUDE_TMUX_SOCKET_DIR` (defaults to `${TMPDIR:-/tmp}/claude-tmux-sockets`) and use `tmux -S "$SOCKET"` so we can enumerate/clean them. Create the dir first: `mkdir -p "$CLAUDE_TMUX_SOCKET_DIR"`.
- Default socket path to use unless you must isolate further: `SOCKET="$CLAUDE_TMUX_SOCKET_DIR/claude.sock"`.

## Targeting panes and naming

- Target a session by its name: `-t "$SESSION"` reaches its current window and active pane, whatever a config's `base-index` numbered them. Give `{session}:{window}.{pane}` only to pick among several panes, with the numbers from `list-panes -a`. Keep names short, such as `claude-py` or `claude-gdb`.
- Use `-S "$SOCKET"` consistently to stay on the private socket path. For a clean config, add `-f /dev/null` to the command that starts the server.
- Inspect: `tmux -S "$SOCKET" list-sessions`, `tmux -S "$SOCKET" list-panes -a`.

## Finding sessions

- List sessions on your active socket with metadata: `~/.claude/skills/tmux/scripts/find-sessions.sh -S "$SOCKET"`; add `-q partial-name` to filter.
- Scan all sockets under the shared directory: `~/.claude/skills/tmux/scripts/find-sessions.sh --all` (uses `CLAUDE_TMUX_SOCKET_DIR` or `${TMPDIR:-/tmp}/claude-tmux-sockets`).

## Sending input safely

- Prefer literal sends to avoid shell splitting: `tmux -S "$SOCKET" send-keys -t target -l -- "$cmd"`
- When composing inline commands, use single quotes or ANSI C quoting to avoid expansion: `tmux ... send-keys -t target -- $'python3 -m http.server 8000'`.
- To send control keys: `tmux ... send-keys -t target C-c`, `C-d`, `C-z`, `Escape`, etc.

## Watching output

- Capture recent history (joined lines to avoid wrapping artifacts): `tmux -S "$SOCKET" capture-pane -p -J -t target -S -200`.
- For continuous monitoring, poll with the helper script (below) instead of `tmux wait-for` (which does not watch pane output).
- You can also temporarily attach to observe: `tmux -S "$SOCKET" attach -t "$SESSION"`; detach with `Ctrl+b d`.
- When giving instructions to a user, **explicitly print a copy/paste monitor command** alongside the action don't assume they remembered the command.

## Spawning Processes

Some special rules for processes:

- when asked to debug, use lldb by default
- when starting a python interactive shell, always set the `PYTHON_BASIC_REPL=1` environment variable. This is very important as the non-basic console interferes with your send-keys.

## Synchronizing / waiting for prompts

- Use timed polling to avoid races with interactive tools. Example: wait for a Python prompt before sending code:
  ```bash
  ~/.claude/skills/tmux/scripts/wait-for-text.sh -S "$SOCKET" -t "$SESSION" -p '^>>>' -T 15 -l 4000
  ```
- For long-running commands, poll for completion text (`"Type quit to exit"`, `"Program exited"`, etc.) before proceeding.

## Interactive tool recipes

- **Python REPL**: `tmux ... send-keys -- 'PYTHON_BASIC_REPL=1 python3 -q' Enter`; wait for `^>>>`; send code with `-l`; interrupt with `C-c`.
- **gdb**: `tmux ... send-keys -- 'gdb --quiet ./a.out' Enter`; disable paging `tmux ... send-keys -- 'set pagination off' Enter`; break with `C-c`; issue `bt`, `info locals`, etc.; exit via `quit` then confirm `y`.
- **Other TTY apps** (ipdb, psql, mysql, node, bash): same pattern—start the program, poll for its prompt, then send literal text and Enter.

## Cleanup

- Kill a session when done: `tmux -S "$SOCKET" kill-session -t "$SESSION"`.
- Kill all sessions on a socket: `tmux -S "$SOCKET" list-sessions -F '#{session_name}' | xargs -r -n1 tmux -S "$SOCKET" kill-session -t`.
- Remove everything on the private socket: `tmux -S "$SOCKET" kill-server`.

## Helper: wait-for-text.sh

`~/.claude/skills/tmux/scripts/wait-for-text.sh` polls a pane for a regex (or fixed string) with a timeout. Works on Linux/macOS with bash + tmux + grep.

```bash
~/.claude/skills/tmux/scripts/wait-for-text.sh -S "$SOCKET" -t session -p 'pattern' [-F] [-T 20] [-i 0.5] [-l 2000]
```

- `-S`/`--socket-path` the private socket's path; without it the helper polls the user's default tmux server
- `-t`/`--target` pane target (required): a session name, or `session:window.pane`
- `-p`/`--pattern` regex to match (required); add `-F` for fixed string
- `-T` timeout seconds (integer, default 15)
- `-i` poll interval seconds (default 0.5)
- `-l` history lines to search from the pane (integer, default 1000)
- Exits 0 on first match, 1 on timeout. On timeout prints the last captured text to stderr, or tmux's error when the capture failed, as it does with a wrong socket or target.
