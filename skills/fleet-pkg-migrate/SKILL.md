---
name: fleet-pkg-migrate
description: "Migrate a package from one source to another (apt/dnf → brew, brew → apt, etc.) across the multi-host fleet (croc, mba, mini, mini2, nuke, uhop, think). Use when the user asks to move / swap / migrate a package between package managers, drop a native package in favor of a brew one (or vice versa), or standardize the fleet on a single source. Procedure: (1) edit chezmoi pkg lists + commit + push, (2) write an idempotent one-off shell script with rdepends/blocker check, (3) `playbash put` it to every fleet host, (4) hand off — the user runs it on each host themselves so doas/sudo passwords stay off the AI-tool path. Never `playbash exec` for steps that need sudo — no TTY in the Bash tool means orphaned doas processes."
---

# Fleet package-manager migration

Pattern for moving a package between package managers across the fleet. Examples that follow this shape: `imagemagick` apt → brew (chezmoi commit `293b54b`, 2026-05-13), `exiftool` apt/dnf → brew (chezmoi commit `9b4fad5`, 2026-05-13).

## Why this shape (don't shortcut it)

Two hard rules drive the design:

1. **Sudo passwords stay with the user, not the AI tool path.** The migration touches `apt remove` / `dnf remove` / privileged installs. Routing those through the Bash tool (which the AI controls) means the password — even if injected indirectly — flows through the same channel as everything else the agent sees. Keep it local: write a script, ship it, the user types the password.

2. **`playbash exec` for privileged commands orphans remote processes.** The Bash tool has no TTY. `playbash exec --sudo` reads the password from a TTY and injects it on each host. With no TTY, the prompt blocks; playbash gives up after a few seconds with "needs sudo"; but the remote process tree (bash → chezmoi → install-packages.sh → doas) does NOT always die with the SSH session. Result: every Linux host in the fleet is left with a hung doas waiting for input, and you have to find-and-kill them per host before any further work proceeds. See `[[feedback-never-playbash-exec]]`. `playbash put` is fine — it's just file-copy, no remote-shell prompts.

The pattern below structures the work so step 4 (the part needing sudo) runs locally on each host under the user's hand, while everything else is fully automatable.

## Standard procedure

### 1. Edit the chezmoi package lists + commit + push

The fleet's package state is defined by `~/.local/share/chezmoi/`:

- `.chezmoitemplates/Brewfile.common` — brew packages on every host (Linux + Mac)
- `.chezmoitemplates/Brewfile.Darwin` — Mac-only brew packages
- `.chezmoitemplates/Brewfile.RedHat` — RHEL-family-only brew packages (rare)
- `run_onchange_before_install-packages.sh.tmpl` — apt + dnf install lists (the `sudo apt install -y ...` and `sudo dnf install -y ...` blocks)

Make the edit (alphabetical insertion in Brewfiles; just delete-or-add in the install script). The `run_onchange_*` hash changes → chezmoi re-runs `install-packages.sh` on next apply, which re-runs `brew bundle` (installing the new brew package). Commit with the standard one-line message style. **Don't commit/push without the literal verb in the user's turn** — wait for explicit authorization per the project's git gate.

### 2. Write an idempotent one-off cleanup script

The script handles native-package removal. It must:

- **Detect package manager** (`command -v apt-get` / `command -v dnf` / else).
- **Check installed status** before touching anything (`dpkg-query -W -f='${Status}'` or `rpm -q`). If not installed, skip — that's the idempotency hook.
- **Check for blockers** — packages with hard `Depends:` on the one being removed. If any exist, leave the native package alone (brew wins on PATH; they coexist). This is what makes the script safe to run on heterogeneous hosts where the user may have other apt packages that depend on the soon-to-be-brew one.
- **Defend against the apt OR-alternation reinstall trap** — after purge, `apt-get autoremove --purge --simulate` and skip autoremove if it would `Inst` the just-removed package back. See `[[feedback-apt-alternation-reinstall]]`.
- **Run `chezmoi update`** so the brew install fires on the same pass.
- **Verify both halves** at the end and exit non-zero if either fails:
  - Native package is actually gone (`dpkg-query` / `rpm -q` reports not-installed). If the blocker check left the native one in place by design, treat that as a separate "coexist" pass, not failure.
  - Brew package is installed (`brew list --formula <pkg>` exits 0) — guards against `brew bundle` having silently no-op'd.
  - `command -v <tool>` resolves under the brew prefix (`/home/linuxbrew/.linuxbrew/` on Linux, `/opt/homebrew/` or `/usr/local/` on Mac) — guards against PATH ordering still favoring a leftover native binary, or against the native package having co-installed shims that survived.
  - A functional probe runs cleanly (`<tool> -version` / `-ver` exit 0). Cheapest sanity check that the binary is actually executable on this host.

