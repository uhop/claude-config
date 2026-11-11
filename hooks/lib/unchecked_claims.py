"""Sentences in a closing message that call a fact unchecked (CLAUDE.md § Deliberate omissions)."""

import re

_FENCE = re.compile(r'^ {0,3}(`{3,}|~{3,})[^\n]*\n.*?^ {0,3}\1[ \t]*$', re.M | re.S)
_INLINE = re.compile(r'`[^`\n]*`')
_QUOTE_LINE = re.compile(r'^[ \t]*>.*$', re.M)
_QUOTED = re.compile(r'"[^"\n]*"|“[^”\n]*”')
_EOL = re.compile(r'\r?\n')

_CLAIM = re.compile(
    r"\bI (?:didn['’]t|did not|haven['’]t|have not)(?: yet)? (?:re)?(?:check|verif|measur|confirm|test|look)\w*"
    r"|\bfrom memory\b"
    r"|\bnot (?:yet )?(?:checked|verified|looked up)\b"
    r"|\bas I recall\b"
    r"|\bI['’]m recalling\b"
    r"|\bmy recollection\b"
    r"|\bnot something I (?:checked|verified|measured|looked up)\b",
    re.I,
)
_NOT_A_CLAIM = re.compile(r'\b(?:no longer|not)\s*$', re.I)


def prose(message):
    """The message without code, quoted lines, and quoted words, which are not the agent's claims."""
    text = _FENCE.sub('', message)
    text = _INLINE.sub('', text)
    text = _QUOTE_LINE.sub('', text)
    return _QUOTED.sub('', text)


def claims(message, width=60):
    """Each match with up to `width` characters of context on either side."""
    text = prose(message)
    found = []
    for m in _CLAIM.finditer(text):
        if m.group(0).lower().startswith('from') and _NOT_A_CLAIM.search(text[max(0, m.start() - 12):m.start()]):
            continue
        before = _EOL.split(text[max(0, m.start() - width):m.start()])[-1]
        after = _EOL.split(text[m.end():m.end() + width])[0]
        found.append((m.group(0), ' '.join((before + m.group(0) + after).split())))
    return found
