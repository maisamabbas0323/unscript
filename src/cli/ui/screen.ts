import { visibleWidth, cellWidth } from '../../utils/text.js';

/**
 * Stable terminal rendering model shared by every interactive screen.
 *
 * Each screen owns a contiguous region on the (already cleared) display:
 *
 *   - a static header is painted exactly once at the top-left,
 *   - everything below it is the interactive region. On every state
 *     change the whole region is re-painted as a *projection of the
 *     current state*: move to the region top (absolute), erase to the
 *     end of the screen, print the fresh rows, place the cursor
 *     (absolute). Because the region is erased before each paint, no
 *     stale line can survive — "previous states" never accumulate.
 *
 * All row/column addressing is absolute (1-based rows), so redraw math
 * never depends on how many lines we printed before.
 */

/** Real terminal width in cells (never a clamped approximation). */
export function realWidth(): number {
  const columns = process.stdout.columns;
  return columns && columns > 0 ? Math.max(8, columns) : 80;
}

/** Real terminal height in rows. */
export function realHeight(): number {
  const rows = process.stdout.rows;
  return rows && rows > 0 ? rows : 24;
}

/** Move the cursor to an absolute 1-based row/column. */
export function cursorAt(row: number, col: number): string {
  return `\u001b[${row};${col}H`;
}

/** Erase from the cursor to the end of the screen. */
export function eraseBelow(): string {
  return '\u001b[J';
}

/** Erase from the cursor to the end of the current line. */
export function eraseTerminalLine(): string {
  return '\u001b[K';
}

/** Clear one whole line and write new content (absolute 1-based row). */
export function paintLineAt(row: number, line: string): void {
  process.stdout.write(`${cursorAt(row, 1)}${line}${eraseTerminalLine()}`);
}

/**
 * Incremental region update: compare the previously painted rows against
 * the new projection and repaint only the changing tail. Every line is
 * erased to its end before writing, so a long line edited down to a short
 * one leaves nothing behind, and a shrunken wrap count cannot linger.
 *
 * This replaces full-region repaints in hot paths (per keystroke in the
 * editor, per arrow press in menus): it emits only the changed rows plus
 * a fraction of the bytes a full erase-and-paint would, which is what
 * keeps interactive frames from overflowing slow terminals.
 */
export function updateRegion(
  top: number,
  previous: readonly string[],
  next: readonly string[],
  cursor?: { row: number; col: number },
): void {
  let first = 0;
  const limit = Math.min(previous.length, next.length);
  while (first < limit && previous[first] === next[first]) first += 1;
  const rows = Math.max(previous.length, next.length);
  if (rows === 0) {
    if (cursor !== undefined) process.stdout.write(cursorAt(top, cursor.col + 1));
    return;
  }
  let out = '';
  for (let i = first; i < rows; i++) {
    out += `${cursorAt(top + i, 1)}${next[i] ?? ''}${eraseTerminalLine()}`;
  }
  if (cursor !== undefined) {
    out += cursorAt(top + cursor.row, cursor.col + 1);
  }
  process.stdout.write(out);
}

/**
 * Paint a screen region. `top` is the 1-based row where the region
 * starts; `rows` are printed in order; an optional cursor position
 * (region-relative, 0-based) is restored afterwards.
 */
export function renderRegion(
  top: number,
  rows: string[],
  cursor?: { row: number; col: number },
): void {
  let out = `${cursorAt(top, 1)}${eraseBelow()}`;
  if (rows.length > 0) out += `${rows.join('\n')}\n`;
  if (cursor !== undefined && rows.length > 0) {
    out += cursorAt(top + cursor.row, cursor.col + 1);
  }
  process.stdout.write(out);
}

/** Erase a region without repainting it (screen transition cleanup). */
export function clearRegion(top: number): void {
  process.stdout.write(`${cursorAt(top, 1)}${eraseBelow()}`);
}

/** Bound a line to a width in cells (graceful ellipsis, no terminal wrap). */
export function fitWidth(line: string, width: number): string {
  const cells = cellWidth(line);
  if (cells <= width) return line;
  if (width < 2) return width === 1 ? '…' : '';
  let used = 0;
  let out = '';
  for (const char of line) {
    const c = cellWidth(char);
    if (used + c > width - 1) break;
    out += char;
    used += c;
  }
  return `${out}…`;
}

/** Muted keyboard hint line, packed from atomic groups, wrapped softly. */
export function hintsHtml(groups: string[][], width: number): string[] {
  const lines: string[] = [];
  let current = '';
  const join = '   ';
  for (const group of groups) {
    const chunk = group.join(' · ');
    if (current === '') {
      current = chunk;
    } else if (visibleWidth(current) + join.length + visibleWidth(chunk) > width) {
      lines.push(current);
      current = chunk;
    } else {
      current = `${current}${join}${chunk}`;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}
