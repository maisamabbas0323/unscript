import { describe, expect, it } from 'vitest';
import {
  computeResultLayout,
  osc52Sequence,
  renderPane,
  buildKnowledgeCards,
  type ComparePageInput,
} from '../src/cli/ui/resultPage.js';

const stripAnsi = (line: string): string => line.replace(/\u001b\[[0-9;]*m/g, '');

const sampleInput: ComparePageInput = {
  original: '',
  reworked: '',
  summary: [],
  knowledge: {
    rules: [
      { title: 'Write in active voice', source: 'Editorial style guide' },
      { title: 'Vary sentence length', source: 'Editorial style guide' },
    ],
    patterns: [{ title: 'Remove repetitive filler' }],
    preservationCount: 2,
  },
  sources: [
    { name: 'Editorial style guide' },
    { name: 'Product docs', url: 'https://docs.example' },
  ],
  details: [],
};

describe('computeResultLayout', () => {
  it('pairs panels side by side on wide terminals with content-sized budgets', () => {
    const layout = computeResultLayout(100, 34, 36, 11);
    expect(layout.sideBySide).toBe(true);
    expect(layout.inner).toBe(47); // (100 - 5) / 2
    expect(layout.headerRows).toBe(4);
    expect(layout.footerRows).toBe(2);
    expect(layout.middle).toBe(34 - 4 - 2);
    expect(layout.paneBudget).toBe(15); // (middle - knowledge share) - borders
    expect(layout.knowledgeRows).toBe(11); // cards get their full height
  });

  it('sizes BOTH panels to the contents (equal budget) and keeps cards visible', () => {
    const long = computeResultLayout(100, 34, 36, 11);
    const short = computeResultLayout(100, 34, 4, 11);
    expect(short.paneBudget).toBe(4); // content-fitted, not full height
    expect(long.paneBudget).toBe(15); // capped by the knowledge share on long texts
    // the cards always keep their content height
    expect(short.knowledgeRows).toBe(11);
    expect(long.knowledgeRows).toBe(11);
  });

  it('stacks panels on narrow terminals', () => {
    const layout = computeResultLayout(40, 24, 36, 11);
    expect(layout.sideBySide).toBe(false);
    expect(layout.inner).toBe(38);
    expect(layout.paneBudget).toBe(2);
    expect(layout.knowledgeRows).toBe(9);
  });

  it('shrinks the header/footer before the panel region on short terminals', () => {
    const layout = computeResultLayout(80, 8, 36, 11);
    expect(layout.middle).toBe(6); // header dropped (4 -> 2 -> 0), footer kept 2
    expect(layout.headerRows).toBe(0);
    expect(layout.paneBudget).toBe(1);
    expect(layout.knowledgeRows).toBe(3);
  });

  it('degrades to a minimal frame on tiny terminals without crashing', () => {
    const layout = computeResultLayout(80, 5, 36, 11);
    expect(layout.paneBudget).toBeGreaterThanOrEqual(1);
    expect(layout.knowledgeRows).toBeGreaterThanOrEqual(1);
    // painted rows never exceed the terminal height
    const painted =
      layout.headerRows +
      (layout.sideBySide ? layout.paneBudget + 2 : 2 * layout.paneBudget + 5) +
      layout.knowledgeRows +
      layout.footerRows;
    expect(painted).toBeLessThanOrEqual(layout.height);
  });

  it('every panel block and card fits the terminal width', () => {
    for (const width of [8, 20, 40, 53, 100, 200]) {
      for (const height of [5, 12, 24, 40]) {
        const layout = computeResultLayout(width, height, 36, 11);
        const blockWidth = layout.inner + 2;
        if (layout.sideBySide) {
          expect(2 * blockWidth + 1).toBeLessThanOrEqual(width);
        } else {
          expect(blockWidth).toBe(width);
        }
      }
    }
  });
});

describe('osc52Sequence', () => {
  it('wraps base64 payload in the OSC 52 clipboard sequence', () => {
    const seq = osc52Sequence('hi');
    expect(seq.startsWith('\u001b]52;c;')).toBe(true);
    expect(seq.endsWith('\u001b\\')).toBe(true);
    const payload = seq.slice('\u001b]52;c;'.length, -'\u001b\\'.length);
    expect(Buffer.from(payload, 'base64').toString('utf8')).toBe('hi');
  });
});

describe('renderPane', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  const pane = (overrides: Partial<Parameters<typeof renderPane>[0]> = {}) =>
    renderPane({
      title: 'ORIGINAL',
      lines,
      top: 0,
      budget: 26,
      inner: 47,
      focused: true,
      ...overrides,
    });

  it('renders a bordered block: title + budget rows + scroll footer', () => {
    const rows = pane();
    expect(rows).toHaveLength(26 + 2);
    for (const row of rows) {
      expect(stripAnsi(row).length).toBe(47 + 2);
    }
  });

  it('shows the scroll window clipped to the document length', () => {
    const rows = pane();
    expect(stripAnsi(rows[0] ?? '')).toContain('ORIGINAL');
    expect(stripAnsi(rows[rows.length - 1] ?? '')).toContain('1–26 of 30');
  });

  it('focus toggles the copy chip between [c] and [C]', () => {
    const focused = pane({ focused: true });
    const unfocused = pane({ focused: false });
    const all = (rows: string[]): string => rows.map((row) => stripAnsi(row)).join('|');
    expect(all(focused)).toContain('[c] copy');
    expect(all(focused)).not.toContain('[C] copy');
    expect(all(unfocused)).toContain('[C] copy');
    expect(all(unfocused)).not.toContain('[c] copy');
  });

  it('pages the content window from the requested top', () => {
    const rows = pane({ top: 4, budget: 2 });
    const content = rows.slice(1, 1 + 2).map((row) => stripAnsi(row));
    expect(content[0]).toContain('line 5');
    expect(content[1]).toContain('line 6');
  });

  it('clips the status when the document is short', () => {
    const rows = renderPane({
      title: 'X',
      lines: ['only'],
      top: 0,
      budget: 26,
      inner: 47,
      focused: true,
    });
    expect(stripAnsi(rows[rows.length - 1] ?? '')).toContain('1–1 of 1');
    // no negative "from" even though top exceeds nothing.
    expect(stripAnsi(rows[rows.length - 1] ?? '')).not.toMatch(/\b0–/);
  });
});

