import { cellWidth, toChars } from '../../utils/text.js';

/**
 * Pure multiline editor model for `promptMultiline`.
 *
 * The whole buffer is live: every line, including the one being typed,
 * is part of the same editable document, and the cursor moves freely
 * between lines (↑ ↓ ← →, Home/End, Backspace, Delete). Rendering is a
 * pure projection of `EditState` (see `layoutEditor`); the terminal is
 * never treated as a source of truth, which is what makes stale
 * characters impossible.
 *
 * Finish rules (unchanged contract, expressed as pure decisions):
 *   - Enter on a lone `.` line finishes and submits the lines above it;
 *   - Ctrl+D submits the buffer (trailing empty lines dropped), or
 *     exits cleanly when nothing was entered;
 *   - Esc / Ctrl+C cancel.
 */

export interface EditState {
  /** All lines of the document (never empty; last entry is the cursor line). */
  lines: string[];
  /** 0-based row the cursor is on. */
  row: number;
  /** 0-based code-point column within `lines[row]`. */
  col: number;
}

export function editingState(): EditState {
  return { lines: [''], row: 0, col: 0 };
}

/** A lone `.` line is the explicit terminator (trailing space tolerated). */
export function isTerminator(line: string): boolean {
  return line.trim() === '.';
}

function charLength(text: string): number {
  return toChars(text).length;
}

export function insertChars(state: EditState, text: string): EditState {
  const line = state.lines[state.row]!;
  const chars = toChars(line);
  chars.splice(state.col, 0, ...toChars(text));
  const next = state.lines.slice();
  next[state.row] = chars.join('');
  return { lines: next, row: state.row, col: state.col + charLength(text) };
}

/** Enter / pasted newline. Terminates when the current line is a lone `.`. */
export function newline(
  state: EditState,
): { kind: 'finish'; text: string } | { kind: 'edited'; state: EditState } {
  const current = state.lines[state.row]!;
  if (isTerminator(current)) {
    return { kind: 'finish', text: state.lines.slice(0, state.row).join('\n') };
  }
  const before = toChars(current).slice(0, state.col).join('');
  const after = toChars(current).slice(state.col).join('');
  const next = state.lines.slice();
  next[state.row] = before;
  next.splice(state.row + 1, 0, after);
  return { kind: 'edited', state: { lines: next, row: state.row + 1, col: 0 } };
}

export function backspace(state: EditState): EditState {
  const { lines, row, col } = state;
  const line = lines[row]!;
  const chars = toChars(line);
  if (col > 0) {
    chars.splice(col - 1, 1);
    const next = lines.slice();
    next[row] = chars.join('');
    return { lines: next, row, col: col - 1 };
  }
  if (row > 0) {
    const previous = lines[row - 1]!;
    const next = lines.slice();
    next[row - 1] = previous + line;
    next.splice(row, 1);
    return { lines: next, row: row - 1, col: charLength(previous) };
  }
  return state;
}

export function deleteForward(state: EditState): EditState {
  const { lines, row, col } = state;
  const line = lines[row]!;
  const chars = toChars(line);
  if (col < chars.length) {
    chars.splice(col, 1);
    const next = lines.slice();
    next[row] = chars.join('');
    return { lines: next, row, col };
  }
  if (row < lines.length - 1) {
    const next = lines.slice();
    next[row] = line + next[row + 1]!;
    next.splice(row + 1, 1);
    return { lines: next, row, col };
  }
  return state;
}

export function moveLeft(state: EditState): EditState {
  if (state.col > 0) return { ...state, col: state.col - 1 };
  if (state.row > 0) {
    const previous = state.lines[state.row - 1]!;
    return { lines: state.lines, row: state.row - 1, col: charLength(previous) };
  }
  return state;
}

export function moveRight(state: EditState): EditState {
  const line = state.lines[state.row]!;
  if (state.col < charLength(line)) return { ...state, col: state.col + 1 };
  if (state.row < state.lines.length - 1) {
    return { lines: state.lines, row: state.row + 1, col: 0 };
  }
  return state;
}

export function moveUp(state: EditState): EditState {
  if (state.row === 0) return state;
  const previous = state.lines[state.row - 1]!;
  return { lines: state.lines, row: state.row - 1, col: Math.min(state.col, charLength(previous)) };
}

export function moveDown(state: EditState): EditState {
  if (state.row >= state.lines.length - 1) return state;
  const next = state.lines[state.row + 1]!;
  return { lines: state.lines, row: state.row + 1, col: Math.min(state.col, charLength(next)) };
}

export function moveHome(state: EditState): EditState {
  return { ...state, col: 0 };
}

export function moveEnd(state: EditState): EditState {
  return { ...state, col: charLength(state.lines[state.row]!) };
}

/**
 * Physical viewport row (0-based) at which the buffer's first visible
 * line is rendered — the editor window scrolls with the cursor.
 */
export function viewportTop(state: EditState, maxView: number): number {
  if (state.lines.length <= maxView) return 0;
  const half = Math.floor(maxView / 2);
  return Math.max(0, Math.min(state.row - half, state.lines.length - maxView));
}

/**
 * Cell-wrap one buffer line into physical rows. Row 0 carries the
 * marker prefix; continuation rows are flush-left (a normal soft wrap).
 */
function wrapLine(line: string, prefix: string, width: number): string[] {
  const prefixCells = cellWidth(prefix);
  const chars = toChars(line);
  if (chars.length === 0) return [prefix];
  const firstBudget = Math.max(1, width - prefixCells);
  const rows: string[] = [];
  let index = 0;
  let first = true;
  while (index < chars.length) {
    const budget = first ? firstBudget : width;
    let used = 0;
    let slice = '';
    while (index < chars.length) {
      const charCells = cellWidth(chars[index]!);
      if (used + charCells > budget) break;
      slice += chars[index];
      used += charCells;
      index += 1;
    }
    rows.push(`${first ? prefix : ''}${slice}`);
    first = false;
    if (slice === '' && index < chars.length) {
      // A character wider than the remaining cell moves to its own row.
      rows.push(chars[index]!);
      index += 1;
    }
  }
  return rows;
}

export interface EditorLayout {
  /** Physical rows for the visible viewport (region content, no footer). */
  rows: string[];
  /** Cursor position within `rows` (0-based row and cell column). */
  cursor: { row: number; col: number };
}

/**
 * Pure projection of the editor state onto physical terminal rows.
 * It describes only the *current* state: the renderer erases the whole
 * region and prints exactly these rows, so nothing can linger.
 */
export function layoutEditor(state: EditState, width: number, maxView: number): EditorLayout {
  const top = viewportTop(state, maxView);
  const end = Math.min(top + maxView, state.lines.length);
  const rows: string[] = [];
  let cursor = { row: 0, col: 0 };

  for (let i = top; i < end; i++) {
    const active = i === state.row;
    // Same width (3 cells) on both branches so columns stay aligned.
    // `\u0001` marks the active line's pointer; the renderer paints it.
    const prefix = active ? ' \u0001 ' : '   ';
    const wrapped = wrapLine(state.lines[i]!, prefix, width);
    const startRow = rows.length;
    rows.push(...wrapped);
    if (active) {
      const lineChars = toChars(state.lines[i]!);
      const throughCursor = lineChars.slice(0, state.col).join('');
      const cells = cellWidth(prefix) + cellWidth(throughCursor);
      const physRow = Math.min(startRow + Math.floor(cells / width), startRow + wrapped.length - 1);
      cursor = { row: physRow, col: cells % width };
    }
  }
  return { rows, cursor };
}
