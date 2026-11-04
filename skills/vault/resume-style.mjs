// The digest's two forms (vault-storage D595). It quotes strangers and a terminal obeys some control
// bytes, so the plain form has none. Claude Code renders no Markdown in a hook's message but draws
// ANSI codes there, so the styled form holds them.

// Whole sequences first, so none leaves its tail as text. The patterns are console-toolkit's
// (src/ansi/), copied since this repository has no dependencies.
const ESCAPES =
  /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][\x20-\x7e]*(?:[\x07\x9c]|\x1b\\)|\x1b[\x20-\x2f]*[\x30-\x7e]/g;
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** The text with no escape sequence and no control byte but a tab and a newline. */
export const withoutControls = text => text.replace(ESCAPES, '').replace(CONTROLS, '');

const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\s](?:[^*\n]*[^*\s])?)\*/g;

const styledInline = text =>
  text.replace(INLINE, (_, code, bold, italic) => {
    if (code !== undefined) return `\x1b[36m${code}\x1b[39m`;
    if (bold !== undefined) return `\x1b[1m${styledInline(bold)}\x1b[22m`;
    return `\x1b[3m${italic}\x1b[23m`;
  });

const LABEL = /^[A-Z][^:]*:$/;

const styledLine = line => {
  if (line.startsWith('# ')) return `\x1b[1;38;5;75m${line.slice(2)}\x1b[0m`;
  if (line.startsWith('## ')) return `\x1b[1;38;5;252m${line.slice(3)}\x1b[0m`;
  if (line.startsWith('- ')) return ` • ${styledInline(line.slice(2))}`;
  if (LABEL.test(line)) return `\x1b[3m${line}\x1b[23m`;
  return styledInline(line);
};

/** The digest with its Markdown as ANSI codes: what its logs use, measured on 23 of them. */
export const styledOf = digest => digest.split('\n').map(styledLine).join('\n');
