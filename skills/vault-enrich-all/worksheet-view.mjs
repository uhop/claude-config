// worksheet-view.mjs — `enrich-batch show`: one worksheet item as the text an agent judges, every
// body, added chunk, and changed piece whole, in pages when it passes a budget. Kept pure, so
// worksheet-view.test.mjs pins it.
//
// Why (vault-storage 0an, 2026-10-29): sweep agents read worksheets through their own slicing
// (`[:500]`, `head -c`, `cut -c`), and a delta's added chunks come in body order, so a head-cut
// view of an appended note misses exactly its newest entries while it shows everything that
// confirms the old summary; apodict's plan summary was restated from such a view and stamped
// current while it still put a shipped arc at the head of the order.

/** The most characters one page prints, under the Bash tool's output limit. */
export const PAGE_CHARS = 24000;

const toWhat = item => {
  if (item.read === 'delta') return `${item.delta?.added_chunks?.length ?? 0} added chunks`;
  if (item.read === 'folder-delta') return `${item.changed_pieces?.length ?? 0} changed pieces`;
  if (item.read === 'outline') return `${item.outline?.headings?.length ?? 0} headings`;
  return `${item.body?.length ?? 0} characters of body`;
};

/** A worksheet's items, a line each: the number `show --item` takes, the note, and its read. */
export const renderIndex = worksheet =>
  (worksheet.items ?? [])
    .map(
      (item, i) =>
        `${i + 1}. ${item.file_path} · read: ${item.read}${item.reason ? ` · reason: ${item.reason}` : ''} · ${toWhat(item)}`
    )
    .join('\n');

const section = (heading, text) => `--- ${heading} ---\n${text}`;

/** One item as text, nothing cut: what a judgment of its enrichment needs, in reading order. */
export const renderItem = (item, n, total) => {
  const out = [
    `item ${n} of ${total}: ${item.file_path}`,
    `title: ${item.title ?? ''}`,
    `type: ${item.type ?? ''} · read: ${item.read}${item.reason ? ` · reason: ${item.reason}` : ''}`,
    `existing_tags: ${JSON.stringify(item.existing_tags ?? [])}`
  ];
  const agent = item.current_agent;
  if (agent) {
    const {summary, derived_from_hash: _hash, derived_at: _at, ...rest} = agent;
    out.push(section('current summary', summary ?? '(none)'));
    out.push(section('current agent fields', JSON.stringify(rest)));
  }
  out.push(section('body_wikilinks', JSON.stringify(item.body_wikilinks ?? [])));
  if (item.related_candidates?.length)
    out.push(section('related_candidates', JSON.stringify(item.related_candidates)));

  if (item.read === 'delta') {
    const {added_chunks: chunks = [], ...counts} = item.delta ?? {};
    out.push(section('delta', JSON.stringify(counts)));
    chunks.forEach((chunk, i) =>
      out.push(
        section(`added chunk ${i + 1} of ${chunks.length} (index ${chunk.index})`, chunk.text)
      )
    );
  } else if (item.read === 'folder-delta') {
    const pieces = item.changed_pieces ?? [];
    pieces.forEach((piece, i) =>
      out.push(
        section(
          `changed piece ${i + 1} of ${pieces.length}: ${piece.file_path} (${piece.updated})`,
          piece.body ?? ''
        )
      )
    );
  } else if (item.read === 'outline') {
    const {body_bytes: bytes, headings = []} = item.outline ?? {};
    out.push(section(`outline of ${bytes} bytes`, headings.join('\n')));
  } else {
    out.push(section(`body, ${item.body?.length ?? 0} characters`, item.body ?? ''));
  }
  out.push(`--- end of item ${n} ---`);
  return out.join('\n');
};

const isHighSurrogate = code => code >= 0xd800 && code <= 0xdbff;

/**
 * The page of `text` that starts at `from`: up to `size` characters, ending at the last line break
 * inside them, or, for a single line longer than a page, at `size` (never inside a surrogate pair).
 * `next` is where the following page starts, null after the last.
 */
export const pageOf = (text, from = 0, size = PAGE_CHARS) => {
  if (from + size >= text.length) return {page: text.slice(from), next: null, total: text.length};
  const lineEnd = text.lastIndexOf('\n', from + size - 1);
  let end = lineEnd >= from ? lineEnd + 1 : from + size;
  if (end === from + size && isHighSurrogate(text.charCodeAt(end - 1))) --end;
  return {page: text.slice(from, end), next: end, total: text.length};
};
