import { createInterface, type Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { fitFrame, hideCursor, showCursor, clearScreen } from './terminal.js';
import {
  realWidth,
  realHeight,
  renderRegion,
  updateRegion,
  fitWidth,
  paintLineAt,
  hintsHtml,
} from './screen.js';
import { wrap, cellWidth } from '../../utils/text.js';

/**
 * Interactive menu built on node:readline's raw-mode keypress events.
 *
 * The screen is cleared once at start, then the `top` block (wordmark,
 * tagline, status) is painted exactly once and stays pinned top-left.
 * Only the choice region below it is updated on ↑ ↓: each arrow press
 * repaints just the rows that changed (see `updateRegion`), so the
 * previous selection is erased the moment the new one is drawn — the
 * terminal never accumulates one selection under another.
 *
 * Choices are single-row items with one indicator (`›` accents the
 * active item); inactive items are aligned with the same indent so the
 * column never jumps. When the list is taller than the screen it scrolls
 * with an "N–M of K" position line. Below the list a live detail pane
 * shows the heading, the full description, and a short human aside of the
 * active choice, re-rendered on every arrow so there is always a focused
 * preview worth reading.
 */

export interface Choice<T extends string> {
  id: T;
  label: string;
  /** Dimmed suffix shown after the label (e.g. "later step"). */
  note?: string;
  /** Long-form description shown live in a detail pane under the list. */
  description?: string;
  /** Short human aside under the description — an honest behavior note. */
  aside?: string;
}

export type SelectResult<T extends string> =
  { kind: 'select'; id: T } | { kind: 'exit'; interrupted: boolean };

interface Interrupt {
  interrupted: boolean;
}

export interface SelectOptions {
  /** Esc behaviour: "back" (default) or "exit" for the home screen. */
  escLabel?: 'back' | 'exit';
}

/** One choice row: exactly one indicator, aligned across states. */
function itemRow(choice: Choice<string>, active: boolean, width: number): string {
  const label = active
    ? `${'  '}${theme.accent(sym.pointer)} ${theme.bright(choice.label)}`
    : `${'    '}${choice.label}`;
  const note = choice.note !== undefined ? `${theme.muted(`  ${choice.note}`)}` : '';
  return fitWidth(`${label}${note}`, width);
}

/** Show an interactive menu: standalone async choice over ↑ ↓ / Enter / Esc. */
export function promptSelect<T extends string>(
  top: () => string[],
  choices: Choice<T>[],
  options: SelectOptions = {},
): Promise<SelectResult<T>> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const escLabel = options.escLabel ?? 'back';
    let selected = 0;
    let finished = false;
    let previousRows: string[] = [];

    const width = () => Math.max(20, Math.min(realWidth() - 2, 78));
    const topLines = top();
    const regionTop = topLines.length + 1;

    const hintGroups = (): string[][] => [
      ['↑ ↓', 'move'],
      ['Enter', 'select'],
      ['Esc', escLabel],
      ['Ctrl+C', 'interrupt'],
    ];

    /**
     * Live detail pane for the active choice: a rule-joined heading, the
     * full description wrapped (capped), and a short human aside (capped)
     * that states an honest behavior note. Re-rendered on every arrow.
     * Empty when the active choice has no description or aside.
     */
    const detailLines = (): string[] => {
      const choice = choices[selected];
      if (choice === undefined) return [];
      const w = width();
      const wrapAt = Math.max(16, w - 6);
      const body: string[] = [];
      const description = choice.description;
      if (description !== undefined && description !== '') {
        for (const line of wrap(description, wrapAt).split('\n').slice(0, 3)) {
          body.push(`  ${theme.muted(line)}`);
        }
      }
      const aside = choice.aside;
      if (aside !== undefined && aside !== '') {
        for (const line of wrap(aside, wrapAt).split('\n').slice(0, 2)) {
          body.push(`  ${theme.info(sym.rule)} ${theme.muted(line)}`);
        }
      }
      if (body.length === 0) return [];
      const marker = theme.muted(sym.rule);
      const head = `${marker.repeat(2)} ${theme.accent(choice.label.toUpperCase())} ${marker}`;
      // Exact pad: heading + pad == w (the rule itself is the separator,
      // replacing the old blank line so the full menu still fits on the
      // logo tier).
      const pad = Math.max(0, w - 2 - cellWidth(head));
      return [`  ${head}${marker.repeat(pad)}`, ...body];
    };

    /** Rendered line budget below the header; never exceeds the terminal height. */
    const visibleCount = (): number => {
      const hintRows = hintsHtml(hintGroups(), width()).length;
      const detailRows = detailLines().length;
      const available = realHeight() - regionTop;
      // Two blanks separate the items from the hint rows. When not every
      // choice fits, one extra "N–M of K" line is shown, so budget for it.
      const withoutIndicator = available - 2 - hintRows - detailRows;
      if (withoutIndicator >= choices.length) return choices.length;
      return Math.max(1, withoutIndicator - 1);
    };

    /** Visible window [start, end) so the selection is always on screen. */
    const range = (): readonly [number, number] => {
      const visible = visibleCount();
      const start = Math.max(
        0,
        Math.min(selected - Math.floor(visible / 2), choices.length - visible),
      );
      return [start, start + visible] as const;
    };

    const region = (): string[] => {
      const visible = visibleCount();
      const [start, end] = range();
      const items = choices
        .slice(start, end)
        .map((choice, index) => itemRow(choice, start + index === selected, width()));
      const hint = hintsHtml(hintGroups(), width());
      if (visible < choices.length) {
        hint.push(`${start + 1}–${end} of ${choices.length}`);
      }
      return ['', ...items, '', ...hint.map((line) => `  ${theme.muted(line)}`), ...detailLines()];
    };

    /** Incremental repaint: only the changed selection rows are redrawn. */
    const redraw = (): void => {
      const rows = region();
      updateRegion(regionTop, previousRows, rows);
      previousRows = rows;
    };

    const fullPaint = (): void => {
      const rows = region();
      renderRegion(regionTop, rows);
      previousRows = rows;
    };

    const onKeypress = (_str: string | undefined, key: Key | undefined): void => {
      if (finished || key === undefined) return;
      if (key.name === 'up') {
        selected = (selected - 1 + choices.length) % choices.length;
        redraw();
      } else if (key.name === 'down') {
        selected = (selected + 1) % choices.length;
        redraw();
      } else if (key.name === 'return') {
        finish();
        resolve({ kind: 'select', id: choices[selected]!.id });
      } else if (key.name === 'escape') {
        finish();
        resolve({ kind: 'exit', interrupted: false });
      }
    };

    const onSigint = (): void => {
      finish();
      resolve({ kind: 'exit', interrupted: true });
    };

    const onClose = (): void => {
      if (!finished) resolve({ kind: 'exit', interrupted: false });
    };

    const onResize = (): void => {
      if (!finished) fullPaint();
    };

    /** Detach every listener this screen added (no leaks across the session). */
    const cleanup = (): void => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.off('SIGINT', onSigint);
      process.stdin.off('close', onClose);
      process.stdout.off('resize', onResize);
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      cleanup();
      showCursor();
      rl.close();
    };

    process.stdin.on('keypress', onKeypress);
    process.stdin.on('SIGINT', onSigint);
    process.stdin.on('close', onClose);
    process.stdout.on('resize', onResize);

    hideCursor();
    clearScreen();
    process.stdout.write(`${fitFrame(topLines, realWidth()).join('\n')}\n`);
    fullPaint();
  });
}

