#!/usr/bin/env python3
"""/reflect's gate-gap watcher (8w). Reads recorded Bash commands, a JSON list of strings, on stdin, and prints
a JSON list of hits {index, item, shape, matched}: a command written in a spelling the gates leave unread by
ruling until a session writes one, each with the item whose wait it ends. Run by reflect.mjs."""
import json
import os
import re
import sys

LIB = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__)))), 'hooks', 'lib')
sys.path.insert(0, LIB)
from shell_segments import (parse_heredocs_at, heredoc_runs_at, segment_spans, segments, run_tokens,  # noqa: E402
                            substitution_spans, substitution_extents, mask_quoted, _blank_single_quoted,
                            _closing_paren, SHELLS)

ITEMS = {
    '8l': 'The gh api analyzer misses a body field glued to its flag, as -ftitle=x',
    '8m': 'A verb split by an empty command substitution, as git pu``sh, is unseen by the gates',
    '8u': "A child shell's cd or assignment leaks into the gates' reading of what follows, as (cd X); git commit",
    'D52': 'The gates leave four spellings unread (claude-config D52)',
}
# A gated command in shell text or in code that runs one, as `git commit` or `['git', 'push']`: the verb follows
# its program across a few quotes, commas, and spaces.
GATED = re.compile(r'\bgit\W{1,6}(commit|am|merge|cherry-pick|revert|rebase|pull|push|tag|clean)\b'
                   r'|\bnpm\W{1,6}publish\b'
                   r'|\bgh\W{1,6}[\w-]+\W{1,6}(create|edit|merge|comment|delete|close|reopen)\b'
                   r'|\bgh\W{1,6}api\b[^\n]{0,160}?(-X|--method)\W{0,3}(POST|PUT|PATCH|DELETE)\b'
                   r'|\baws\W{1,6}[\w-]+\W{1,6}(rm|cp|mv|sync|delete[\w-]*|put[\w-]*|create[\w-]*|update[\w-]*|remove[\w-]*)\b'
                   r'|git-commit-allowed')
VERBS = {'git', 'npm', 'gh', 'aws', 'commit', 'am', 'merge', 'cherry-pick', 'revert', 'rebase', 'pull', 'push',
         'tag', 'clean', 'publish'}
EMPTY_SUB = re.compile(r'``|\$\(\s*\)')
GLUED_FIELD = re.compile(r'^-[fF][A-Za-z_]\w*=')
INTERPRETERS = {'python', 'python3', 'node', 'perl', 'ruby', 'deno', 'bun', 'php'}
CODE_FLAGS = {'-c', '-e', '-E', '--eval', '-p', '--print', '-r'}
NAME_WORD = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)=')


def words(text):
    return set(re.findall(r'[A-Za-z0-9_-]+', text))


def command(seg):
    toks = run_tokens(seg) or []
    return toks, (os.path.basename(toks[0]) if toks else '')


def assigned(body):
    """Names a body assigns with its leading NAME=value words, after a declarer or not."""
    out = set()
    for seg in segments(body):
        ws = seg.strip().lstrip('({').split()
        if ws and ws[0] in ('export', 'local', 'readonly', 'declare', 'typeset'):
            ws = ws[1:]
        for w in ws:
            m = NAME_WORD.match(w)
            if not m:
                break
            out.add(m.group(1))
    return out


def directs(text, names):
    """Whether text after a child names one of its names as a directory: a cd, a pushd, or git's -C."""
    return any(re.search(r'(\b(cd|pushd)\s+|-C\s*)"?\$\{?' + re.escape(n) + r'\b', text) for n in names)


def scoped_subshell(seg):
    """A segment that opens a subshell and closes it, so its own cd or assignment ends with it."""
    m = re.sub(r'\\.', '', mask_quoted(seg)).strip()
    if not m.startswith('('):
        return False
    depth = 0
    for ch in m:
        depth += (ch == '(') - (ch == ')')
        if not depth:
            return True
    return False


def spans_of(text):
    """segment_spans with each substitution's body blanked first, so its own separators stay inside it."""
    chars = list(text)
    for at, end in substitution_extents(text):
        start = at + 2 if text[at] == '$' else at + 1
        chars[start:end] = '_' * (end - start)
    return [(text[at:at + len(seg)], at) for seg, at in segment_spans(''.join(chars))]


