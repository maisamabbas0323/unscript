import { describe, expect, it } from 'vitest';
import { computeResultLayout, osc52Sequence, renderPane } from '../src/cli/ui/resultPage.js';

const stripAnsi = (line: string): string => line.replace(/\u001b\[[0-9;]*m/g, '');

describe('computeResultLayout', () => {
  it('pairs panels side by side on wide terminals', () => {
    const layout = computeResultLayout(100, 34);
    expect(layout.sideBySide).toBe(true);
    expect(layout.inner).toBe(47); // (100 - 5) / 2
    expect(layout.regionRows).toBe(34 - 2 - 4); // header + footer
    expect(layout.budget).toBe(layout.regionRows - 2);
    expect(layout.regionTop).toBe(5);
    expect(layout.footerTop).toBe(33);
  });

  it('stacks panels on narrow terminals', () => {
    const layout = computeResultLayout(40, 24);
    expect(layout.sideBySide).toBe(false);
    expect(layout.inner).toBe(38);
    // two blocks (budget + 2 each) plus a 1-row gap fit the 18-row region.
    expect(layout.budget).toBe(6);
    expect(layout.regionRows).toBe(18);
  });

  it('shrinks the header before the panel region on short terminals', () => {
    const layout = computeResultLayout(80, 8);
    // full header (4) + footer (2) leaves 2 rows < 3 -> header drops to 2.
    expect(layout.headerRows).toBe(2);
    expect(layout.regionRows).toBe(4);
    expect(layout.budget).toBe(2);
  });

  it('degrades to a minimal frame on tiny terminals without crashing', () => {
    const layout = computeResultLayout(80, 5);
    expect(layout.regionRows).toBeGreaterThanOrEqual(3);
    expect(layout.headerRows).toBe(0);
    expect(layout.budget).toBeGreaterThanOrEqual(1);
  });

  it('every pane block fits the terminal width', () => {
    for (const width of [8, 20, 40, 53, 100, 200]) {
      for (const height of [5, 12, 24, 40]) {
        const layout = computeResultLayout(width, height);
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
