/**
 * Reads cards from text: Anki's "Notes in Plain Text" export (File > Export in Anki), or any
 * file with a front and a back on each line, separated by a tab, `;` or `,`.
 *
 * Anki's export starts with header lines such as `#separator:tab`, `#html:true` and
 * `#deck column:3`; columns named there (guid, note type, deck, tags) are skipped, and the
 * first two other columns become the front and the back. Fields may be quoted like in CSV.
 */

const SEPARATORS = { tab: '\t', semicolon: ';', comma: ',', pipe: '|', space: ' ' };

/**
 * @param {string} text
 * @returns {{ notes: { front: string, back: string, deck: string | null }[], skipped: number }}
 */
export function parseNotes(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = {};
  let start = 0;
  while (start < lines.length && lines[start].startsWith('#')) {
    const [key, ...value] = lines[start].slice(1).split(':');
    header[key.trim().toLowerCase()] = value.join(':').trim();
    start++;
  }
  const body = lines.slice(start).join('\n');

  const separator = separatorFrom(header.separator) ?? guessSeparator(body);
  const html = header.html === undefined ? null : header.html.toLowerCase() === 'true';
  const skip = new Set(
    ['guid column', 'notetype column', 'tags column', 'deck column']
      .map((key) => Number(header[key]) - 1)
      .filter((column) => column >= 0),
  );
  const deckColumn = Number(header['deck column']) - 1;

  const notes = [];
  let skipped = 0;
  for (const row of parseRows(body, separator)) {
    if (row.length === 1 && !row[0].trim()) continue;
    const fields = row.filter((_, column) => !skip.has(column));
    const front = toHtml(fields[0] ?? '', html);
    const back = toHtml(fields[1] ?? '', html);
    if (!front.trim()) {
      skipped++;
      continue;
    }
    const deck = deckColumn >= 0 ? (row[deckColumn] ?? '').trim() || null : null;
    notes.push({ front, back, deck });
  }
  return { notes, skipped };
}

function separatorFrom(name) {
  if (!name) return null;
  return SEPARATORS[name.toLowerCase()] ?? (name.length === 1 ? name : null);
}

function guessSeparator(body) {
  const first = body.split('\n').find((line) => line.trim()) ?? '';
  return ['\t', ';', ','].find((candidate) => first.includes(candidate)) ?? '\t';
}

/** Splits CSV-style text: quoted fields may hold separators, newlines and doubled quotes. */
function* parseRows(text, separator) {
  let row = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (char === separator) {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (char === '\n') {
      row.push(field);
      yield row;
      row = [];
      field = '';
      atFieldStart = true;
    } else {
      field += char;
      atFieldStart = false;
    }
  }
  row.push(field);
  yield row;
}

/** Plain text is escaped, with line breaks kept; HTML is kept as it is (cards are cleaned when shown). */
function toHtml(text, html) {
  const value = text.trim();
  const isHtml = html ?? /<\/?[a-z][^>]*>|&[a-z]+;|&#\d+;/i.test(value);
  if (isHtml) return value;
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** Text from the widget's card editor: kept as HTML when it has markup, escaped otherwise. */
export function textToHtml(text) {
  return toHtml(text, null);
}

/** Turns a card side back into text for the editor; cards with markup are edited as HTML. */
export function htmlToText(html) {
  if (/<(?!br\s*\/?>)[a-z][^>]*>/i.test(html)) return html;
  const template = document.createElement('template');
  template.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return template.content.textContent ?? '';
}
