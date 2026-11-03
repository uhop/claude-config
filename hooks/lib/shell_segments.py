"""Shared reading of a Bash tool command for the PreToolUse gates.

One parser for three gates (vault-lease-gate.sh, git-commit-gate.sh,
destructive-op-gate.sh; D14: a shape added here is a shape all see). Heredoc bodies are data unless a shell
receives them; segments split on unquoted `;`, `|`, `||`, `&&` and newlines;
tokens come from shlex with the wrapper prefixes and the shell syntax heading
a segment skipped (assignments, `command`, `env`, `timeout`, `do`, `then`, `!`,
...); `run_tokens` goes past `xargs`, `parallel`, `watch`, and `find -exec`;
`ssh_command` reads a remote command for the gate it binds; `Subshells` ends a
subshell's `cd` with it; `git_verb` walks git's global options;
`read_assignment` and `resolve_path` follow a path through the variables the
command assigns. Anything this cannot read, a caller must treat by its own
default: the lease gate fails open, the commit gate denies an unknown site and
keeps its regex verdict with the parser absent, the destructive-op gate falls
back to its segment regex and settings.json's prefix deny.
"""
import itertools
import os
import re
import shlex

HOME = os.path.expanduser('~')
HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
ASSIGN = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*=')
VAR_RE = re.compile(r'\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))')
MKTEMP_RE = re.compile(r'\$\(\s*(?:command\s+)?mktemp\b([^()]*)\)')
DECLARERS = {'export', 'local', 'readonly', 'declare', 'typeset'}
KEYWORDS = {'do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{', '('}
CASE_ARM = re.compile(r'^[^()]*\)$')
REBINDERS = {'read', 'unset'}
RUNNER_VALUE_OPTS = {
    'xargs': {'-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a'},
    'parallel': {'-j', '-n', '-N', '-P', '-a', '-I'},
    'watch': {'-n', '--interval'},
}
SSH_VALUE_OPTS = {'-i', '-p', '-o', '-l', '-J', '-F', '-L', '-R', '-D', '-b', '-c', '-E', '-m', '-O', '-S', '-w', '-W'}
EXEC_FLAGS = {'-exec', '-execdir', '-ok', '-okdir'}
_fresh = itertools.count()
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
        return _past_wrappers(shlex.split(seg))
    except ValueError:
        return []


def _past_wrappers(toks):
    while toks:
        t = toks[0]
        if ASSIGN.match(t) or t in PREFIX or t in KEYWORDS or t.endswith('()') or CASE_ARM.match(t):
            toks = toks[1:]
        elif t == 'function' or toks[1:2] == ['()']:
            toks = toks[2:]
        elif t == 'case' and toks[2:3] == ['in']:
            toks = toks[3:]
        else:
            break
    if toks and toks[0] == 'timeout':
        toks = toks[2:]
    if toks and toks[0] == 'env':
        toks = toks[1:]
        while toks and (ASSIGN.match(toks[0]) or toks[0].startswith('-')):
            toks = toks[1:]
    return toks


def run_tokens(seg):
    """command_tokens, past `xargs`, `parallel`, `watch`, or `find -exec` to the command they run."""
    toks = command_tokens(seg)
    name = os.path.basename(toks[0]) if toks else ''
    if name in RUNNER_VALUE_OPTS:
        k = 1
        while k < len(toks) and toks[k].startswith('-'):
            k += 2 if toks[k] in RUNNER_VALUE_OPTS[name] else 1
        return _past_wrappers(toks[k:])
    if name in ('find', 'bfs'):
        for k, t in enumerate(toks):
            if t in EXEC_FLAGS:
                rest = toks[k + 1:]
                return _past_wrappers(rest[:-1] if rest and rest[-1] in (';', '+') else rest)
    return toks


def ssh_command(args):
    """The remote command of `ssh <args>` as one string; '' when it opens a shell."""
    k = 0
    while k < len(args) and args[k].startswith('-'):
        k += 2 if args[k] in SSH_VALUE_OPTS else 1
    return ' '.join(args[k + 1:])


