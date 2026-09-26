import { createInterface, type Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { fitFrame, hideCursor, showCursor, clearScreen } from './terminal.js';
import { realWidth, realHeight, renderRegion, clearRegion, fitWidth, hintsHtml } from './screen.js';

/**
 * Interactive menu built on node:readline's raw-mode keypress events.
 *
 * The screen is cleared once at start, then the `top` block (wordmark,
 * tagline, status) is painted exactly once and stays pinned top-left.
 * Only the choice region below it is redrawn on ↑ ↓, so the logo never
 * duplicates or scrolls. Repaint is region-based (absolute cursor + erase
 * below + full-region projection from current state), so stale fragments
 * can never survive an arrow press or a width change.
 */

export interface Choice<T extends string> {
  id: T;
  label: string;
  /** Dimmed suffix shown after the label (e.g. "later step"). */
  note?: string;
}

export type SelectResult<T extends string> =
  { kind: 'select'; id: T } | { kind: 'exit'; interrupted: boolean };

interface Interrupt {
  interrupted: boolean;
}

/** One choice row drawn as a rectangle-boxed item (accent when active). */
function boxedItem(choice: Choice<string>, active: boolean, width: number): string[] {
  const labelCell = active
    ? `${theme.accent(`${sym.pointer} `)}${theme.bright(choice.label)}`
    : `  ${choice.label}`;
  const note = choice.note !== undefined ? `${theme.muted(`  ${choice.note}`)}` : '';
  const inner = fitWidth(`${labelCell}${note}`, width - 4);
  const border = theme.muted(active ? sym.rule : sym.rule);
  return [
    `${active ? theme.accent('┌') : theme.muted('┌')}${border.repeat(width - 2)}${active ? theme.accent('┐') : theme.muted('┐')}`,
    `${active ? theme.accent('│') : theme.muted('│')} ${theme.bright(inner)} ${active ? theme.accent('│') : theme.muted('│')}`,
    `${active ? theme.accent('└') : theme.muted('└')}${border.repeat(width - 2)}${active ? theme.accent('┘') : theme.muted('┘')}`,
  ];
}

/** Show an interactive menu: standalone async choice over ↑ ↓ / Enter / Esc. */
export function promptSelect<T extends string>(
  top: () => string[],
  choices: Choice<T>[],
): Promise<SelectResult<T>> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let selected = 0;
    let finished = false;

    const width = () => Math.max(20, Math.min(realWidth() - 2, 78));
    const topLines = top();
    const regionTop = topLines.length + 1;

    /** Rendered line budget below the header; never exceeds the terminal height. */
    const visibleCount = (): number => {
      const groups = [
        ['↑ ↓', 'move'],
        ['Enter', 'select'],
        ['Esc', 'exit'],
        ['Ctrl+C', 'interrupt'],
      ];
      const hintRows = hintsHtml(groups, width()).length;
      const available = realHeight() - regionTop;
      // Two blanks separate the boxes from hint rows. When not every choice
      // fits, one extra "N–M of K" line is shown, so budget for it.
      const withoutIndicator = Math.floor((available - 2 - hintRows) / 3);
      if (withoutIndicator >= choices.length) return choices.length;
      return Math.max(1, Math.floor((available - 2 - hintRows - 1) / 3));
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
        .flatMap((choice, index) => boxedItem(choice, start + index === selected, width()));
      const hint = hintsHtml(
        [
          ['↑ ↓', 'move'],
          ['Enter', 'select'],
          ['Esc', 'exit'],
          ['Ctrl+C', 'interrupt'],
        ],
        width(),
      );
      if (visible < choices.length) {
        hint.push(theme.muted(`  ${start + 1}–${end} of ${choices.length}`));
      }
      return ['', ...items, '', ...hint];
    };

    const redraw = (): void => {
      clearRegion(regionTop);
      renderRegion(regionTop, region());
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      showCursor();
      rl.close();
    };

    // Node >=20 emits keypress events on the input stream, not the interface.
    process.stdin.on('keypress', (_str: string | undefined, key: Key | undefined) => {
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
    });

    process.stdin.on('SIGINT', () => {
      finish();
      resolve({ kind: 'exit', interrupted: true });
    });

    process.stdin.on('close', () => {
      if (!finished) resolve({ kind: 'exit', interrupted: false });
    });

    hideCursor();
    clearScreen();
    process.stdout.write(`${fitFrame(topLines).join('\n')}\n`);
    renderRegion(regionTop, region());
  });
}

/** Wait for one keypress (Enter/Esc/arrows/any) to return to the menu. */
export function promptAnyKey(label = 'Press Enter or Esc to return'): Promise<Interrupt> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let finished = false;

    const topLine = (): string[] => [fitFrame([theme.muted(label)])[0]!];

    const regionTop = (): number => 1;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      showCursor();
      rl.close();
    };

    hideCursor();
    clearScreen();
    renderRegion(regionTop(), topLine());

    process.stdin.on('keypress', (_str: string | undefined, _key: Key | undefined) => {
      if (finished) return;
      clearRegion(regionTop());
      finish();
      resolve({ interrupted: false });
    });

    process.stdin.on('SIGINT', () => {
      if (finished) return;
      finish();
      resolve({ interrupted: true });
    });

    process.stdin.on('close', () => {
      if (!finished) resolve({ interrupted: false });
    });
  });
}
