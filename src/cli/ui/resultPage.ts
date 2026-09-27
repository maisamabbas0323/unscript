import { createInterface, type Key } from 'node:readline';
import { theme, sym } from './theme.js';
import { hideCursor, showCursor, clearScreen } from './terminal.js';
import { renderRegion, updateRegion, fitWidth, realWidth, realHeight } from './screen.js';
import { pageHeader } from './banner.js';
import { wrap, cellWidth } from '../../utils/text.js';

/**
 * The transform-result page: ORIGINAL and REWORKED as two bordered panels
 * that are always the same height and width, sized **according to the
 * contents** — short texts shrink both panels together and the saved rows
 * flow to the KNOWLEDGE APPLIED + SOURCES cards below. Copy is available
 * from the very first paint (`c`/`C`, OSC 52 terminal clipboard), and the
 * whole layout adapts live to terminal resizes (side-by-side ≥ 53 cols,
 * stacked below), so no line ever overflows the frame.
 *
 * The screen is one dashboard: header → compare panes → knowledge cards →
 * footer, separated by **responsive gaps** (leftover rows become breathing
 * room between the components; all gaps collapse on tight terminals).
 * KNOWLEDGE APPLIED and SOURCES are visible on the main screen as
 * boxed cards (real retrieval provenance, never invented); `d` opens the
 * full details document (CHECK / CONFLICTS / NOTES) as a scrollable page.
 *
 * Keyboard (text view): ↑↓ / PgUp PgDn / Home End scroll the focused
 * region; Tab (or ← →) cycles ORIGINAL → REWORKED → KNOWLEDGE; `c` copies
 * the focused panel (KNOWLEDGE focus copies REWORKED, the primary output),
 * `C` the other; `d` toggles the details view; Enter/Esc return.
 */

export interface KnowledgeTag {
  /** Real retrieved rule / pattern title (never invented). */
  title: string;
  /** Real retrieval provenance (source doc name) when one is attached. */
  source?: string;
}

export interface SourceEntry {
  name: string;
  url?: string;
}

export interface ComparePageInput {
  /** Raw request text — copied verbatim, never the wrapped render. */
  original: string;
  /** Raw transformed text — the primary output, copied verbatim. */
  reworked: string;
  /** Header summary lines shown under the page title (DONE stats, selection). */
  summary: string[];
  /** Applied knowledge — rendered as the KNOWLEDGE APPLIED card. */
  knowledge: {
    rules: KnowledgeTag[];
    patterns: KnowledgeTag[];
    preservationCount: number;
  };
  /** Retrieved source documents — rendered as the SOURCES card. */
  sources: SourceEntry[];
  /** Full detail document (CHECK / CONFLICTS / NOTES / ...). */
  details: string[];
}

export interface ResultLayout {
  sideBySide: boolean;
  /** Inner content width of one panel (excluding the box borders). */
  inner: number;
  /** Scrollable content rows per compare panel (both panels always equal). */
  paneBudget: number;
  /** Rows allocated to the KNOWLEDGE APPLIED + SOURCES card region. */
  knowledgeRows: number;
  /** Blank rows between the header and the compare panels (responsive). */
  gapHeader: number;
  /** Blank rows between the compare panels and the knowledge cards. */
  gapMiddle: number;
  /** Blank rows between the knowledge cards and the footer. */
  gapFooter: number;
  /** Rows available for the full details document (header/footer excluded). */
  middle: number;
  headerRows: number;
  footerRows: number;
  width: number;
  height: number;
}

/**
 * Adaptive page geometry.
 *
 * `contentH` = the taller of the two wrapped panes, `knowledgeH` = the full
 * height of the knowledge cards. Panels are content-aware: both get the same
 * budget, small texts shrink the panels and free rows for the cards, and the
 * minimums keep every render sane even on tiny terminals.
 *
 * Leftover rows become **responsive gaps** between the structural regions —
 * one row after the header, a growing (capped) separator between the compare
 * panels and the knowledge cards, and the rest above the footer. When the
 * terminal is tight every gap collapses to zero, so content is never clipped.
 */
