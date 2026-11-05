/**
 * The vim subset the notes editor speaks, as pure functions over
 * (text, cursor) so it can be tested without a DOM. Normal mode only — in
 * Insert mode the textarea types as usual until Esc.
 *
 * Supported: h j k l, w b, 0 $, gg G, x, dd, yy, p P, i a I A o O.
 * shortcut: no counts, visual mode or text objects; add them here if wanted.
 */

export interface VimBuffer {
  text: string;
  cursor: number;
  /** Last yanked or deleted line(s), always whole lines ending in "\n". */
  register: string;
}

export interface VimResult extends VimBuffer {
  /** Set when the key switches to Insert mode. */
  insert?: boolean;
  /** First key of a two-key command ("d", "y", "g") still waiting. */
  pending?: string;
}

export const lineStart = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;
export const lineEnd = (text: string, pos: number) => {
  const i = text.indexOf("\n", pos);
  return i === -1 ? text.length : i;
};

/** In Normal mode the cursor sits *on* a character, so it can't rest past
 *  the last one on a non-empty line. */
function clampNormal(text: string, pos: number): number {
  const start = lineStart(text, pos);
  const end = lineEnd(text, pos);
  return Math.max(start, Math.min(pos, end > start ? end - 1 : start));
}

function verticalMove(text: string, pos: number, dir: 1 | -1): number {
  const start = lineStart(text, pos);
  const col = pos - start;
  if (dir === 1) {
    const end = lineEnd(text, pos);
    if (end >= text.length) return pos;
    const next = end + 1;
    return clampNormal(text, Math.min(next + col, lineEnd(text, next)));
  }
  if (start === 0) return pos;
  const prev = lineStart(text, start - 1);
  return clampNormal(text, Math.min(prev + col, start - 1));
}

const isWord = (c: string | undefined) => !!c && /\w/.test(c);

function nextWord(text: string, pos: number): number {
  let i = pos;
  const startWord = isWord(text[i]);
  while (i < text.length && isWord(text[i]) === startWord && !/\s/.test(text[i])) i++;
  while (i < text.length && /\s/.test(text[i])) i++;
  return Math.min(i, Math.max(0, text.length - 1));
}

function prevWord(text: string, pos: number): number {
  let i = pos - 1;
  while (i > 0 && /\s/.test(text[i])) i--;
  const w = isWord(text[i]);
  while (i > 0 && isWord(text[i - 1]) === w && !/\s/.test(text[i - 1])) i--;
  return Math.max(0, i);
}

/** The whole line under `pos`, including its trailing newline (or one
 *  added, for the last line), plus where it starts and ends. */
function currentLine(text: string, pos: number) {
  const start = lineStart(text, pos);
  const end = lineEnd(text, pos);
  return { start, end, line: text.slice(start, end) + "\n" };
}

export function normalKey(buf: VimBuffer, key: string, pending = ""): VimResult {
  const { text, cursor, register } = buf;
  const same = (cursorAt: number): VimResult => ({ text, register, cursor: clampNormal(text, cursorAt) });
  const combo = pending + key;

  switch (combo) {
    case "h": case "ArrowLeft":
      return same(Math.max(lineStart(text, cursor), cursor - 1));
    case "l": case "ArrowRight":
      return same(cursor + 1);
    case "j": case "ArrowDown":
      return { text, register, cursor: verticalMove(text, cursor, 1) };
    case "k": case "ArrowUp":
      return { text, register, cursor: verticalMove(text, cursor, -1) };
    case "w": return same(nextWord(text, cursor));
    case "b": return same(prevWord(text, cursor));
    case "0": return same(lineStart(text, cursor));
    case "$": return same(lineEnd(text, cursor));
    case "gg": return same(0);
    case "G": return same(lineStart(text, text.length));

    case "x": {
      if (lineEnd(text, cursor) === cursor) return same(cursor);
      const next = text.slice(0, cursor) + text.slice(cursor + 1);
      return { text: next, register, cursor: clampNormal(next, cursor) };
    }
    case "dd": {
      const { start, end, line } = currentLine(text, cursor);
      // Take the line's own newline, or the one before it on the last line.
      const next = end < text.length
        ? text.slice(0, start) + text.slice(end + 1)
        : text.slice(0, Math.max(0, start - 1));
      return { text: next, register: line, cursor: clampNormal(next, Math.min(start, next.length)) };
    }
    case "yy":
      return { text, cursor, register: currentLine(text, cursor).line };
    case "p": {
      if (!register) return same(cursor);
      const end = lineEnd(text, cursor);
      const next = end < text.length
        ? text.slice(0, end + 1) + register + text.slice(end + 1)
        : text + "\n" + register.slice(0, -1);
      return { text: next, register, cursor: end + 1 };
    }
    case "P": {
      if (!register) return same(cursor);
      const start = lineStart(text, cursor);
      return { text: text.slice(0, start) + register + text.slice(start), register, cursor: start };
    }

    case "i": return { text, register, cursor, insert: true };
    case "a": return { text, register, cursor: Math.min(cursor + 1, lineEnd(text, cursor)), insert: true };
    case "I": return { text, register, cursor: lineStart(text, cursor), insert: true };
    case "A": return { text, register, cursor: lineEnd(text, cursor), insert: true };
    case "o": {
      const end = lineEnd(text, cursor);
      return { text: text.slice(0, end) + "\n" + text.slice(end), register, cursor: end + 1, insert: true };
    }
    case "O": {
      const start = lineStart(text, cursor);
      return { text: text.slice(0, start) + "\n" + text.slice(start), register, cursor: start, insert: true };
    }

    case "d": case "y": case "g":
      return { text, cursor, register, pending: key };
    default:
      return { text, cursor, register };
  }
}

/** 1-based line and column, for the status line. */
export function lineCol(text: string, pos: number): { line: number; col: number } {
  const before = text.slice(0, pos);
  return { line: before.split("\n").length, col: pos - lineStart(text, pos) + 1 };
}