describe('buildKnowledgeCards', () => {
  it('renders KNOWLEDGE APPLIED and SOURCES cards with real provenance', () => {
    const rows = buildKnowledgeCards(sampleInput, 60);
    const text = rows.map((row) => stripAnsi(row)).join('\n');
    expect(text).toContain('KNOWLEDGE APPLIED');
    expect(text).toContain('2 rules · 1 pattern');
    expect(text).toContain('Transformation rules');
    expect(text).toContain('Write in active voice');
    expect(text).toContain('Editorial style guide');
    expect(text).toContain('2 preservation rule(s) enforced');
    expect(text).toContain('SOURCES');
    expect(text).toContain('Product docs');
  });

  it('every card row is exactly the requested width', () => {
    for (const width of [20, 60, 100]) {
      const rows = buildKnowledgeCards(sampleInput, width);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(stripAnsi(row).length).toBe(width);
      }
    }
  });

  it('stays honest when nothing was applied or sourced', () => {
    const rows = buildKnowledgeCards(
      { ...sampleInput, knowledge: { rules: [], patterns: [], preservationCount: 0 }, sources: [] },
      60,
    );
    const text = rows.map((row) => stripAnsi(row)).join('\n');
    expect(text).toContain('none retrieved — Sanity returned no applicable knowledge');
    expect(text).toContain('no source attached to the retrieved knowledge');
  });
});
