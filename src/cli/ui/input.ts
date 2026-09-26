import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { hideCursor, showCursor, clearScreen, keyHint } from './terminal.js';
import { realWidth, realHeight, renderRegion, clearRegion, fitWidth, tagRule } from './screen.js';
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
  type EditState,
} from './edit.js';
import { wrap } from '../../utils/text.js';

/**
 * Multiline text entry with a real state-projected editor.
 *
 * The terminal is never the source of truth: every keypress updates a
 * pure `EditState` and the whole owned region is erased and re-painted
 * from `layoutEditor(state, …)`. Because the region is fully cleared
 * before each paint, stale characters cannot survive — even when a long
 * line is edited down to a short one, or the cursor moves between lines.
 *
 * The finish/cancel contract lives in the pure `reducePrompt` reducer
 * (unit-tested); this function feeds it the same events the old
 * line-mode collector did:
 *   - Enter on a lone `.` line → the lines above it are submitted;
 *   - Ctrl+D → the whole buffer is submitted (or a clean exit when empty);
 *   - Esc → clean cancel; Ctrl+C → interrupt.
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
    const footerRows = 3; // blank, tag-rule, hints
    const regionTop = (): number => {
      const chrome =
        screenHeader(options.title).length + wrapInstruction(options.instruction).length + 1;
      return chrome + 1;
    };
    const maxView = (): number => {
      const usable = realHeight() - regionTop() - footerRows - 1;
      return Math.max(1, Math.min(usable, 12));
    };

    let state: EditState = editingState();
    let finished = false;

    const wrapInstruction = (text?: string): string[] => {
      const width = realWidth();
      const source =
        text ??
        'Write or paste the text you want to rework. A lone `.` on its own line, or Ctrl+D, finishes. Esc cancels. Blank lines inside the pasted text are kept.';
      return wrap(source, Math.max(20, Math.min(60, width - 2)))
        .split('\n')
        .map((line) => fitWidth(theme.muted(line), width));
    };

    const paint = (): void => {
      const width = realWidth();
      const top = regionTop();
      const layout = layoutEditor(state, width, maxView());
      const rows = [
        ...layout.rows.map((row) => row.replaceAll('\u0001', theme.accent(sym.pointer))),
        '',
        tagRule(width, TAG),
        ...keyHint([
          ['Enter', 'new line'],
          ['Ctrl+D', 'finish'],
          ['Esc', 'cancel'],
        ]),
      ];
      renderRegion(top, rows, layout.cursor);
    };

    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      process.stdin.removeListener('keypress', onKeypress);
      process.removeListener('SIGINT', onSigint);
      process.stdout.removeListener('resize', onResize);
      process.stdin.setRawMode(false);
      process.stdin.pause();
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

    const onKeypress = (str: string | undefined, key: Key | undefined): void => {
      if (finished) return;
      if (key === undefined || key.name === undefined) return;
      if (key.ctrl && key.name === 'd') {
        // Submit the whole buffer (trailing empty lines dropped), or
        // exit cleanly when nothing was entered. (Finish = Ctrl+D.)
        const allEmpty = state.lines.every((line) => line === '');
        const events: PromptEvent[] = allEmpty
          ? [{ type: 'close' }]
          : [
              ...state.lines
                .slice(0, state.lines.length - (state.lines[state.lines.length - 1] === '' ? 1 : 0))
                .map((value) => ({ type: 'line' as const, value })),
              { type: 'close' },
            ];
        const decided = reducePrompt(events);
        if (decided !== null) settle(decided);
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
          applyText('\n');
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
      if (!finished) paint();
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
    const chrome = screenHeader(options.title, width).map((line) => fitWidth(line, width));
    process.stdout.write(`${chrome.join('\n')}\n`);
    const instruction = wrapInstruction(options.instruction);
    process.stdout.write(`${instruction.join('\n')}\n\n`);
    paint();
  });
}
