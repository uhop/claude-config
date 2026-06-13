---
name: shell-env
description: "User's shell environment on every fleet machine (dotfiles-managed): many standard commands (ls, cat, grep, diff, du, top, ping, help, h, rm, cp, mv, ln, mkdir, sudo) are aliased to enhanced or interactive alternatives, and Claude Code's tool shell additionally injects grep→ugrep and find→bfs wrapper functions. Consult before running shell commands, composing pipes, or scripting file operations — especially ls, grep, find, and anything that copies, moves, or deletes. Bypass any override with `command <cmd>`."
---

# Shell Environment Overrides

The user's shells across the whole fleet replace many standard commands with enhanced alternatives. These behave differently from their originals — be aware when running terminal commands.

Source of truth: `dot_bash_aliases` (+ `dot_bashrc.tmpl` for zoxide) in the chezmoi source at `~/.local/share/chezmoi/`. Update this skill when those files change. (This skill file itself is managed by `claude-config`, not chezmoi.)

## Critical rule

Many standard commands are aliased to enhanced replacements or have safety flags added. To run the **original** command (bypassing the alias), use the `command` builtin:

```bash
command cat file.txt   # runs original cat, not bat
command ls             # runs original ls, not eza
command rm file.txt    # runs original rm, not rm -I
command cp src dst     # runs original cp, not cp -iv
command mkdir dir      # runs original mkdir, not mkdir -pv
```

**For agents the `cp` / `mv` / `rm` / `ln` aliases are the biggest hazard**: they add interactive `-i` / `-I` flags that prompt on overwrite or bulk delete. In a non-interactive tool runner the prompt has no TTY to answer it — the command stalls or fails. Always use `command cp` / `command mv` / `command rm` / `command ln` in tool-run shells and scripts.

> **AI agents:** Prefer `command cmd` — it is the POSIX-standard alias bypass and works in **every** tool-based command runner.
>
> The backslash form (`\cp`, `\cat`, …) works in **Claude Code's Bash tool** (verified — `\ls`, `\mkdir -pv`, `\cp -f` all complete cleanly) but **hangs forever in Windsurf** (the Cascade command runner fails to detect process completion). If you're not certain which tool you're running under, use `command cmd`. Note that `\cmd` only bypasses *aliases* — it does **not** bypass the harness-injected *functions* below; `command cmd` bypasses both.

## Claude Code tool-shell layer (harness-injected)

Claude Code's Bash tool runs against a shell snapshot (`~/.claude/shell-snapshots/`) that carries the user's aliases **plus functions injected by Claude Code itself** (recognizable by `_cc_*` variables). These exist only inside Claude Code's Bash tool — not in the user's terminals, not in plain `bash -ic`:

| Command | Tool-shell behavior |
|---|---|
| `grep`, `egrep`, `fgrep` | Function dispatching to a bundled **ugrep** (`-G --ignore-files --hidden -I` + VCS-dir excludes: `.git`, `.svn`, `.hg`, …). ugrep rejects very complex patterns (long alternations, wide bounded repeats) with `exceeds complexity limits` — a pipe stage dying this way exits non-zero. Use `command grep` for real grep semantics. |
| `find` | Function dispatching to a bundled **bfs** (`-S dfs -regextype findutils-default`). Mostly find-compatible; use `command find` when exact GNU find behavior matters. |

The fleet's own `grep` alias (below) is just `--color=auto` — the ugrep behavior is purely a Claude Code artifact.

## Command replacements

These aliases replace standard commands with enhanced versions:

| Original | Replacement | Notes |
|---|---|---|
| `ls` | `eza --grid --color auto --icons --sort=type` | `l` (plain eza), `ll` (long), `la` (all), `lla` (long all), `ltr` (by mtime, reversed) |
| `cat` | `bat` (or `batcat` on Debian-family) | Syntax highlighting, paging |
| `grep`, `egrep`, `fgrep`, `diff` | same + `--color=auto` | Display-only change (but see tool-shell layer above) |
| `top` | `htop` | If installed |
| `du` | `ncdu --color dark -rr -x` (no args) / real `du` (with args) | ncdu excludes `.git`, `node_modules` |
| `ping` | `sudo prettyping --nolegend` | If installed |
| `help` | `tldr` | If installed |
| `sudo` | `doas` | Only if doas is installed and configured |
| `h` | `pick` | Interactive command reference (fzf) — **not** `history` |
| `j` | `jobs -l` | |
| `df` | `df -kh` | |
| `dd` | `dd status=progress` | |
| `free` | `free -m` | |
| `bc` | `bc -l` | Math library on |
| `duf` | `duf -only local,fuse` | |
| `env` | sorted output (no args) / real `env` (with args) | |
| `mount` | `column -t` formatted (no args) / real `mount` (with args) | |
| `sha1` | `openssl sha1` | |

