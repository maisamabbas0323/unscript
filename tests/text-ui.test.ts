import { describe, expect, it } from 'vitest';
import { centerLine, visibleWidth, wrap } from '../src/utils/text.js';
import { wordmarkLines, pageHeader, tagline } from '../src/cli/ui/banner.js';

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

  it('tagline stays short and centered', () => {
    const t = tagline(80);
    expect(t.replace(/\u001b\[[0-9;]*m/g, '')).toContain('writing');
  });

  it('page header pairs a title with a rule', () => {
    const [head, rule] = pageHeader('Doctor', 80);
    expect(head!.replace(/\u001b\[[0-9;]*m/g, '')).toContain('DOCTOR');
    expect(rule).toContain('─');
  });
});
