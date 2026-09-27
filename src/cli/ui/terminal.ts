import { wrap } from '../../utils/text.js';

/**
 * Low-level terminal helpers for the interactive UI.
 *
 * Rendering never assumes a fixed width: every frame line is bounded
 * to the measured terminal width, so redraw math stays correct even in
 * narrow terminals.
 */

/** Max width used for interactive frames (readable even on wide screens). */
export const FRAME_MAX_WIDTH = 60;

export function frameWidth(): number {
  const columns = process.stdout.columns;
  const width = columns && columns > 0 ? columns : 80;
  return Math.max(24, Math.min(width, FRAME_MAX_WIDTH));
}

export function hideCursor(): void {
  process.stdout.write('\u001b[?25l');
}

export function showCursor(): void {
  process.stdout.write('\u001b[?25h');
}

/** Erase the whole screen (and scrollback) and move the cursor home. */
export function clearScreen(): void {
  process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
}

/** Bound every rendered line to a width (default: the frame width), so no
 * line can wrap in the terminal. Pass `realWidth()` when a pinned identity
 * block may span more than the 60-column menu frame (e.g. the 76-column
 * logo on the home screen). */
export function fitFrame(lines: string[], width: number = frameWidth()): string[] {
  return lines.map((line) => {
    const visible = line.replace(/\u001b\[[0-9;]*m/g, '');
    if (visible.length <= width) return line;
    return width > 3
      ? line.slice(0, Math.max(0, width - 1)) + '…'
      : line.slice(0, Math.max(0, width));
  });
}

/** Wrap a frame-width paragraph, indenting subsequent lines. */
export function frameProse(text: string, indent = 0): string {
  const width = frameWidth() - indent;
  return wrap(text, Math.max(20, width))
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${' '.repeat(indent)}${line}`))
    .join('\n');
}
