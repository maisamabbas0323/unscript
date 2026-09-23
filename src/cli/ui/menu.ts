import { createInterface, type Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { fitFrame, hideCursor, showCursor, clearFrame, keyHint } from './terminal.js';

/**
 * Interactive menu built on node:readline's raw-mode keypress events.
 *
 * Keys handled: ↑ ↓ to move, Enter to select, Esc to exit the menu,
 * Ctrl+C to interrupt. Rendering is frame-based: every rendered line
 * stays inside the terminal width, so redraws are reliable at any size.
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

/**
 * Show an interactive menu. `header` renders the static frame above
 * the choice list and is re-invoked on every redraw.
 */
export function promptSelect<T extends string>(
  header: () => string[],
  choices: Choice<T>[],
): Promise<SelectResult<T>> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let selected = 0;
    let finished = false;
    let drawn = 0;

    const frame = (): string[] => {
      const items = choices.map((choice, index) => {
        const active = index === selected;
        const label = active
          ? `${theme.accent(`${sym.pointer} `)}${theme.bright(choice.label)}`
          : `  ${choice.label}`;
        const note = choice.note ? theme.muted(`  ${choice.note}`) : '';
        return `${label}${note}`;
      });
      return fitFrame([
        ...header(),
        '',
        ...items,
        '',
        ...keyHint([
          ['↑ ↓', 'move'],
          ['Enter', 'select'],
          ['Esc', 'exit'],
          ['Ctrl+C', 'interrupt'],
        ]),
      ]);
    };

    const paint = (lines: string[]): void => {
      process.stdout.write(`${lines.join('\n')}\n`);
      drawn = lines.length;
    };

    const redraw = (): void => {
      clearFrame(drawn);
      paint(frame());
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

    rl.on('SIGINT', () => {
      process.stdout.write('\n');
      process.stdout.write(`${theme.muted('Interrupted.')}\n`);
      finish();
      resolve({ kind: 'exit', interrupted: true });
    });

    rl.on('close', () => {
      if (!finished) resolve({ kind: 'exit', interrupted: false });
    });

    hideCursor();
    paint(frame());
  });
}

/** Wait for one keypress (Enter/Esc/arrows/any) to return to the menu. */
export function promptAnyKey(label = 'Press Enter or Esc to return'): Promise<Interrupt> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let finished = false;

    const hint = fitFrame([theme.muted(label)]);
    hideCursor();
    process.stdout.write(`${hint[0]!}\n`);

    const finish = (): void => {
      if (finished) return;
      finished = true;
      showCursor();
      rl.close();
    };

    process.stdin.on('keypress', (_str: string | undefined, _key: Key | undefined) => {
      process.stdout.write(`\u001b[1A\u001b[K`);
      finish();
      resolve({ interrupted: false });
    });

    rl.on('SIGINT', () => {
      process.stdout.write(`\u001b[1A\u001b[K`);
      process.stdout.write(`${theme.muted('Interrupted.')}\n`);
      finish();
      resolve({ interrupted: true });
    });

    rl.on('close', () => {
      if (!finished) resolve({ interrupted: false });
    });

    hideCursor();
  });
}
