"""Shared reading of a Bash tool command for the PreToolUse gates.

One parser for three gates (vault-lease-gate.sh, git-commit-gate.sh,
destructive-op-gate.sh; D14: a shape added here is a shape all see). Heredoc bodies are data unless a shell
receives them; segments split on unquoted `;`, `|`, `||`, `&&` and newlines;
tokens come from shlex with the wrapper prefixes skipped (assignments,
`command`, `env`, `timeout`, ...); `git_verb` walks git's global options.
Anything this cannot read, a caller must treat by its own default: the lease
gate fails open, the commit gate keeps its regex verdict, the destructive-op
gate falls back to its segment regex and settings.json's prefix deny.
"""
import os
import re
import shlex

HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
ASSIGN = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*=')
PREFIX = {'command', 'nice', 'time', 'exec', 'sudo', 'doas', 'builtin', 'nohup'}
SUBST_RE = re.compile(r'\$\(([^()]*)\)|`([^`]*)`')
SHELLS = {'bash', 'sh', 'zsh', 'dash', 'ksh', 'eval'}
# Commands that run what they are handed, so a word in their text can be a call.
RUNNERS = {'xargs', 'find', 'parallel', 'watch', 'ssh', 'env', 'time', 'timeout', 'nice', 'nohup',
           'sudo', 'doas', 'command', 'exec', 'builtin'}


def _outside_quotes(line, pos):
    q = None
    for c in line[:pos]:
        if q:
            if c == q:
                q = None
        elif c in '\'"':
            q = c
    return q is None


def _heredoc_at(line):
    """The first heredoc operator: a `<<<` here-string or a quoted `<<` opens none,
    and taking either for one would hide the lines after it from every gate."""
    for m in HEREDOC_RE.finditer(line):
        if line[m.start() - 1:m.start()] != '<' and _outside_quotes(line, m.start()):
            return m
    return None


def parse_heredocs(cmd):
    """(text, bodies): the command without its heredoc bodies, and one
    (line_before_operator, body, quoted_terminator, line_after_operator) per
    heredoc. An unquoted terminator means the body still expands `$(...)`."""
    lines, bodies, cur = [], [], []
    term = prefix = rest = None
    quoted = False
    for line in cmd.split('\n'):
        if term is not None:
            if line.strip() == term:
                bodies.append((prefix, '\n'.join(cur), quoted, rest))
                term, cur = None, []
            else:
                cur.append(line)
            continue
        m = _heredoc_at(line)
        if m:
            term, quoted, prefix, rest = m.group(2), bool(m.group(1)), line[:m.start()], line[m.end():]
            lines.append(prefix + rest)
            continue
        lines.append(line)
    if term is not None:
        bodies.append((prefix, '\n'.join(cur), quoted, rest))
    return '\n'.join(lines), bodies


def strip_heredocs(cmd):
    """parse_heredocs with each body as (line_before_operator, body, quoted_terminator)."""
    text, bodies = parse_heredocs(cmd)
    return text, [b[:3] for b in bodies]


def segments(text):
    """Split on unquoted ; | || && and newlines. `>&`, `&>` belong to redirects."""
    segs, cur, q, i = [], [], None, 0
    while i < len(text):
        c = text[i]
        if q:
            cur.append(c)
            if c == '\\' and q == '"' and i + 1 < len(text):
                cur.append(text[i + 1])
                i += 2
                continue
            if c == q:
                q = None
        elif c in '\'"':
            q = c
            cur.append(c)
        elif c == '\\' and i + 1 < len(text):
            cur.append(c)
            cur.append(text[i + 1])
            i += 2
            continue
        elif c in ';\n':
            segs.append(''.join(cur))
            cur = []
        elif c == '|':
            segs.append(''.join(cur))
            cur = []
            if i + 1 < len(text) and text[i + 1] == '|':
                i += 1
        elif c == '&':
            prev = text[i - 1] if i else ''
            nxt = text[i + 1] if i + 1 < len(text) else ''
            if prev == '>' or nxt == '>':
                cur.append(c)
            else:
                segs.append(''.join(cur))
                cur = []
                if nxt == '&':
                    i += 1
        else:
            cur.append(c)
        i += 1
    segs.append(''.join(cur))
    return segs


def command_tokens(seg):
    """shlex tokens of one segment with the wrapper prefixes skipped; [] when
    empty or unreadable."""
    seg = seg.strip().lstrip('({').rstrip(')}').strip()
    if not seg:
        return []
    try:
        toks = shlex.split(seg)
    except ValueError:
        return []
    while toks and (ASSIGN.match(toks[0]) or toks[0] in PREFIX):
        toks = toks[1:]
    if toks and toks[0] == 'timeout':
        toks = toks[2:]
    if toks and toks[0] == 'env':
        toks = toks[1:]
        while toks and (ASSIGN.match(toks[0]) or toks[0].startswith('-')):
            toks = toks[1:]
    return toks


def command_name(seg):
    toks = command_tokens(seg)
    return os.path.basename(toks[0]) if toks else ''


def runs_its_text(seg):
    return command_name(seg) in SHELLS | RUNNERS


REDIRECT_RE = re.compile(r"""(?:>>?|\btee\s+(?:-a\s+)?)\s*("[^"]*"|'[^']*'|[^\s;|&<>]+)""")


def names_what_it_writes(line, text):
    """Whether the rest of the command names a file this line writes. A script written
    and run by one command is code, whatever its text looked like when it was written."""
    others = text.replace(line, '', 1)
    targets = (m.group(1).strip('\'"') for m in REDIRECT_RE.finditer(line))
    return any(t in others for t in targets if not t.startswith('/dev/'))


def heredoc_runs(prefix, rest, text):
    """Whether the heredoc's body can run: a shell or a runner receives it (`bash <<X`,
    `a && bash <<X`, `cat <<X | bash`), or it goes to a file the command names again."""
    return (runs_its_text(segments(prefix)[-1])
            or any(runs_its_text(s) for s in segments(rest)[1:])
            or names_what_it_writes(prefix + rest, text))


def mask_quoted(seg):
    """The segment with the text of its quoted strings removed, the quotes kept. A word left
    is one the shell would see as a word, so a whitespace reading cannot mistake a string for a call."""
    out, q, i = [], None, 0
    while i < len(seg):
        c = seg[i]
        if q:
            if c == '\\' and q == '"':
                i += 2
                continue
            if c == q:
                q = None
                out.append(c)
        elif c in '\'"':
            q = c
            out.append(c)
        elif c == '\\':
            out.append(seg[i:i + 2])
            i += 2
            continue
        else:
            out.append(c)
        i += 1
    return ''.join(out)


GIT_VALUE_OPTS = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'}


def git_split(args):
    """(subcommand, -C value or None, subcommand's index) after git's global options."""
    cdir, k = None, 0
    while k < len(args) and args[k].startswith('-'):
        a = args[k]
        if a in GIT_VALUE_OPTS and k + 1 < len(args):
            if a == '-C':
                cdir = args[k + 1]
            k += 2
            continue
        if a.startswith('-C') and len(a) > 2:
            cdir = a[2:]
        k += 1
    return (args[k] if k < len(args) else '', cdir, k)


def git_verb(args):
    """(subcommand, -C value or None) after git's global options."""
    verb, cdir, _ = git_split(args)
    return (verb, cdir)


def substitutions(text):
    """The bodies of `$(...)` and backtick substitutions: executed, not data."""
    return [m.group(1) or m.group(2) or '' for m in SUBST_RE.finditer(text)]