def detect(cmd):
    hits = []

    def hit(item, shape, matched):
        hits.append({'item': item, 'shape': shape, 'matched': matched.strip()[:300]})

    text, bodies = parse_heredocs_at(cmd)
    spans = spans_of(text)
    # Each segment's subshell depth before and after it, so a subshell's assignment counts only past its close.
    depths, depth = [], 0
    for seg, _ in spans:
        masked = re.sub(r'\\.', '', mask_quoted(seg))
        after = max(depth + masked.count('(') - masked.count(')'), 0)
        depths.append((depth, after))
        depth = after
    for n, (seg, at) in enumerate(spans):
        end = at + len(seg)
        before, _ = depths[n]
        in_subshell = before > 0 or seg.lstrip().startswith('(')
        closed = next((spans[k][1] for k in range(n + 1, len(spans)) if depths[k][0] < max(before, 1)), None)
        later = any(s.strip() for s, _ in spans[n + 1:])
        piped = text[end:end + 1] == '|' and text[end:end + 2] != '||'
        after_pipe = at >= 1 and text[at - 1] == '|' and text[at - 2:at] != '||'
        toks, name = command(seg)
        if name == 'gh' and 'api' in toks and any(GLUED_FIELD.match(t) for t in toks):
            hit('8l', 'a gh api field glued to its flag', seg)
        if EMPTY_SUB.search(seg):
            plain = _blank_single_quoted(seg)
            if (words(EMPTY_SUB.sub('', plain)) - words(plain)) & VERBS:
                hit('8m', 'a word an empty substitution splits', seg)
        if later and name in ('cd', 'pushd'):
            if scoped_subshell(seg):
                hit('8u', 'a one-segment subshell holding a cd', seg)
            elif (piped or after_pipe) and not seg.strip().startswith('('):
                hit('8u', 'a cd in a multi-command pipeline', seg)
        if later and name == 'eval' and any(command(s)[1] in ('cd', 'pushd') for s in segments(' '.join(toks[1:]))):
            hit('8u', 'eval holding a cd', seg)
        if (piped or after_pipe) and directs(text[end:], assigned(seg)) or (
                in_subshell and closed is not None and directs(text[closed:], assigned(seg))):
            hit('8u', 'an assignment in a pipeline or subshell, used as a directory later', seg)
        if name in SHELLS - {'eval'}:
            for a in toks[1:]:
                if not a.startswith('-') and directs(text[end:], assigned(a)):
                    hit('8u', "an assignment in a shell's string, used as a directory later", seg)
        if name in INTERPRETERS:
            for k, t in enumerate(toks[1:-1], 1):
                if t in CODE_FLAGS and GATED.search(toks[k + 1]):
                    hit('D52', 'inline interpreter code naming a gated command', seg)
                    break
        if toks and '/' in toks[0] and name in ('gh', 'aws'):
            hit('D52', 'gh or aws named by a path', seg)
        if piped and name in ('echo', 'printf') and GATED.search(seg) and n + 1 < len(spans):
            nxt_toks, nxt = command(spans[n + 1][0])
            if nxt in SHELLS - {'eval'} and not [t for t in nxt_toks[1:] if not t.startswith('-')]:
                hit('D52', 'a string piped into a shell', seg)
    for (body, _), (_, end) in zip(substitution_spans(text), substitution_extents(text)):
        names = assigned(body)
        if names and directs(text[end + 1:], names):
            hit('8u', 'an assignment in a substitution, used as a directory later', body)
    for m in re.finditer(r'[<>]\(', text):
        body = text[m.end():_closing_paren(text, m.start() + 1)]
        if GATED.search(body):
            hit('D52', 'a command in a process substitution', body)
    for prefix, body, quoted, rest, at in bodies:
        for run in heredoc_runs_at(prefix, rest, text, at):
            runner = next((s for s, o in spans if o == run), '')
            sourced = command(runner)[1] in ('source', '.')
            if sourced and any(command(s)[1] in ('cd', 'pushd') for s in segments(body)):
                hit('8u', 'a sourced script holding a cd', runner)
            elif not sourced and directs(text[run + len(runner):], assigned(body)):
                hit('8u', 'an assignment in a run script, used as a directory later', runner)
    return hits


def main():
    out = []
    for i, cmd in enumerate(json.load(sys.stdin)):
        try:
            found = detect(cmd)
        except Exception as e:
            found = [{'item': None, 'shape': f'unreadable: {type(e).__name__}', 'matched': cmd[:300]}]
        seen = set()
        for h in found:
            key = (h['item'], h['shape'])
            if key not in seen:
                seen.add(key)
                out.append({'index': i, **h, 'title': ITEMS.get(h['item'])})
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
