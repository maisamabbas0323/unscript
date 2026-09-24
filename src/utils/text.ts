/**
 * Terminal-aware text helpers.
 *
 * We never assume a fixed terminal width: prose is wrapped to the
 * measured column count, clamped to a readable range, with a sane
 * default for piped (non-TTY) output.
 */

/** Safe default when the real width is unknown (piped output). */
const DEFAULT_WIDTH = 80;
/** Keep very wide or very narrow terminals readable. */
const MIN_WIDTH = 40;
const MAX_WIDTH = 100;

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** Visible width of a string, ignoring ANSI color codes. */
export function visibleWidth(text: string): number {
  return text.replace(ANSI_PATTERN, '').length;
}

const COMBINING_PATTERN = /\p{Mark}/u;

/** East Asian Wide/Fullwidth and emoji code points occupy two cells. */
function isWideCell(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, punctuation
    (code >= 0x3041 && code <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Ext A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
    (code >= 0x1f300 && code <= 0x1faff) || // Emoji
    (code >= 0x20000 && code <= 0x3fffd) // CJK Ext B+
  );
}

/**
 * Visible terminal cell width of a (possibly ANSI-colored) string.
 * Wide East Asian characters count as 2 cells, combining marks as 0.
 */
export function cellWidth(text: string): number {
  let width = 0;
  for (const part of text.split(ANSI_PATTERN)) {
    for (const char of part) {
      if (COMBINING_PATTERN.test(char)) continue;
      width += isWideCell(char.codePointAt(0)!) ? 2 : 1;
    }
  }
  return width;
}

/** Split a string into code points (surrogate-safe). */
export function toChars(text: string): string[] {
  return [...text];
}

/** Center a (possibly colored) line within `width`, when there is room. */
export function centerLine(text: string, width: number): string {
  const length = visibleWidth(text);
  if (length >= width) return text;
  const pad = Math.floor((width - length) / 2);
  return `${' '.repeat(pad)}${text}`;
}

export function terminalWidth(): number {
  const columns = process.stdout.columns;
  if (!columns || columns < 1) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, columns));
}

/** Word-wrap a string to the terminal width, preserving paragraphs. */
export function wrap(text: string, width?: number): string {
  const w = width ?? terminalWidth();
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs
    .map((paragraph) => {
      const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
      if (words.length === 0) return '';
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        if (current === '') {
          current = word;
        } else if (current.length + 1 + word.length > w) {
          lines.push(current);
          current = word;
        } else {
          current = `${current} ${word}`;
        }
      }
      if (current !== '') lines.push(current);
      return lines.join('\n');
    })
    .join('\n\n');
}