Canonical template (adapt the package names, verify the predicates make sense for the package shape):

```bash
#!/usr/bin/env bash
# <tool>-migrate.sh — pre-`chezmoi update` cleanup for the apt/dnf → brew
# <Tool> migration. Idempotent; safe to re-run.
#
# Apt:  <apt-package-name>
# Dnf:  <dnf-package-name>
# Mac:  no native package; chezmoi update installs the brew one.
#
# See chezmoi commit <sha>.

set -euo pipefail

APT_PKG="<apt-package-name>"
DNF_PKG="<dnf-package-name>"

if command -v apt-get >/dev/null 2>&1; then
  if dpkg-query -W -f='${Status}' "$APT_PKG" 2>/dev/null \
       | grep -q 'install ok installed'; then
    echo "==> apt: $APT_PKG is installed; checking blockers..."
    blockers=$(dpkg-query -W -f='${binary:Package}\t${Depends}\n' 2>/dev/null \
      | awk -v p="$APT_PKG" -F'\t' '$2 ~ "(^|[,|] )" p "([ ,|]|$)" { print $1 }' \
      | sort -u || true)

    if [ -n "$blockers" ]; then
      echo "    Blockers present — apt's $APT_PKG is dep-locked. Leaving it."
      printf '      %s\n' $blockers
      echo "    Brew's version will win on PATH; the two coexist."
    else
      echo "    No blockers — purging apt's $APT_PKG."
      sudo apt-get purge -y "$APT_PKG" || true

      # apt OR-alternation defense
      if sudo apt-get autoremove --purge --simulate 2>&1 \
           | grep -qE "^Inst $APT_PKG"; then
        echo "    autoremove would re-install $APT_PKG — skipped."
      else
        sudo apt-get autoremove --purge -y
      fi
    fi
  else
    echo "==> apt: $APT_PKG already not installed; skipping cleanup."
  fi
elif command -v dnf >/dev/null 2>&1; then
  if rpm -q "$DNF_PKG" >/dev/null 2>&1; then
    echo "==> dnf: $DNF_PKG is installed; checking blockers..."
    blockers=$(rpm -q --whatrequires "$DNF_PKG" 2>/dev/null \
      | grep -vE "^(no package requires|$DNF_PKG)" \
      | sort -u || true)

    if [ -n "$blockers" ]; then
      echo "    Blockers present — dnf's $DNF_PKG is dep-locked. Leaving it."
      printf '      %s\n' $blockers
    else
      echo "    No blockers — removing dnf's $DNF_PKG."
      sudo dnf remove -y "$DNF_PKG" || true
    fi
  else
    echo "==> dnf: $DNF_PKG already not installed; skipping cleanup."
  fi
else
  echo "==> No apt-get or dnf detected — skipping native cleanup."
fi

echo
echo "==> Running chezmoi update..."
chezmoi update

echo
echo "==> Verify:"
TOOL="<tool>"               # binary name on PATH
BREW_PKG="<brew-package>"   # brew formula name
fail=0

# 1. Native package fully removed (skip-with-warning if blocker-coexist path was taken).
if command -v apt-get >/dev/null 2>&1; then
  if dpkg-query -W -f='${Status}' "$APT_PKG" 2>/dev/null | grep -q 'install ok installed'; then
    if [ -n "${blockers:-}" ]; then
      echo "    [coexist] apt's $APT_PKG still installed (blocker-locked, by design)"
    else
      echo "    [FAIL]    apt's $APT_PKG is still installed (cleanup didn't take)"
      fail=1
    fi
  else
    echo "    [ok]      apt's $APT_PKG fully removed"
  fi
elif command -v dnf >/dev/null 2>&1; then
  if rpm -q "$DNF_PKG" >/dev/null 2>&1; then
    if [ -n "${blockers:-}" ]; then
      echo "    [coexist] dnf's $DNF_PKG still installed (blocker-locked, by design)"
    else
      echo "    [FAIL]    dnf's $DNF_PKG is still installed (cleanup didn't take)"
      fail=1
    fi
  else
    echo "    [ok]      dnf's $DNF_PKG fully removed"
  fi
fi

# 2. Brew package installed.
if command -v brew >/dev/null 2>&1 && brew list --formula "$BREW_PKG" >/dev/null 2>&1; then
  echo "    [ok]      brew formula $BREW_PKG installed"
else
  echo "    [FAIL]    brew formula $BREW_PKG NOT installed (chezmoi run_onchange may have aborted before brew bundle)"
  fail=1
fi

# 3. PATH resolution under the brew prefix.
brew_prefix="$(brew --prefix 2>/dev/null || true)"
tool_path="$(command -v "$TOOL" 2>/dev/null || true)"
if [ -z "$tool_path" ]; then
  echo "    [FAIL]    $TOOL not on PATH"
  fail=1
elif [ -n "$brew_prefix" ] && [ "${tool_path#$brew_prefix}" != "$tool_path" ]; then
  echo "    [ok]      $TOOL → $tool_path (brew)"
else
  echo "    [WARN]    $TOOL → $tool_path (not under brew prefix $brew_prefix — check PATH ordering)"
  fail=1
fi

# 4. Functional probe.
if [ -n "$tool_path" ] && "$tool_path" -version >/dev/null 2>&1; then
  echo "    [ok]      $TOOL -version exits 0"
elif [ -n "$tool_path" ] && "$tool_path" -ver >/dev/null 2>&1; then
  echo "    [ok]      $TOOL -ver exits 0"
elif [ -n "$tool_path" ] && "$tool_path" --version >/dev/null 2>&1; then
  echo "    [ok]      $TOOL --version exits 0"
else
  echo "    [FAIL]    $TOOL doesn't respond to -version / -ver / --version"
  fail=1
fi

exit "$fail"
```

