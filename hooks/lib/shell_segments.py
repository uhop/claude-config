"""Shared reading of a Bash tool command for the PreToolUse gates.

One parser for three gates (vault-lease-gate.sh, git-commit-gate.sh,
destructive-op-gate.sh; D14: a shape added here is a shape all see). Heredoc bodies are data unless a shell
receives them; segments split on unquoted `;`, `|`, `||`, `&&` and newlines, a `#` comment dropped;
a substitution inside single quotes or a comment is data (8f); every quote reader knows `$'...'`, where a
backslash escapes, and shlex gets the word it stands for (8g);
tokens come from shlex with redirections left out, wherever they sit
(`split_redirects`, a here-string kept for what runs its input), and the wrapper prefixes and the shell syntax heading
a segment skipped (assignments, `command`, `env`, `timeout`, `do`, `then`, `!`,
...); `run_tokens` goes past `xargs`, `parallel`, `watch`, and `find -exec`;
`write_targets` lists what a command writes; `in_scratch_place` names a fixture's place;
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
REDIRECT_OP = re.compile(r'<<<|&>|>\|?|<')
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
SHELLS = {'bash', 'sh', 'zsh', 'dash', 'ksh', 'eval'}
# How deep the gates follow code inside code: twice the deepest of 74,995 recorded commands (4, 8p).
DEPTH = 8
FILE_RUNNERS = SHELLS | {'source', '.', 'ssh'}
# Commands that run what they are handed, so a word in their text can be a call.
RUNNERS = {'xargs', 'find', 'parallel', 'watch', 'ssh', 'env', 'time', 'timeout', 'nice', 'nohup',
           'sudo', 'doas', 'command', 'exec', 'builtin'}


ESCAPING = ('"', "$'")


def _opens(text, i):
    """The quote text[i] opens: `$'` after a `$` that neither a backslash nor `$$` takes, a string
    in which a backslash escapes (8g); otherwise the character itself. Its closing quote is q[-1]."""
    if text[i] != "'" or text[i - 1:i] != '$':
        return text[i]
    k = i
    while k and text[k - 1] == '$':
        k -= 1
    j = k
    while j and text[j - 1] == '\\':
        j -= 1
    dollars = i - k - (k - j) % 2
    return "$'" if dollars % 2 else "'"


def _outside_quotes(line, pos):
    """True when pos is in neither a quoted string nor a comment."""
    q, j = None, 0
    while j < pos:
        c = line[j]
        if c == '\\' and q in (None, *ESCAPING):
            j += 2
            continue
        if q:
            if c == q[-1]:
                q = None
        elif _comment_at(line, j):
            return False
        elif c in '\'"':
            q = _opens(line, j)
        j += 1
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


def _comment_at(text, i):
    """An unquoted `#` that starts a word comments out the rest of its line, an apostrophe included."""
    return text[i] == '#' and (i == 0 or text[i - 1] in ' \t\n;&|()<>')


def _line_end(text, i):
    end = text.find('\n', i)
    return len(text) if end < 0 else end


def segments(text):
    """Split on unquoted ; | || && and newlines. `>&`, `<&`, `&>`, `>|` belong to redirects.
    A comment is dropped."""
    segs, cur, q, i = [], [], None, 0
    while i < len(text):
        c = text[i]
        if q:
            cur.append(c)
            if c == '\\' and q in ESCAPING and i + 1 < len(text):
                cur.append(text[i + 1])
                i += 2
                continue
            if c == q[-1]:
                q = None
        elif _comment_at(text, i):
            i = _line_end(text, i)
            continue
        elif c in '\'"':
            q = _opens(text, i)
            cur.append(c)
        elif c == '\\' and i + 1 < len(text):
            cur.append(c)
            cur.append(text[i + 1])
            i += 2
            continue
        elif c in ';\n':
            segs.append(''.join(cur))
            cur = []
        elif c == '|' and text[i - 1:i] != '>':
            segs.append(''.join(cur))
            cur = []
            if i + 1 < len(text) and text[i + 1] == '|':
                i += 1
        elif c == '&':
            prev = text[i - 1] if i else ''
            nxt = text[i + 1] if i + 1 < len(text) else ''
            if prev in ('<', '>') or nxt == '>':
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


def _word_end(seg, i):
    """Where the shell word starting at i ends; a `$( … )` in it holds spaces."""
    q, depth, n = None, 0, len(seg)
    while i < n:
        c = seg[i]
        if q:
            if c == '\\' and q in ESCAPING:
                i += 1
            elif c == q[-1]:
                q = None
        elif c == '\\':
            i += 1
        elif c in '\'"`':
            q = _opens(seg, i)
        elif c == '(' and (depth or seg[i - 1:i] == '$'):
            depth += 1
        elif c == ')' and depth:
            depth -= 1
        elif not depth and (c.isspace() or c in '<>'):
            break
        i += 1
    return i


def split_redirects(seg):
    """(the segment with each redirection and its target removed, wherever it sits, so what is left
    is the command's own words; the words of its here-strings). Quoted text stays."""
    out, here, q, i, n = [], [], None, 0, len(seg)
    while i < n:
        c = seg[i]
        if q:
            if c == '\\' and q in ESCAPING:
                out += seg[i:i + 2]
                i += 2
                continue
            if c == q[-1]:
                q = None
        elif c in '\'"`':
            q = _opens(seg, i)
        elif c == '\\':
            out += seg[i:i + 2]
            i += 2
            continue
        else:
            m = REDIRECT_OP.match(seg, i)
            if m:
                j = len(out)
                while j and out[j - 1].isdigit():
                    j -= 1
                # `2>x` names a descriptor; `file2>x` is a word and a redirection.
                if j == 0 or out[j - 1].isspace():
                    del out[j:]
                i = m.end()
                while i < n and seg[i] in ' \t':
                    i += 1
                end = _word_end(seg, i)
                if m.group() == '<<<':
                    here.append(seg[i:end])
                i = end
                continue
        out.append(c)
        i += 1
    return ''.join(out), here


def without_redirects(seg):
    return split_redirects(seg)[0]


def bare(seg):
    """The segment without the `(`/`{` opening it or the `)`/`}` closing it."""
    return seg.strip().lstrip('({').rstrip(')}').strip()


ANSI_C_ESC = re.compile(r'\\(?:([0-7]{1,3})|x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|c(.)|(.))', re.S)
ANSI_C_CHARS = {'a': '\a', 'b': '\b', 'e': '\x1b', 'E': '\x1b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v',
                '\\': '\\', "'": "'", '"': '"', '?': '?'}


def _ansi_c(body):
    """A `$'...'` string's text, its escapes decoded as bash's QUOTING section lists them."""
    def one(m):
        octal, hex2, hex4, hex8, ctl, ch = m.groups()
        if ctl is not None:
            return chr(ord(ctl) & 0x1f)
        if ch is not None:
            return ANSI_C_CHARS.get(ch, '\\' + ch)
        return chr(min(int(octal, 8) if octal else int(hex2 or hex4 or hex8, 16), 0x10FFFF))
    return ANSI_C_ESC.sub(one, body)


def _split(text):
    """shlex.split, with each `$'...'` given as the single-quoted word it stands for and each `$"`
    as `"`: shlex reads `$'it\\'s'` as an unclosed quote, and `$'commit'` as `$commit` (8g). A
    backslash that ends the text is a character, as bash reads it (8i)."""
    out, q, i, n = [], None, 0, len(text)
    while i < n:
        c, nxt = text[i], text[i + 1:i + 2]
        if q == "'":
            q = None if c == "'" else q
        elif c == '\\' or c + nxt == '$$':
            out.append(text[i:i + 2] if nxt else '\\\\')
            i += 2
            continue
        elif q == '"':
            q = None if c == '"' else q
        elif c + nxt == "$'":
            j = i + 2
            while j < n and text[j] != "'":
                j += 2 if text[j] == '\\' else 1
            out.append(shlex.quote(_ansi_c(text[i + 2:j])))
            i = j + 1
            continue
        elif c + nxt == '$"':
            i += 1
            continue
        elif c in '\'"':
            q = c
        out.append(c)
        i += 1
    return shlex.split(''.join(out))


def command_tokens(seg, redirects=False):
    """shlex tokens of one segment with the wrapper prefixes skipped; [] when
    empty or unreadable. Redirections are left out unless the caller reads them."""
    seg, here = bare(seg), []
    if not redirects:
        seg, here = split_redirects(seg)
        seg = bare(seg)
    if not seg:
        return []
    try:
        toks = _past_wrappers(_split(seg))
        # What runs its input runs a here-string, as a heredoc's body (`heredoc_runs`).
        if toks and os.path.basename(toks[0]) in SHELLS | RUNNERS:
            toks += [' '.join(_split(w)) for w in here]
        return toks
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


def run_tokens(seg, redirects=False):
    """command_tokens, past `xargs`, `parallel`, `watch`, or `find -exec` to the command they run."""
    toks = command_tokens(seg, redirects)
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


def unread_words(seg):
    """The words of a segment shlex cannot read, its quotes and backslashes dropped; none for one it
    reads. A gate reads such a segment by them, so a misreading denies the verb, not passes it (8i)."""
    try:
        _split(bare(split_redirects(bare(seg))[0]))
        return set()
    except ValueError:
        return set(re.findall(r'[A-Za-z0-9_-]+', re.sub(r'[\'"\\]', '', seg)))


def command_name(seg):
    toks = command_tokens(seg)
    return os.path.basename(toks[0]) if toks else ''


def runs_its_text(seg):
    return command_name(seg) in SHELLS | RUNNERS


REDIRECT_RE = re.compile(r"""(?:>>?|\btee\s+(?:-a\s+)?)\s*(\$'(?:[^'\\]|\\.)*'|"[^"]*"|'[^']*'|[^\s;|&<>]+)""", re.S)


def _written(word):
    return _ansi_c(word[2:-1]) if word.startswith("$'") else word.strip('\'"')


def runs_what_it_writes(line, text):
    """Whether the rest of the command runs a file this line writes: by its name, as what a shell
    or `ssh` reads, or piped into a shell. A script written and run by one command is code, whatever
    its text looked like when it was written; a file it only reads is data, and what an interpreter
    runs stays unread (D42)."""
    targets = (_written(m.group(1)) for m in REDIRECT_RE.finditer(line))
    written = [t for t in targets if not t.startswith('/dev/')]
    segs = segments(text.replace(line, '', 1))
    for base in filter(None, map(os.path.basename, written)):
        # The whole name only: `bash x.sh` runs no file named `a` (8h).
        named = re.compile(r'(^|[^\w.-])' + re.escape(base) + r'($|[^\w./-])')
        for seg, after in zip(segs, segs[1:] + ['']):
            toks = run_tokens(seg) if named.search(seg) else []
            if toks and (os.path.basename(toks[0]) in FILE_RUNNERS | {base} or command_name(after) in SHELLS):
                return True
    return False


def heredoc_runs(prefix, rest, text):
    """Whether the heredoc's body can run: a shell or a runner receives it (`bash <<X`,
    `a && bash <<X`, `cat <<X | bash`), or it goes to a file the command runs."""
    return (runs_its_text(segments(prefix)[-1])
            or any(runs_its_text(s) for s in segments(rest)[1:])
            or runs_what_it_writes(prefix + rest, text))


def mask_quoted(seg):
    """The segment with the text of its quoted strings removed, the quotes kept. A word left
    is one the shell would see as a word, so a whitespace reading cannot mistake a string for a call."""
    out, q, i = [], None, 0
    while i < len(seg):
        c = seg[i]
        if q:
            if c == '\\' and q in ESCAPING:
                i += 2
                continue
            if c == q[-1]:
                q = None
                out.append(c)
        elif c in '\'"':
            q = _opens(seg, i)
            out.append(c)
        elif c == '\\':
            out.append(seg[i:i + 2])
            i += 2
            continue
        else:
            out.append(c)
        i += 1
    return ''.join(out)


def _quoted_spans(seg):
    """(start, end, quote) per closed quoted string, from its opening quote to past its closing one."""
    spans, q, start, i = [], None, 0, 0
    while i < len(seg):
        c = seg[i]
        if q:
            if c == '\\' and q in ESCAPING:
                i += 2
                continue
            if c == q[-1]:
                spans.append((start, i + 1, q))
                q = None
        elif c == '\\':
            i += 2
            continue
        elif c in '\'"':
            q = _opens(seg, i)
            start = i
        i += 1
    return spans


def mask_values(seg):
    """The segment with each quoted string that starts with `-` as `''`: a value, never a flag.
    Other quoted text stays, so `'create'` and `-X 'POST'` read (8k)."""
    out, last = [], 0
    for s, e, q in _quoted_spans(seg):
        text = seg[s + 1:e - 1]
        if (_ansi_c(text) if q == "$'" else text).startswith('-'):
            out += [seg[last:s], "''"]
            last = e
    return ''.join(out) + seg[last:]


GIT_VALUE_OPTS ={'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'}


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


def _blank_single_quoted(text):
    """text with each single-quoted string's inside blanked, same length. A `'` inside double
    quotes, or escaped, opens none; in a `$'...'` string a backslash escapes the next character."""
    out, q, i = list(text), None, 0
    while i < len(text):
        c = text[i]
        if q in ("'", "$'"):
            if c == '\\' and q == "$'":
                out[i:i + 2] = ' ' * len(out[i:i + 2])
                i += 2
                continue
            if c == "'":
                q = None
            else:
                out[i] = ' '
        elif c == '\\':
            i += 2
            continue
        elif q == '"':
            if c == '"':
                q = None
        elif _comment_at(text, i):
            end = _line_end(text, i)
            out[i:end] = ' ' * (end - i)
            i = end
            continue
        elif c in '\'"':
            q = _opens(text, i)
        i += 1
    return ''.join(out)


def _closing_paren(scan, k):
    """Where the `(` at k closes, quoted text counting no parenthesis; len(scan) when it never does."""
    depth, dq, i, n = 0, False, k, len(scan)
    while i < n:
        c = scan[i]
        if c == '\\':
            i += 2
            continue
        if dq:
            dq = c != '"'
        elif c == '"':
            dq = True
        elif c == "'":
            j = scan.find("'", i + 1)
            i = n if j < 0 else j + 1
            continue
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if not depth:
                return i
        i += 1
    return n


def substitutions(text, quotes=True):
    """The bodies of the outermost `$(...)` and backtick substitutions: executed, not data. A body
    holds its own parentheses and substitutions, which its reader finds (8p). With `quotes`, one
    inside single quotes is data (8f); an unquoted heredoc body passes False, since the shell
    expands it whatever quotes it holds."""
    scan = _blank_single_quoted(text) if quotes else text
    bodies, i = [], 0
    while i < len(scan):
        if scan[i] == '\\':
            i += 2
            continue
        if scan.startswith('$(', i):
            end = _closing_paren(scan, i + 1)
            bodies.append(text[i + 2:end])
            i = end + 1
            continue
        if scan[i] == '`':
            # An escaped backtick is a character, never a delimiter (8i).
            end = i + 1
            while end < len(scan) and scan[end] != '`':
                end += 2 if scan[end] == '\\' else 1
            bodies.append(text[i + 1:end])
            i = end + 1
            continue
        i += 1
    return bodies


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
        toks = _split(args)
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
        toks = _split(text)
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


MUTATING_GIT = {'add', 'am', 'apply', 'checkout', 'cherry-pick', 'clean', 'commit', 'merge', 'mv',
                'pull', 'rebase', 'reset', 'restore', 'revert', 'rm', 'stash', 'switch'}
ALL_ARGS = {'rm', 'rmdir', 'mkdir', 'touch', 'unlink', 'tee'}
SKIP_ONE = {'chmod', 'chown', 'truncate'}
DEST_LAST = {'cp', 'mv', 'rsync', 'ln', 'install'}
NPM_WRITES = {'install', 'i', 'ci', 'update', 'uninstall', 'link', 'rebuild', 'add', 'remove', 'dedupe'}
OUT_FLAGS = {'--store', '--out', '--output', '-o'}
# -o takes no value (or no path) here
NO_VALUE_O = {'grep', 'egrep', 'fgrep', 'rg', 'ug', 'ugrep', 'ls', 'ps', 'find', 'bfs', 'jq', 'git'}


def write_targets(cmd, base):
    """What a command writes, as (token, path): redirections, `sed -i`, `tee`, `cp`/`mv`/`rsync`/`ln` destinations,
    `rm`, `mkdir`, `touch`, `chmod`, `truncate`, `prettier --write`, `npm install`, mutating `git` verbs (at their
    directory, never `worktree`, never `apply --check`), and a path-like `--store`, `--out`, `--output`, or `-o`.
    The path is None when the token holds what the command does not say. Heredoc bodies are data."""
    env = {}

    def resolve(tok, eff):
        if not tok or tok in ('-', '/dev/null') or tok.startswith(('&', '<')) or '{}' in tok:
            return None
        for ch in '*?[':
            if ch in tok:
                tok = tok[:tok.index(ch)]
        return resolve_path(tok, eff, env)

    text, _ = strip_heredocs(cmd)
    targets, eff, scope = [], base, Subshells()

    def add(tok):
        targets.append((tok, resolve(tok, eff)))

    for seg in segments(text):
        eff = scope.enter(seg, eff)
        if read_assignment(seg, eff, env):
            continue
        toks = run_tokens(seg, redirects=True)
        if not toks:
            continue
        rest, j = [], 0
        while j < len(toks):
            t = toks[j]
            m = re.match(r'^(\d*|&)(>>?\|?)(.*)$', t)
            if m:
                tgt = m.group(3)
                if not tgt and j + 1 < len(toks):
                    tgt = toks[j + 1]
                    j += 1
                if tgt and not tgt.startswith('&'):
                    add(tgt)
                j += 1
                continue
            rest.append(t)
            j += 1
        toks = rest
        if not toks:
            continue
        name, args = os.path.basename(toks[0]), toks[1:]
        nonflag = [a for a in args if not a.startswith('-')]
        if name in ('cd', 'pushd'):
            eff = resolve(nonflag[0], eff) if nonflag else HOME
        elif name == 'sed':
            if not any(a == '-i' or a.startswith('-i') or a.startswith('--in-place') for a in args):
                continue
            files, saw_script, k = [], False, 0
            while k < len(args):
                a = args[k]
                if a in ('-e', '-f', '--expression', '--file'):
                    saw_script = True
                    k += 2
                    continue
                if a.startswith(('--expression=', '--file=')):
                    saw_script = True
                    k += 1
                    continue
                if a.startswith('-'):
                    k += 1
                    continue
                files.append(a)
                k += 1
            if not saw_script:
                files = files[1:]
            for f in files:
                add(f)
        elif name in ALL_ARGS:
            for a in nonflag:
                add(a)
        elif name in SKIP_ONE:
            for a in nonflag[1:]:
                add(a)
        elif name in DEST_LAST:
            if '-t' in args and args.index('-t') + 1 < len(args):
                add(args[args.index('-t') + 1])
            elif len(nonflag) >= 2:
                add(nonflag[-1])
        elif name == 'git':
            verb, cdir = git_verb(args)
            if verb in MUTATING_GIT and not (verb == 'apply' and '--check' in args):
                targets.append((cdir or '', resolve(cdir, eff) if cdir else eff))
        elif name in ('npx', 'prettier'):
            if 'prettier' in toks[:2] and ('--write' in args or '-w' in args):
                for a in nonflag:
                    if a != 'prettier':
                        add(a)
        elif name in ('npm', 'pnpm', 'yarn'):
            if nonflag and nonflag[0] in NPM_WRITES:
                targets.append(('', eff))
        if name in NO_VALUE_O:
            continue
        for k, a in enumerate(args):
            flag, _, val = a.partition('=')
            if flag not in OUT_FLAGS:
                continue
            if not val and k + 1 < len(args):
                val = args[k + 1]
            if not val.startswith('-') and ('/' in val or '.' in val or val.startswith('~')):
                add(val)
    return targets


def in_scratch_place(path):
    """Under the temp or the cache directory, where a repository or a marker is a fixture."""
    places = (os.environ.get('TMPDIR'), '/tmp', os.environ.get('XDG_CACHE_HOME') or os.path.join(HOME, '.cache'))
    real = os.path.realpath(path)
    return any(real == r or real.startswith(r + '/') for r in (os.path.realpath(p) for p in places if p))