export function computeResultLayout(
  width = realWidth(),
  height = realHeight(),
  contentH = 0,
  knowledgeH = 0,
): ResultLayout {
  let sideBySide = width >= 53;
  let inner = sideBySide ? Math.max(1, Math.floor((width - 5) / 2)) : Math.max(1, width - 2);

  let footerRows = 2;
  let headerRows = 4;
  let middle = height - headerRows - footerRows;
  if (middle < 6) {
    headerRows = 2;
    middle = height - headerRows - footerRows;
  }
  if (middle < 6) {
    headerRows = 0;
    middle = height - headerRows - footerRows;
  }
  if (middle < 6) {
    footerRows = 1;
    middle = height - headerRows - footerRows;
  }
  if (middle < 2) middle = 2;

  // Degenerate narrow-but-short terminals cannot fit two stacked panels plus
  // a knowledge row (2 blocks + gap + 1 needs 8 rows). Fall back to paired
  // panels so the whole frame stays inside the terminal — never clipped.
  if (!sideBySide && middle < 10) {
    sideBySide = true;
    inner = Math.max(1, Math.floor((width - 5) / 2));
  }

  // The cards get their content height, at least a readable minimum and at
  // most half the middle region; the compare panels get the rest.
  const minK = sideBySide ? 3 : 2;
  const kf = Math.max(
    minK,
    Math.min(Math.max(0, knowledgeH), Math.max(minK, Math.floor(middle / 2))),
  );
  let paneBudget = sideBySide
    ? Math.max(1, middle - kf - 2)
    : Math.max(1, Math.floor((middle - kf - 5) / 2));
  // Content-aware: shrink both panels together when the text is short.
  paneBudget = Math.max(1, Math.min(paneBudget, Math.max(contentH, 2)));
  const used = sideBySide ? paneBudget + 2 : 2 * paneBudget + 5;
  const knowledgeRows = Math.max(1, Math.min(kf, middle - used));

  // Responsive structural gaps: leftover rows become breathing room between
  // the header, the compare panels, the knowledge cards, and the footer.
  const slack = middle - used - knowledgeRows;
  let gapHeader = 0;
  let gapMiddle = 0;
  let gapFooter = 0;
  if (slack > 0) {
    gapHeader = 1;
    const rest = slack - gapHeader;
    gapMiddle = Math.min(3, Math.max(0, Math.floor(rest * 0.6)));
    gapFooter = Math.max(0, rest - gapMiddle);
  }
  return {
    sideBySide,
    inner,
    paneBudget,
    knowledgeRows,
    gapHeader,
    gapMiddle,
    gapFooter,
    middle,
    headerRows,
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
  /** Focused / copy-target panels carry the accent and the `[c] copy` chip. */
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

/**
 * One boxed card (title + optional note + body rows), every row exactly
 * `width` cells wide. Focused cards carry the accent border — on this page
 * the KNOWLEDGE region, so its focus is visible.
 */
function boxedCard(
  title: string,
  note: string,
  lines: string[],
  width: number,
  focused: boolean,
): string[] {
  const edge = focused ? theme.accent : theme.muted;
  const innerW = Math.max(1, width - 2);
  const fit = (content: string): string => {
    const fitted = fitWidth(content, innerW);
    return `${fitted}${' '.repeat(Math.max(0, innerW - cellWidth(fitted)))}`;
  };
  const headNote = note === '' ? '' : `  ${theme.muted(note)}`;
  const head = `${edge('┌')}${fit(`${theme.bright(title)}${headNote}`)}${edge('┐')}`;
  const body = lines.map((line) => `${edge('│')}${fit(line)}${edge('│')}`);
  const bottom = `${edge('└')}${edge(sym.rule.repeat(innerW))}${edge('┘')}`;
  return [head, ...body, bottom];
}

/**
 * The KNOWLEDGE APPLIED + SOURCES cards for the main dashboard — real
 * retrieval data grouped by kind, source-tagged, wrapped to the card width.
 * Pure (no I/O) so it is directly testable.
 */
export function buildKnowledgeCards(
  input: ComparePageInput,
  width: number,
  focused = false,
): string[] {
  const innerW = Math.max(10, width - 2);
  const { rules, patterns, preservationCount } = input.knowledge;
  const rows: string[] = [];

  const group = (label: string, items: KnowledgeTag[]): void => {
    if (items.length === 0) return;
    rows.push(`  ${theme.bright(label)}`);
    for (const item of items) {
      const wrapped = wrap(item.title || '(untitled)', Math.max(8, innerW - 4)).split('\n');
      wrapped.forEach((line, index) => {
        const source =
          index === 0 && item.source !== undefined && item.source !== ''
            ? `  ${theme.muted(item.source)}`
            : '';
        rows.push(`  ${index === 0 ? theme.accent(sym.dot) : ' '} ${line}${source}`);
      });
    }
  };

  group('Transformation rules', rules);
  group('Patterns', patterns);
  if (rules.length === 0 && patterns.length === 0) {
    rows.push(`  ${theme.muted('none retrieved — Sanity returned no applicable knowledge')}`);
  }
  if (preservationCount > 0) {
    rows.push(`  ${theme.success(sym.check)} ${preservationCount} preservation rule(s) enforced`);
  }

  const note =
    rules.length === 0 && patterns.length === 0
      ? ''
      : `${rules.length} rule${rules.length === 1 ? '' : 's'} · ${patterns.length} pattern${
          patterns.length === 1 ? '' : 's'
        }`;
  const knowledgeCard = boxedCard('KNOWLEDGE APPLIED', note, rows, width, focused);

  const sources = input.sources.map((source) => {
    const url = source.url !== undefined && source.url !== '' ? `  ${theme.muted(source.url)}` : '';
    return `  • ${source.name}${url}`;
  });
  if (sources.length === 0) {
    sources.push(`  ${theme.muted('no source attached to the retrieved knowledge')}`);
  }
  const sourcesCard = boxedCard(
    'SOURCES',
    input.sources.length === 0 ? '' : String(input.sources.length),
    sources,
    width,
    focused,
  );

  // One blank row separates the two cards so the components read as distinct
  // boxes even when both fit on screen together.
  return [...knowledgeCard, '', ...sourcesCard];
}

/** `unscript humanize` result page — see module docstring for behavior. */
export function compareResultPage(input: ComparePageInput): Promise<{ interrupted: boolean }> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let finished = false;
    let mode: 'text' | 'details' = 'text';
    let focus: 0 | 1 | 2 = 1; // start on REWORKED, the primary output
    let topOriginal = 0;
    let topReworked = 0;
    let topKnowledge = 0;
    let topDetails = 0;
    let copied: 'original' | 'reworked' | null = null;
    let copyTimer: ReturnType<typeof setTimeout> | null = null;
    let previousRows: string[] = [];

    // Cached wrapped render + knowledge cards, rebuilt only on size or focus changes.
    let cacheInner = -1;
    let cacheWidth = -1;
    let cacheFocused = -1;
    let wrappedOriginal: string[] = [];
    let wrappedReworked: string[] = [];
    let knowledgeCards: string[] = [];
    const paneLines = (inner: number): { original: string[]; reworked: string[] } => {
      if (cacheInner !== inner) {
        cacheInner = inner;
        wrappedOriginal = input.original === '' ? [] : wrap(input.original, inner).split('\n');
        wrappedReworked = input.reworked === '' ? [] : wrap(input.reworked, inner).split('\n');
      }
      return { original: wrappedOriginal, reworked: wrappedReworked };
    };
    const knowledgeDoc = (width: number, focused: boolean): string[] => {
      const flag = focused ? 1 : 0;
      if (cacheWidth !== width || cacheFocused !== flag) {
        cacheWidth = width;
        cacheFocused = flag;
        knowledgeCards = buildKnowledgeCards(input, width, focused);
      }
      return knowledgeCards;
    };

    const clampTop = (value: number, length: number, rows: number): number =>
      Math.min(Math.max(0, length - rows), Math.max(0, value));

    let layout = computeResultLayout();

    const headerRows = (): string[] => {
      const w = layout.width;
      const rows: string[] = [];
      if (layout.headerRows >= 2) rows.push(...pageHeader('Reworked', w));
      if (layout.headerRows >= 4)
        rows.push(...input.summary.slice(0, 2).map((line) => fitWidth(line, w)));
      return rows.slice(0, layout.headerRows);
    };

    const paneRegion = (): string[] => {
      const { original, reworked } = paneLines(layout.inner);
      // Copy target: ORIGINAL on focus 0, REWORKED on focus 1 or 2.
      const left = renderPane({
        title: 'ORIGINAL',
        lines: original,
        top: topOriginal,
        budget: layout.paneBudget,
        inner: layout.inner,
        focused: focus === 0,
      });
      const right = renderPane({
        title: 'REWORKED',
        lines: reworked,
        top: topReworked,
        budget: layout.paneBudget,
        inner: layout.inner,
        focused: focus === 1 || focus === 2,
      });
      if (layout.sideBySide) {
        return left
          .slice(0, layout.paneBudget + 2)
          .map((row, index) => (index < right.length ? `${row} ${right[index]}` : row));
      }
      return [
        ...left.slice(0, layout.paneBudget + 2),
        '',
        ...right.slice(0, layout.paneBudget + 2),
      ];
    };

    const knowledgeRegion = (): string[] => {
      const cards = knowledgeDoc(layout.width, focus === 2).slice(
        topKnowledge,
        topKnowledge + layout.knowledgeRows,
      );
      return cards.map((row) => fitWidth(row, layout.width));
    };

    const middleRegion = (): string[] => {
      if (mode === 'details') {
        return input.details
          .slice(topDetails, topDetails + layout.middle)
          .map((line) => fitWidth(line, layout.width));
      }
      // Responsive structural gaps separate the compare panels, the knowledge
      // cards, and the footer; each collapses to zero when the screen is tight.
      const blank = (count: number): string[] => Array.from({ length: count }, () => '');
      return [
        ...blank(layout.gapHeader),
        ...paneRegion(),
        ...blank(layout.gapMiddle),
        ...knowledgeRegion(),
        ...blank(layout.gapFooter),
      ];
    };

    const footerRows = (): string[] => {
      const w = layout.width;
      let status: string;
      if (mode === 'details') {
        const total = input.details.length;
        const from = Math.min(total, topDetails + 1);
        const to = Math.min(total, topDetails + layout.middle);
        status = theme.muted(`DETAILS ${from}–${to} of ${total}`);
      } else {
        const { original, reworked } = paneLines(layout.inner);
        const cards = knowledgeDoc(layout.width, focus === 2);
        const pos = (lines: string[], top: number, rows: number): string => {
          const total = lines.length;
          return `${Math.min(total, top + 1)}–${Math.min(total, top + rows)} of ${total}`;
        };
        status = theme.muted(
          `ORIGINAL ${pos(original, topOriginal, layout.paneBudget)} · REWORKED ${pos(
            reworked,
            topReworked,
            layout.paneBudget,
          )} · KNOWLEDGE ${pos(cards, topKnowledge, layout.knowledgeRows)}`,
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

    const paint = (): void => {
      const width = realWidth();
      const height = realHeight();
      const inner = width >= 53 ? Math.max(1, Math.floor((width - 5) / 2)) : Math.max(1, width - 2);
      const { original, reworked } = paneLines(inner);
      const cards = knowledgeDoc(width, focus === 2);
      layout = computeResultLayout(
        width,
        height,
        Math.max(original.length, reworked.length),
        cards.length,
      );
      topOriginal = clampTop(topOriginal, original.length, layout.paneBudget);
      topReworked = clampTop(topReworked, reworked.length, layout.paneBudget);
      topKnowledge = clampTop(topKnowledge, cards.length, layout.knowledgeRows);
      topDetails = clampTop(topDetails, input.details.length, layout.middle);
      const rows = [...headerRows(), ...middleRegion(), ...footerRows()].slice(0, height);
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

    const scrollFocused = (delta: number): void => {
      if (mode === 'details') {
        topDetails = clampTop(topDetails + delta, input.details.length, layout.middle);
      } else if (focus === 0) {
        topOriginal = clampTop(
          topOriginal + delta,
          paneLines(layout.inner).original.length,
          layout.paneBudget,
        );
      } else if (focus === 1) {
        topReworked = clampTop(
          topReworked + delta,
          paneLines(layout.inner).reworked.length,
          layout.paneBudget,
        );
      } else {
        topKnowledge = clampTop(
          topKnowledge + delta,
          knowledgeDoc(layout.width, focus === 2).length,
          layout.knowledgeRows,
        );
      }
      paint();
    };

    const onKeypress = (_str: string | undefined, key: Key | undefined): void => {
      if (finished || key === undefined) return;
      if (key.name === 'up') scrollFocused(-1);
      else if (key.name === 'down') scrollFocused(1);
      else if (key.name === 'pageup') scrollFocused(-layout.middle);
      else if (key.name === 'pagedown' || key.name === 'space') scrollFocused(layout.middle);
      else if (key.name === 'home') scrollFocused(-Number.MAX_SAFE_INTEGER);
      else if (key.name === 'end') scrollFocused(Number.MAX_SAFE_INTEGER);
      else if (key.name === 'tab' || key.name === 'left' || key.name === 'right') {
        if (mode === 'details') {
          mode = 'text';
        } else {
          focus = ((focus + 1) % 3) as 0 | 1 | 2;
        }
        paint();
      } else if (mode === 'details') {
        if (key.name === 'd') {
          mode = 'text';
          paint();
        } else if (key.name === 'return' || key.name === 'escape') {
          finish();
          resolve({ interrupted: false });
        }
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
