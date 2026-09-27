import { theme } from './theme.js';
import { fitWidth, cursorAt, realWidth } from './screen.js';

/**
 * One live status line at an absolute row: the current step label plus a
 * single real elapsed stopwatch (total since start). It is never a
 * spinner — the label only changes when real work completes, and the
 * timer measures real elapsed time only. `stop()` clears the interval.
 *
 * While it runs, the live line is the only content on screen (the flow
 * clears the screen first and menus/pages render only after `stop()`), so
 * every paint also blanks everything below the line — stray stderr/debug
 * writes can never leave wrapped remnants next to or under the status.
 *
 * Shared by the transform/knowledge flows (prefix `SANITY`, the connect +
 * rework status) and doctor (prefix `DOCTOR`, the environment checks).
 */
export function liveStatus(
  row: number,
  prefix = 'SANITY',
): {
  setStep(label: string): void;
  done(label: string): void;
  stop(): void;
} {
  let label = '';
  let finished = false;
  const started = Date.now();
  const paint = (): void => {
    if (finished) return;
    const total = Date.now() - started;
    const text =
      `  ${theme.brand('UNSCRIPT')} ${theme.muted('·')} ${theme.accent(prefix)} ` +
      `${theme.muted('·')} ${label}  ${theme.muted(`${(total / 1000).toFixed(1)}s`)}`;
    // The live line owns the whole screen while it runs (clearScreen precedes
    // it; menus/pages only render after stop()). Erase everything below too,
    // so stray stderr/debug output can never linger next to or under it.
    process.stdout.write(`${cursorAt(row, 1)}${fitWidth(text, realWidth())}\u001b[J`);
  };
  const timer = setInterval(paint, 180);
  paint();
  return {
    setStep(next: string): void {
      label = next;
      paint();
    },
    done(final: string): void {
      label = final;
      paint();
    },
    stop(): void {
      if (!finished) {
        finished = true;
        clearInterval(timer);
      }
    },
  };
}
