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
