import { createInterface, type Key } from 'node:readline';
import { theme } from './theme.js';
import { hideCursor, showCursor, clearScreen } from './terminal.js';
import {
  realWidth,
  realHeight,
  renderRegion,
  updateRegion,
  fitWidth,
  paintLineAt,
} from './screen.js';
import { cellWidth } from '../../utils/text.js';

/**
 * Scrollable full-screen document page (result, knowledge inspector).
 *
 * The document fills the cleared screen top-down and is always clipped to
 * the real terminal height; the first viewport shows rows 1..N so the
 * primary content (the reworked text) is never pushed off a short
 * terminal by later sections. The last row is a pinned footer with the
 * scroll position and the return hint; ↑ ↓ scroll line-by-line, PgUp/PgDn
 * page, Home/End jump, Enter/Esc finish reading.
 *
 * Every content line and the footer are fitted to the real terminal width
 * so colored or unwrapped lines can never overflow the frame and break
 * the redraw math.
 */
export function scrollablePage(lines: string[]): Promise<{ interrupted: boolean }> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let finished = false;
    let top = 0;
    let previous: string[] = [];

    const contentBudget = (): number => Math.max(1, realHeight() - 1);
    const footerRow = (): number => Math.max(2, realHeight());
    const lastTop = (): number => Math.max(0, lines.length - contentBudget());

    const fit = (line: string): string => fitWidth(line, realWidth());

    const footerText = (): string => {
      const total = lines.length;
      const from = top + 1;
      const to = Math.min(total, top + contentBudget());
      const width = realWidth();
      const left = theme.muted(`↑ ↓ ${from}–${to} of ${total}`);
      const right = theme.muted('Press Enter or Esc to return');
      const fill = Math.max(1, width - cellWidth(left) - cellWidth(right));
      return fit(`${left}${' '.repeat(fill)}${right}`);
    };

    const paint = (): void => {
      const next = lines.slice(top, top + contentBudget()).map(fit);
      if (previous.length === 0) {
        renderRegion(1, next);
      } else {
        // Only touched rows are repainted, so the pinned footer survives.
        updateRegion(1, previous, next);
      }
      previous = next;
      paintLineAt(footerRow(), footerText());
    };

    const jump = (value: number): void => {
      const next = Math.min(lastTop(), Math.max(0, value));
      if (next === top) return;
      top = next;
      paint();
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      process.stdout.off('resize', paint);
      showCursor();
      rl.close();
    };

    process.stdin.on('keypress', (_str: string | undefined, key: Key | undefined) => {
      if (finished || key === undefined) return;
      if (key.name === 'up') jump(top - 1);
      else if (key.name === 'down') jump(top + 1);
      else if (key.name === 'pageup') jump(top - contentBudget());
      else if (key.name === 'pagedown' || key.name === 'space') jump(top + contentBudget());
      else if (key.name === 'home') jump(0);
      else if (key.name === 'end') jump(lines.length);
      else if (key.name === 'return' || key.name === 'escape') {
        finish();
        resolve({ interrupted: false });
      }
    });

    process.stdin.on('SIGINT', () => {
      if (finished) return;
      finish();
      resolve({ interrupted: true });
    });

    process.stdin.on('close', () => {
      if (!finished) resolve({ interrupted: false });
    });

    process.stdout.on('resize', () => {
      if (!finished) paint();
    });

    hideCursor();
    clearScreen();
    paint();
  });
}
