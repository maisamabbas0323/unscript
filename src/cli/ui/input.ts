import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { hideCursor, showCursor, clearScreen } from './terminal.js';
import {
  realWidth,
  realHeight,
  renderRegion,
  clearRegion,
  updateRegion,
  fitWidth,
  hintsHtml,
  tagRule,
} from './screen.js';
import { screenHeader } from './banner.js';
import {
  editingState,
  insertChars,
  newline,
  backspace,
  deleteForward,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  moveHome,
  moveEnd,
  layoutEditor,
  isTerminator,
  type EditState,
} from './edit.js';
import { wrap } from '../../utils/text.js';

/**
 * Multiline text entry with a real state-projected editor.
 *
 * The terminal is never the source of truth: every keypress updates a
 * pure `EditState`, and the editor region is repainted from
 * `layoutEditor(state, …)`. Repainting is incremental (`updateRegion`):
 * only the changed rows are erased (to end of line) and redrawn, so
 * ghosts cannot survive — whether a long line is edited down to a short
 * one, the cursor moves between lines, or lines vanish on backspace.
 *
 * Interaction contract:
 *   - Enter (a bare Return) continues — the whole buffer is submitted.
 *     A lone `.` line at the end still submits the lines above it.
 *   - Ctrl+J or Alt+Enter starts a new line (multiline stays available
 *     and is clearly sign-posted in the hints).
 *   - Ctrl+D submits the buffer (trailing empty line dropped) or exits
 *     cleanly when nothing was entered.
 *   - Pasted text is wrapped in bracketed-paste markers: every byte,
 *     including newlines, is inserted as content and only painted once.
 *   - Esc cancels; Ctrl+C interrupts.
 *
 * The finish/cancel *decision* still lives in the pure `reducePrompt`
 * reducer (unit-tested); this function feeds it the same events the
 * editor produces, so the two paths never disagree.
 */

export type TextResult = { kind: 'text'; value: string } | { kind: 'exit'; interrupted: boolean };

export type TextOutcome = TextResult;

/** One collected input event. */
export type PromptEvent =
  | { type: 'line'; value: string }
  /** A lone `.` line: terminate and submit. */
  | { type: 'terminator' }
  /** Ctrl+D / stream end: submit collected content, or exit cleanly. */
  | { type: 'close' }
  /** Esc (interrupted=false) or Ctrl+C (interrupted=true): cancel. */
  | { type: 'cancel'; interrupted: boolean };

/**
 * Pure input contract: decide the outcome of a sequence of prompt events.
 * Returns null while more input is expected.
 */
export function reducePrompt(events: PromptEvent[]): TextOutcome | null {
  const lines: string[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'line':
        lines.push(event.value);
        break;
      case 'terminator':
        return { kind: 'text', value: lines.join('\n') };
      case 'close':
        return lines.length > 0
          ? { kind: 'text', value: lines.join('\n') }
          : { kind: 'exit', interrupted: false };
      case 'cancel':
        return { kind: 'exit', interrupted: event.interrupted };
    }
  }
  return null;
}

/**
 * Pure submit projection for the current buffer: the whole document as
 * `line` events plus `close`, with one trailing empty line dropped —
 * exactly the Ctrl+D contract (unit-tested through `submitEvents`).
 */
export function submitEvents(state: EditState): PromptEvent[] {
  const lines = state.lines;
  const end = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
  return [
    ...lines.slice(0, end).map((value) => ({ type: 'line' as const, value })),
    { type: 'close' },
  ];
}

/**
 * Pure terminator projection: submit the lines above a lone `.` line
 * (used when Enter lands on a terminator).
 */
export function terminatorEvents(state: EditState): PromptEvent[] {
  return [
    ...state.lines.slice(0, state.row).map((value) => ({ type: 'line' as const, value })),
    { type: 'terminator' },
  ];
}

/** A lone `.` is only a terminator at the end of the document. */
function terminatorAtCursor(state: EditState): boolean {
  return (
    isTerminator(state.lines[state.row]!) &&
    state.lines.slice(state.row + 1).every((line) => line === '')
  );
}

/**
 * Pure Enter (= Continue) decision: a lone `.` terminator line submits
 * the lines above it; an empty document submits an empty value (so the
 * caller can explain "No text was entered."); any other document is
 * submitted whole, one trailing empty line dropped.
 */