## Safety-enhanced commands

These aliases add confirmation or safety flags — **the main reason agents must use `command`**:

| Command | Alias behavior |
|---|---|
| `rm` | `rm -I --preserve-root` (prompts when deleting > 3 files; no `--preserve-root` on macOS) |
| `cp` | `cp -iv` (prompts before overwrite) |
| `mv` | `mv -iv` (prompts before overwrite) |
| `ln` | `ln -i` (prompts before overwrite) |
| `mkdir` | `mkdir -pv` (create parents, verbose — usually harmless, sometimes wanted) |
| `wget` | `wget -c` (resume partial downloads) |
| `chown`, `chmod`, `chgrp` | `--preserve-root` (Linux only) |

## Navigation (zoxide)

`cd` itself is **not** replaced — it stays the bash builtin. zoxide is initialized without `--cmd`, adding `z` (frecency jump) and `zi` (interactive pick):

| Shortcut | Meaning |
|---|---|
| `z name` / `zi` | jump to a frecent directory / pick interactively |
| `..`, `...`, `....`, `.....`, `.4`, `.5` | up 1–5 directories (via `z`) |
| `-` | previous directory (`z -`) |
| `up N` | go up N directories |
| `zl [dir]` | `z` + `l` (cd + list) |
| `mkz dir` / `mkcd dir` | `mkdir -pv` + `z` |
| `l. [dir]` | list dotfiles |

## Git shortcuts

All echo the expanded command before running it (`echoRun`):

| Alias | Command |
|---|---|
| `gst` | `git status` |
| `gco` / `gcob` | `git checkout` / `git checkout -b` |
| `gcm` | `git commit` |
| `gbr` | `git branch` |
| `gpull` / `gpush` | `git pull` / `git push` |
| `gsw` | `git switch` (defaults to the remote default branch with no args) |
| `gme` | `git merge` (defaults to the remote default branch with no args) |
| `gg` | `git gui` |
| `gk` | `gitk --all` (if gitk installed) |
| `lzg` | `lazygit` |

## Utility shortcuts and functions

| Name | Expands to / does |
|---|---|
| `mic` | `micro` (editor) |
| `lzd` | `lazydocker` |
| `tre` | `tree` excluding `node_modules`, `.git`, `venv`, caches, IDE dirs |
| `gre` | `grep -r` excluding `node_modules`, `.git`, `dist`, `build`, … |
| `path` | prints `$PATH` one entry per line |
| `where "pattern" [path/glob]` | context search in files (find + grep) |
| `upfind` / `upfd` / `upsearch` | search upward from cwd (find / fd / fd-glob) |
| `rcp` / `rmv` | rsync copy / move with progress bar |
| `rup` / `rsy` | rsync update / sync-with-delete, with progress |
| `oports` | list open listening ports (`oports2`, ss-based, Linux only) |
| `gimme` | `sudo chown $USER:$USER` (Linux only) |
| `psmem` / `psm10` / `pse` / `psr` / `psm` / `psg` / `pst` | process listings: by memory / top-10 / tree / by CPU / by mem / search / with start time |
| `nowrap` | truncate lines to terminal width |
| `noGlob fn args` | run a function with globbing off |
| `ssht host [session]` | SSH + tmux attach (`mosht` mosh, `ett` Eternal Terminal, `kssh`/`kssht` kitty variants) |
| `wp host app [args]` | run a remote app's window locally via waypipe over SSH (Linux clients only) |
| `poweroff` / `reboot` / `shutdown` / `poff` | systemctl power actions via `sudo`, echoed before running |

## Available utilities (fleet floor)

Installed everywhere by dotfiles (Brewfile.common + native package lists): `eza`, `bat`, `zoxide`, `fzf`, `fd`, `ripgrep`, `igrep`, `git-delta`, `difftastic`, `dust`, `duf`, `broot`, `btop`/`bottom`, `htop`, `ncdu`, `prettyping`, `fastfetch`, `micro`, `helix`, `lazygit`, `gh`, `xh`, `sd`, `q`, `yazi`, `tealdeer` (tldr), `cheat`, `pet`, `hyperfine`, `exiftool`, `imagemagick`, `shellcheck`, `mc`, `nvm`, `pyenv`, `pnpm`, `deno`, plus compression tools (`brotli`, `zstd`, `zopfli`).

For the authoritative current list, read `~/.local/share/chezmoi/.chezmoitemplates/Brewfile.common` and `~/.local/share/chezmoi/run_onchange_before_install-packages.sh.tmpl` — local probing (`command -v`) only answers for the current machine.