class Subshells:
    """A walker's directory across segments: a `cd` inside `( … )` ends with it."""

    def __init__(self):
        self.saved, self.closing = [], 0

    def enter(self, seg, eff):
        for _ in range(self.closing):
            if self.saved:
                eff = self.saved.pop()
        masked = re.sub(r'\\.', '', mask_quoted(seg))
        delta = masked.count('(') - masked.count(')')
        self.saved += [eff] * max(delta, 0)
        self.closing = max(-delta, 0)
        return eff


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


def expand(tok, eff, env):
    """tok with its variables replaced from env, `$HOME` and `$PWD`; None when one is unknown."""
    known = {'HOME': HOME, 'PWD': eff, **env}
    out = VAR_RE.sub(lambda m: known.get(m.group(1) or m.group(2)) or m.group(0), tok)
    return None if '$' in out or '`' in out else out


def resolve_path(tok, eff, env):
    """tok as an absolute path. None when a variable is unknown, or tok is relative to an unknown eff."""
    tok = expand(tok, eff, env)
    if tok is None:
        return None
    if tok == '~' or tok.startswith('~/'):
        tok = HOME + tok[1:]
    if not tok.startswith('/'):
        if eff is None:
            return None
        tok = os.path.join(eff, tok)
    return os.path.normpath(tok)


def mktemp_path(args, eff, env):
    """Where `mktemp <args>` creates, under a name of its own, since the real one is random."""
    try:
        toks = shlex.split(args)
    except ValueError:
        return None
    parent, template = None, None
    for prev, t in zip([''] + toks, toks):
        if prev == '-p':
            parent = t
        elif t.startswith('--tmpdir='):
            parent = t[len('--tmpdir='):]
        elif not t.startswith('-') and template is None:
            template = t
    if parent is not None:
        base = resolve_path(parent, eff, env)
    elif template is not None and '-t' not in toks:
        # GNU mktemp puts a bare template in the current directory.
        base = resolve_path(os.path.dirname(template) or '.', eff, env)
    else:
        base = os.environ.get('TMPDIR') or '/tmp'
    return None if base is None else os.path.join(base, 'tmp.fresh-%d' % next(_fresh))


def read_assignment(seg, eff, env):
    """Record a segment's `NAME=value`s in env; True when the segment is nothing else.
    A value it cannot read forgets the name, so a stale value never decides."""
    def fresh(m):
        return mktemp_path(m.group(1), eff, env) or m.group(0)
    text = MKTEMP_RE.sub(fresh, seg).strip().lstrip('({').rstrip(')}').strip()
    try:
        toks = shlex.split(text)
    except ValueError:
        toks = text.split()
    if toks and toks[0] in KEYWORDS:
        # Conditional: the value may or may not be in force after it.
        for t in toks[1:]:
            if not ASSIGN.match(t):
                break
            env.pop(t.split('=', 1)[0], None)
        return False
    if toks[:1] in (['for'], ['select']) and len(toks) > 1:
        env.pop(toks[1], None)
        return False
    if toks and toks[0] in REBINDERS:
        for t in toks[1:]:
            env.pop(t, None)
        return False
    if toks and toks[0] in DECLARERS:
        toks = toks[1:]
    k = 0
    while k < len(toks) and ASSIGN.match(toks[k]):
        k += 1
    only = 0 < k == len(toks)
    for t in toks[:k]:
        name, value = t.split('=', 1)
        value = expand(value, eff, env) if only else None
        if value is None:
            env.pop(name, None)
        else:
            env[name] = value
    return only


def checkout_of(path):
    """(root, linked) of the checkout at or above path; (None, False) when none is. A `.git` file
    naming `worktrees/` is a linked worktree; one naming `modules/` is a submodule, a repository of its own."""
    d = path
    while d and d != '/':
        g = os.path.join(d, '.git')
        if os.path.isdir(g):
            return d, False
        if os.path.isfile(g):
            try:
                with open(g) as f:
                    return d, '/worktrees/' in f.read()
            except OSError:
                return None, False
        d = os.path.dirname(d)
    return None, False
