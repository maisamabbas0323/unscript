import { wrap, visibleWidth } from '../../utils/text.js';
import { theme } from './theme.js';

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

/** Move the cursor up `lines` and clear everything below the frame. */
export function clearFrame(lines: number): void {
  process.stdout.write(`\u001b[${lines}A\u001b[J`);
}

/** Bound every rendered line to the frame width (no terminal wrap). */
export function fitFrame(lines: string[]): string[] {
  const width = frameWidth();
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

/** Muted keyboard hint, packed from atomic groups and bounded to the frame width. */
export function keyHint(groups: string[][], join = '   '): string[] {
  const lines: string[] = [];
  let current = '';
  for (const group of groups) {
    const chunk = group.join(' · ');
    if (current === '') {
      current = chunk;
    } else if (visibleWidth(current) + join.length + visibleWidth(chunk) > frameWidth()) {
      lines.push(current);
      current = chunk;
    } else {
      current = `${current}${join}${chunk}`;
    }
  }
  if (current !== '') lines.push(current);
  return lines.map((line) => theme.muted(line));
}
