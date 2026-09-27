import { createInterface, type Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { hideCursor, showCursor, clearScreen } from './terminal.js';
import { renderRegion, updateRegion, fitWidth, realWidth, realHeight } from './screen.js';
import { pageHeader } from './banner.js';
import { wrap, cellWidth } from '../../utils/text.js';

/**
 * The transform-result page: ORIGINAL and REWORKED as two independently
 * scrollable panels with per-pane copy, plus a details view (provenance,
 * checks, sources) and a responsive layout.
 *
 * Layout adapts to the terminal on every paint and on every `resize`:
 * wide terminals (>= 53 columns) show the two panels side by side, narrow
 * ones stack them vertically, and the pane budgets always fit the real
 * height — so no line ever overflows the frame and the redraw math stays
 * correct. Copy uses the terminal clipboard (OSC 52), a real mechanism,
 * and flashes an honest confirmation ("to terminal clipboard").
 *
 * Keyboard (text view): ↑ ↓ / PgUp PgDn / Home End scroll the focused
 * panel; Tab (or ← →) switches focus; `c` copies the focused panel,
 * `C` the other; `d` toggles the details view; Enter/Esc return.
 */

export interface ComparePageInput {
  /** Raw request text — copied verbatim, never the wrapped render. */
  original: string;
  /** Raw transformed text — the primary output, copied verbatim. */
  reworked: string;
  /** Header summary lines shown under the page title (DONE stats, selection). */
  summary: string[];
  /** Full detail document (KNOWLEDGE APPLIED / SOURCES / CHECK / ...). */
  details: string[];
}

export interface ResultLayout {
  sideBySide: boolean;
  /** Inner content width of one panel (excluding the box borders). */
  inner: number;
  /** Scrollable content rows per panel. */
  budget: number;
  /** 1-based first row of the interactive middle region. */
  regionTop: number;
  /** Rows available for the middle region. */
  regionRows: number;
  /** Fixed header rows (title + optional summary). */
  headerRows: number;
  /** 1-based first footer row. */
  footerTop: number;
  /** Footer rows (status + hints). */
  footerRows: number;
  width: number;
  height: number;
}

/**
 * Adaptive page geometry. Header/footer shrink before the panel region
 * does, and the minimums keep every render sane even on tiny terminals.
 */
export function computeResultLayout(width = realWidth(), height = realHeight()): ResultLayout {
  const sideBySide = width >= 53;
  const inner = sideBySide ? Math.max(1, Math.floor((width - 5) / 2)) : Math.max(1, width - 2);
  let footerRows = 2;
  let headerRows = 4;
  let middle = height - footerRows - headerRows;
  if (middle < 3) {
    headerRows = 2;
    middle = height - footerRows - headerRows;
  }
  if (middle < 3) {
    headerRows = 0;
    middle = height - footerRows - headerRows;
  }
  if (middle < 3) {
    footerRows = 1;
    middle = height - footerRows - headerRows;
  }
  const budget = sideBySide ? Math.max(1, middle - 2) : Math.max(1, Math.floor((middle - 5) / 2));
  return {
    sideBySide,
    inner,
    budget,
    regionTop: Math.max(1, headerRows + 1),
    regionRows: Math.max(0, middle),
    headerRows,
    footerTop: Math.max(height - footerRows + 1, 1),
    footerRows,
    width,
    height,
  };
}

/** OSC 52 clipboard write: real terminal clipboard, dependency-free. */
export function osc52Sequence(text: string): string {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  return `\x1b]52;c;${encoded}\x1b\\`;
}

export interface PaneRenderOptions {
  title: string;
  /** Wrapped display lines (already fitted to `inner` by the caller or here). */
  lines: string[];
  /** First content line to show. */
  top: number;
  /** Visible content rows. */
  budget: number;
  /** Inner content width. */
  inner: number;
  /** Focused panels carry the accent and the `[c] copy` chip. */
  focused: boolean;
}

/** Render one bordered panel; every row is exactly `inner + 2` cells wide. */
export function renderPane(options: PaneRenderOptions): string[] {
  const { title, lines, top, budget, inner, focused } = options;
  const edge = focused ? theme.accent : theme.muted;
  const name = focused ? theme.accent(`› ${title}`) : theme.muted(title);
  const total = lines.length;
  const from = Math.min(total, top + 1);
  const to = Math.min(total, top + budget);
  const chip = focused ? theme.accent('[c] copy') : theme.muted('[C] copy');
  const statusText = `${chip}  ${from}–${to} of ${total}`;

  const innerContent = (content: string, cap = inner): string => {
    const fitted = fitWidth(content, cap);
    return `${fitted}${' '.repeat(Math.max(0, cap - cellWidth(fitted)))}`;
  };

  const head = `${edge('┌')}${innerContent(`${theme.muted('─')}${name}`)}${edge('┐')}`;
  const contentRows: string[] = [];
  for (let i = 0; i < budget; i++) {
    const line = lines[top + i];
    contentRows.push(`${edge('│')}${innerContent(line ?? '')}${edge('│')}`);
  }
  const bottom = `${edge('└')}${innerContent(statusText)}${edge('┘')}`;
  return [head, ...contentRows, bottom];
}

/** `unscript humanize` result page — see module docstring for behavior. */
export function compareResultPage(input: ComparePageInput): Promise<{ interrupted: boolean }> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let finished = false;
    let mode: 'text' | 'details' = 'text';
    let focus: 0 | 1 = 1; // start on REWORKED, the primary output
    let topOriginal = 0;
    let topReworked = 0;
    let topDetails = 0;
    let copied: 'original' | 'reworked' | null = null;
    let copyTimer: ReturnType<typeof setTimeout> | null = null;
    let previousRows: string[] = [];

    // Wrapped display lines, cached per inner width; rebuilt on resize.
    let cacheInner = -1;
    let wrappedOriginal: string[] = [];
    let wrappedReworked: string[] = [];
    const paneLines = (inner: number): { original: string[]; reworked: string[] } => {
      if (cacheInner !== inner) {
        cacheInner = inner;
        wrappedOriginal = input.original === '' ? [] : wrap(input.original, inner).split('\n');
        wrappedReworked = input.reworked === '' ? [] : wrap(input.reworked, inner).split('\n');
      }
      return { original: wrappedOriginal, reworked: wrappedReworked };
    };

    const clampTop = (value: number, length: number, budget: number): number =>
      Math.min(Math.max(0, length - budget), Math.max(0, value));

    const focusTop = (): number => (focus === 0 ? topOriginal : topReworked);
    const setFocusTop = (value: number): void => {
      const lines =
        focus === 0 ? paneLines(layout.inner).original : paneLines(layout.inner).reworked;
      const next = clampTop(value, lines.length, layout.budget);
      if (focus === 0) topOriginal = next;
      else topReworked = next;
    };

    let layout = computeResultLayout();

    const headerRows = (): string[] => {
      const w = layout.width;
      const rows: string[] = [];
      if (layout.headerRows >= 2) rows.push(...pageHeader('Reworked', w));
      if (layout.headerRows >= 4)
        rows.push(...input.summary.slice(0, 2).map((line) => fitWidth(line, w)));
      return rows.slice(0, layout.headerRows);
    };

    const footerRows = (): string[] => {
      const w = layout.width;
      let status: string;
      if (mode === 'details') {
        const total = input.details.length;
        const from = Math.min(total, topDetails + 1);
        const to = Math.min(total, topDetails + layout.regionRows);
        status = theme.muted(`DETAILS ${from}–${to} of ${total}`);
      } else {
        const { original, reworked } = paneLines(layout.inner);
        const pos = (lines: string[], top: number): string => {
          const total = lines.length;
          return `${Math.min(total, top + 1)}–${Math.min(total, top + layout.budget)} of ${total}`;
        };
        status = theme.muted(
          `ORIGINAL ${pos(original, topOriginal)} · REWORKED ${pos(reworked, topReworked)}`,
        );
      }
      const flash =
        copied === null
          ? ''
          : theme.success(`${sym.check} Copied ${copied} — sent to terminal clipboard`);
      const statusRow = fitWidth(
        `${status}${' '.repeat(Math.max(1, w - cellWidth(status) - cellWidth(flash)))}${flash}`,
        w,
      );
      const hints = fitWidth(
        mode === 'details'
          ? '  [d] back to panes · [↑↓/PgUp/PgDn/Home/End] scroll · Enter/Esc return'
          : '  [c] copy focused · [C] copy other · [Tab] switch · [d] details · [↑↓] scroll · Enter/Esc return',
        w,
      );
      return (layout.footerRows >= 2 ? [statusRow, hints] : [statusRow]).slice(
        0,
        layout.footerRows,
      );
    };

    const regionRows = (): string[] => {
      const w = layout.width;
      const { original, reworked } = paneLines(layout.inner);
      if (mode === 'details') {
        return input.details
          .slice(topDetails, topDetails + layout.regionRows)
          .map((line) => fitWidth(line, w));
      }
      const pane = (title: string, lines: string[], top: number): string[] =>
        renderPane({
          title,
          lines,
          top,
          budget: layout.budget,
          inner: layout.inner,
          focused: (title === 'ORIGINAL') === (focus === 0),
        }).slice(0, Math.max(0, layout.regionRows));
      const left = pane('ORIGINAL', original, topOriginal);
      const right = pane('REWORKED', reworked, topReworked);
      if (layout.sideBySide) {
        return left.map((row, index) => (index < right.length ? `${row} ${right[index]}` : row));
      }
      return [...left, '', ...right].slice(0, layout.regionRows);
    };

    const paint = (): void => {
      layout = computeResultLayout();
      const lines = paneLines(layout.inner).original;
      const rew = paneLines(layout.inner).reworked;
      topOriginal = clampTop(topOriginal, lines.length, layout.budget);
      topReworked = clampTop(topReworked, rew.length, layout.budget);
      topDetails = clampTop(topDetails, input.details.length, layout.regionRows);
      const rows = [...headerRows(), ...regionRows(), ...footerRows()];
      if (previousRows.length === 0) {
        renderRegion(1, rows);
      } else {
        updateRegion(1, previousRows, rows);
      }
      previousRows = rows;
    };

    const copy = (which: 'original' | 'reworked'): void => {
      process.stdout.write(osc52Sequence(which === 'original' ? input.original : input.reworked));
      if (copyTimer !== null) clearTimeout(copyTimer);
      copied = which;
      paint();
      copyTimer = setTimeout(() => {
        if (finished) return;
        copied = null;
        paint();
      }, 1400);
    };

    const changeFocus = (value: 0 | 1): void => {
      if (focus === value) return;
      focus = value;
      paint();
    };

    const scrollDetails = (delta: number): void => {
      topDetails = clampTop(topDetails + delta, input.details.length, layout.regionRows);
      paint();
    };

    const onKeypress = (_str: string | undefined, key: Key | undefined): void => {
      if (finished || key === undefined) return;
      if (mode === 'details') {
        if (key.name === 'up') scrollDetails(-1);
        else if (key.name === 'down') scrollDetails(1);
        else if (key.name === 'pageup') scrollDetails(-layout.regionRows);
        else if (key.name === 'pagedown' || key.name === 'space') scrollDetails(layout.regionRows);
        else if (key.name === 'home') scrollDetails(-input.details.length);
        else if (key.name === 'end') scrollDetails(input.details.length);
        else if (key.name === 'd' || key.name === 'tab') {
          mode = 'text';
          paint();
        } else if (key.name === 'return' || key.name === 'escape') {
          finish();
          resolve({ interrupted: false });
        }
        return;
      }
      if (key.name === 'up') {
        setFocusTop(focusTop() - 1);
        paint();
      } else if (key.name === 'down') {
        setFocusTop(focusTop() + 1);
        paint();
      } else if (key.name === 'pageup') {
        setFocusTop(focusTop() - layout.budget);
        paint();
      } else if (key.name === 'pagedown' || key.name === 'space') {
        setFocusTop(focusTop() + layout.budget);
        paint();
      } else if (key.name === 'home') {
        setFocusTop(0);
        paint();
      } else if (key.name === 'end') {
        setFocusTop(Number.MAX_SAFE_INTEGER);
        paint();
      } else if (key.name === 'tab' || key.name === 'left' || key.name === 'right') {
        changeFocus(focus === 0 ? 1 : 0);
      } else if (key.name === 'c' && key.shift !== true) {
        copy(focus === 0 ? 'original' : 'reworked');
      } else if (key.name === 'C' || (key.name === 'c' && key.shift === true)) {
        copy(focus === 0 ? 'reworked' : 'original');
      } else if (key.name === 'd') {
        mode = 'details';
        paint();
      } else if (key.name === 'return' || key.name === 'escape') {
        finish();
        resolve({ interrupted: false });
      }
    };

    const onSigint = (): void => {
      if (finished) return;
      finish();
      resolve({ interrupted: true });
    };

    const onClose = (): void => {
      if (!finished) resolve({ interrupted: false });
    };

    const onResize = (): void => {
      if (!finished) paint();
    };

    /** Detach every listener this screen added (no leaks across the session). */
    const cleanup = (): void => {
      if (copyTimer !== null) clearTimeout(copyTimer);
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
    paint();
  });
}
