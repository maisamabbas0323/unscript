import { describe, expect, it } from 'vitest';
import { centerLine, visibleWidth, wrap } from '../src/utils/text.js';
import { wordmarkLines, logoLines, pageHeader, tagline } from '../src/cli/ui/banner.js';

describe('text utilities (UI)', () => {
  it('visibleWidth ignores ANSI codes', () => {
    expect(visibleWidth('\u001b[36mUNSCRIPT\u001b[39m')).toBe(8);
    expect(visibleWidth('plain')).toBe(5);
  });

  it('centerLine pads to the middle', () => {
    expect(centerLine('abcd', 10)).toBe('   abcd');
    expect(centerLine('plain', 4)).toBe('plain');
  });

  it('centerLine ignores ANSI when measuring', () => {
    const colored = '\u001b[1mhi\u001b[22m';
    expect(centerLine(colored, 10)).toBe(`    ${colored}`);
  });

  it('wrap still works', () => {
    expect(wrap('short', 40)).toBe('short');
  });
});

describe('banner', () => {
  it('renders a compact wordmark on narrow terminals', () => {
    const lines = wordmarkLines(30);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.replace(/\u001b\[[0-9;]*m/g, '')).toBe('UNSCRIPT');
  });

  it('renders the full block wordmark on wide terminals', () => {
    const lines = wordmarkLines(100);
    expect(lines).toHaveLength(6);
    const first = lines[0]!.replace(/\u001b\[[0-9;]*m/g, '');
    // Width: 8 letters of 6 columns + 7 single-space gaps.
    expect(first.length).toBe(55);
  });

  it('wordmark lines are width-consistent across rows', () => {
    const lines = wordmarkLines(100).map((l) => l.replace(/\u001b\[[0-9;]*m/g, ''));
    const widths = new Set(lines.map((l) => l.length));
    expect(widths.size).toBe(1);
  });

  it('renders the 10-row logo on wide terminals, bounded to its width', () => {
    const lines = logoLines(100).map((l) => l.replace(/\u001b\[[0-9;]*m/g, ''));
    expect(lines).toHaveLength(10);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(76);
  });

  it('logo falls back to the block wordmark when too narrow for the logo', () => {
    expect(logoLines(60)).toHaveLength(6); // 6-row block wordmark
    expect(logoLines(30)).toHaveLength(1); // compact brand line
  });

  it('tagline is one left-anchored row with both words', () => {
    const t = tagline();
    const plain = t.replace(/\u001b\[[0-9;]*m/g, '');
    expect(plain).toBe('writing, reworked.');
    expect(t.startsWith(' ')).toBe(false); // pinned left, never centered
  });

  it('page header pairs a title with a rule', () => {
    const [head, rule] = pageHeader('Doctor', 80);
    expect(head!.replace(/\u001b\[[0-9;]*m/g, '')).toContain('DOCTOR');
    expect(rule).toContain('─');
  });
});
