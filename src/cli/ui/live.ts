import { theme } from './theme.js';
import { fitWidth, paintLineAt, realWidth } from './screen.js';

/**
 * One live status line at an absolute row: the current step label plus a
 * single real elapsed stopwatch (total since start). It is never a
 * spinner — the label only changes when real work completes, and the
 * timer measures real elapsed time only. `stop()` clears the interval.
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
    paintLineAt(row, fitWidth(text, realWidth()));
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