/**
 * Wait for one keypress (Enter/Esc/arrows/any) to return to the menu.
 *
 * Overlay prompt: this does NOT clear the page beneath it. The label is
 * pinned to the bottom row of the terminal (that row is erased first), so
 * it stays visible no matter how tall the page content is, and the page —
 * the transformed result, the knowledge inspector, help — stays readable
 * until the user actually returns. On keypress the label row is erased
 * again and the caller re-renders over the still-live screen.
 */
export function promptAnyKey(label = 'Press Enter or Esc to return'): Promise<Interrupt> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let finished = false;

    const bottom = (): number => Math.max(1, realHeight());
    const paint = (): void => {
      paintLineAt(bottom(), fitWidth(theme.muted(label), realWidth()));
    };

    const onKeypress = (_str: string | undefined, _key: Key | undefined): void => {
      if (finished) return;
      finish();
      resolve({ interrupted: false });
    };

    const onSigint = (): void => {
      if (finished) return;
      finish();
      resolve({ interrupted: true });
    };

    const onClose = (): void => {
      if (!finished) resolve({ interrupted: false });
    };

    /** Detach every listener this screen added (no leaks across the session). */
    const cleanup = (): void => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.off('SIGINT', onSigint);
      process.stdin.off('close', onClose);
      process.stdout.off('resize', paint);
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      cleanup();
      paintLineAt(bottom(), '');
      showCursor();
      rl.close();
    };

    hideCursor();
    paint();
    process.stdout.on('resize', paint);

    process.stdin.on('keypress', onKeypress);
    process.stdin.on('SIGINT', onSigint);
    process.stdin.on('close', onClose);
  });
}