Reverse direction (brew → apt/dnf) flips the script: detect brew, `brew uninstall <pkg>`, then `chezmoi update` (which `apt install`s the native one). Same idempotency shape.

Write the script to `/tmp/<tool>-migrate.sh` locally. `chmod +x`, `bash -n` syntax-check.

### 3. Distribute via `playbash put`

```bash
playbash put linux,mac --self /tmp/<tool>-migrate.sh /tmp/<tool>-migrate.sh
```

`--self` includes the local host (`think`). `playbash put` is safe to run from the Bash tool (no remote-shell prompts). Hosts that are offline (commonly `mba`) will show "unknown host" — note them, re-run `playbash put` for those when they're back.

### 4. Hand off to the user

Tell the user:

> Run on each Linux host (this includes the local `think`): `bash /tmp/<tool>-migrate.sh`
>
> The script will prompt for the doas/sudo password during the apt/dnf remove and again during the chezmoi-triggered apt install. That password stays on the host.
>
> Idempotent — safe to re-run if anything is interrupted.

On the Mac host (`mini2`), the script just falls through to `chezmoi update` (no native package to remove). Mention it for completeness.

Wait for the user to report back. When they do, optionally verify by reading the migration log they hand back, or by `playbash exec linux -- <readonly-check>` for a no-sudo confirmation like `command -v <tool>` / `<tool> -version`.

## Fleet reference

Hosts (from `playbash hosts`):

| Group | Hosts |
| --- | --- |
| linux | croc, mini, nuke, uhop, think (self), mba |
| mac   | mini2 |

`mba` is the 4 GB MacBook Air and is often offline — expect "unknown host" and re-run later. `think` is the user's primary laptop where you'll usually be invoking from.

Package-manager assumption: most Linux hosts in the fleet are Debian/Ubuntu (apt). RHEL hosts come and go for testing — the script handles both branches so heterogeneity isn't a planning concern.

## Related

- `[[feedback-never-playbash-exec]]` — the TTY/orphan rule that motivates step-4 hand-off.
- `[[feedback-apt-alternation-reinstall]]` — the autoremove simulation defense baked into the script template.
- `[[reference-chezmoi-prefixes]]` — chezmoi source-state prefix semantics, including `run_onchange_` (which is what re-fires the install script when the hash changes).
- Imagemagick precedent: chezmoi `293b54b`, script `/tmp/imagemagick-migrate.sh`.
- Exiftool precedent: chezmoi `9b4fad5`, script `/tmp/exiftool-migrate.sh`.