export function enterOutcome(state: EditState): TextOutcome {
  if (terminatorAtCursor(state)) {
    const decided = reducePrompt(terminatorEvents(state));
    return decided ?? { kind: 'exit', interrupted: false };
  }
  if (state.lines.every((line) => line === '')) {
    return { kind: 'text', value: '' };
  }
  const decided = reducePrompt(submitEvents(state));
  return decided ?? { kind: 'exit', interrupted: false };
}

/**
 * Pure Ctrl+D decision: the whole buffer is submitted (one trailing
 * empty line dropped), or the session exits cleanly when nothing was
 * entered.
 */
export function finishOutcome(state: EditState): TextOutcome {
  const decided = reducePrompt(
    state.lines.every((line) => line === '') ? [{ type: 'close' }] : submitEvents(state),
  );
  return decided ?? { kind: 'exit', interrupted: false };
}

export interface TextPromptOptions {
  /** Screen title (sentence case), rendered as "UNSCRIPT / <title>". */
  title: string;
  /** Supporting instruction shown under the header. */
  instruction?: string;
}

/** A lone `.` line is the explicit terminator (trailing space tolerated). */
export { isTerminator } from './edit.js';

const CONTROL_KEYS = new Set([
  'up',
  'down',
  'left',
  'right',
  'return',
  'backspace',
  'delete',
  'escape',
  'home',
  'end',
  'tab',
  'pageup',
  'pagedown',
  'insert',
]);

const TAG = 'INPUT';

export function promptMultiline(options: TextPromptOptions): Promise<TextResult> {
  return new Promise((resolve) => {
    let state: EditState = editingState();
    let finished = false;
    let previousRows: string[] = [];
    let pasting = false;
    let pasteBuffer = '';

    const hintGroups = (): string[][] => [
      ['Enter', 'continue'],
      ['Ctrl+J', 'new line'],
      ['Ctrl+D', 'finish'],
      ['Esc', 'cancel'],
    ];

    const wrapInstruction = (text?: string): string[] => {
      const width = realWidth();
      const source =
        text ?? 'Write or paste the text you want to rework. New lines are added with Ctrl+J.';
      return wrap(source, Math.max(20, Math.min(60, width - 2)))
        .split('\n')
        .map((line) => fitWidth(theme.muted(line), width));
    };

    const instructionRows = wrapInstruction(options.instruction);

    /** 1-based row where the editor region starts. */
    const regionTop = (): number => {
      return screenHeader(options.title).length + instructionRows.length + 1;
    };

    /** Physical rows the editor may occupy without reaching the footer. */
    const editorRows = (): number => {
      const width = Math.max(20, Math.min(60, realWidth()));
      const footerRows = 1 + 1 + hintsHtml(hintGroups(), width).length;
      const usable = realHeight() - regionTop() - footerRows - 1;
      return Math.max(1, Math.min(usable, 12));
    };

    const footer = (): string[] => {
      const width = realWidth();
      return [
        '',
        tagRule(width, TAG),
        ...hintsHtml(hintGroups(), width).map((line) => theme.muted(line)),
      ];
    };

    const cursorEscape = (layout: { cursor: { row: number; col: number } }): string => {
      return `\u001b[${regionTop() + layout.cursor.row};${layout.cursor.col + 1}H`;
    };

    /** Incremental repaint: only the changed rows are erased and redrawn. */
    const paint = (): void => {
      const layout = layoutEditor(state, realWidth(), editorRows());
      const rows = layout.rows.map((row) => row.replaceAll('\u0001', theme.accent(sym.pointer)));
      updateRegion(regionTop(), previousRows, rows, layout.cursor);
      previousRows = rows;
      process.stdout.write(cursorEscape(layout));
      showCursor();
    };

    /** Full region repaint (initial paint and terminal resize). */
    const paintFull = (): void => {
      const layout = layoutEditor(state, realWidth(), editorRows());
      const rows = layout.rows.map((row) => row.replaceAll('\u0001', theme.accent(sym.pointer)));
      renderRegion(regionTop(), [...rows, ...footer()], layout.cursor);
      previousRows = rows;
      process.stdout.write(cursorEscape(layout));
      showCursor();
    };

    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      process.stdin.removeListener('keypress', onKeypress);
      process.removeListener('SIGINT', onSigint);
      process.stdout.removeListener('resize', onResize);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\u001b[?2004l');
    };

    const settle = (outcome: TextOutcome): void => {
      if (finished) return;
      clearRegion(regionTop());
      showCursor();
      cleanup();
      resolve(outcome);
    };

    const applyText = (text: string): void => {
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      for (const char of normalized) {
        if (char === '\n') {
          const outcome = newline(state);
          if (outcome.kind === 'finish') {
            const events: PromptEvent[] = [
              ...(outcome.text === ''
                ? []
                : outcome.text.split('\n').map((value) => ({ type: 'line' as const, value }))),
              { type: 'terminator' },
            ];
            const decided = reducePrompt(events);
            if (decided !== null) settle(decided);
            return;
          }
          state = outcome.state;
        } else {
          state = insertChars(state, char);
        }
      }
      paint();
    };

    /** Enter = Continue: submit the buffer, or explain an empty one. */
    const submitViaEnter = (): void => {
      settle(enterOutcome(state));
    };

    const onKeypress = (str: string | undefined, key: Key | undefined): void => {
      if (finished) return;
      if (key === undefined || key.name === undefined) return;

      // Bracketed paste: everything between the markers is content, so a
      // pasted document keeps its blank lines and newlines verbatim.
      if (key.name === 'paste-start') {
        pasting = true;
        pasteBuffer = '';
        return;
      }
      if (key.name === 'paste-end') {
        pasting = false;
        if (pasteBuffer !== '') applyText(pasteBuffer);
        else paint();
        return;
      }
      if (pasting) {
        if (key.name === 'return' || key.name === 'enter') {
          pasteBuffer += '\n';
          return;
        }
        const char = str ?? (key.name.length === 1 ? key.name : undefined);
        if (char !== undefined && char !== '' && char !== '\u0001') pasteBuffer += char;
        return;
      }

      if (key.ctrl && key.name === 'd') {
        // Submit the whole buffer (trailing empty line dropped), or exit
        // cleanly when nothing was entered. (Finish = Ctrl+D, unchanged.)
        settle(finishOutcome(state));
        return;
      }
      if (key.ctrl && key.name === 'c') {
        const decided = reducePrompt([{ type: 'cancel', interrupted: true }]);
        if (decided !== null) settle(decided);
        return;
      }
      // Neutralize every other Ctrl chord (notably Ctrl+D): it must not
      // fall through to the text-applier and ghost a literal character.
      if (key.ctrl) return;
      switch (key.name) {
        case 'escape': {
          const decided = reducePrompt([{ type: 'cancel', interrupted: false }]);
          if (decided !== null) settle(decided);
          return;
        }
        case 'return':
          if (key.meta) {
            applyText('\n'); // Alt+Enter: explicit new line
          } else {
            submitViaEnter();
          }
          return;
        case 'enter':
          applyText('\n'); // Ctrl+J (and bare LF): explicit new line
          return;
        case 'backspace':
          state = backspace(state);
          paint();
          return;
        case 'delete':
          state = deleteForward(state);
          paint();
          return;
        case 'left':
          state = moveLeft(state);
          paint();
          return;
        case 'right':
          state = moveRight(state);
          paint();
          return;
        case 'up':
          state = moveUp(state);
          paint();
          return;
        case 'down':
          state = moveDown(state);
          paint();
          return;
        case 'home':
          state = moveHome(state);
          paint();
          return;
        case 'end':
          state = moveEnd(state);
          paint();
          return;
        case 'tab':
        case 'pageup':
        case 'pagedown':
        case 'insert':
          return;
        default:
          break;
      }
      if (CONTROL_KEYS.has(key.name)) return;
      const text = str ?? (key.name.length === 1 ? key.name : undefined);
      if (text === undefined || text === '' || text === '\u0001') return;
      applyText(text);
    };

    const onSigint = (): void => {
      const decided = reducePrompt([{ type: 'cancel', interrupted: true }]);
      if (decided !== null) settle(decided);
    };

    const onResize = (): void => {
      if (!finished) paintFull();
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKeypress);
    process.on('SIGINT', onSigint);
    process.stdout.on('resize', onResize);

    hideCursor();
    clearScreen();
    const width = realWidth();
    process.stdout.write('\u001b[?2004h'); // bracketed paste on for pasted newlines
    const chrome = screenHeader(options.title, width).map((line) => fitWidth(line, width));
    process.stdout.write(`${chrome.join('\n')}\n`);
    process.stdout.write(`${instructionRows.join('\n')}\n\n`);
    paintFull();
  });
}
