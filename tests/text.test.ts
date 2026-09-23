import { describe, expect, it } from 'vitest';
import { satisfiesMinimum } from '../src/utils/package-info.js';
import { terminalWidth, wrap } from '../src/utils/text.js';

describe('satisfiesMinimum', () => {
  it('compares dotted versions numerically', () => {
    expect(satisfiesMinimum('22.14.0', '20.0.0')).toBe(true);
    expect(satisfiesMinimum('20.0.0', '20.0.0')).toBe(true);
    expect(satisfiesMinimum('19.9.9', '20.0.0')).toBe(false);
    expect(satisfiesMinimum('20.1.0', '20.0.9')).toBe(true);
  });

  it('ignores v prefixes and prerelease suffixes', () => {
    expect(satisfiesMinimum('v22.0.0', '20.0.0')).toBe(true);
    expect(satisfiesMinimum('22.0.0-beta.1', '20.0.0')).toBe(true);
  });
});

describe('terminalWidth', () => {
  it('returns a sane default for non-TTY output', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    expect(terminalWidth()).toBe(80);
    Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
  });

  it('clamps extreme widths', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: 200, configurable: true });
    expect(terminalWidth()).toBe(100);
    Object.defineProperty(process.stdout, 'columns', { value: 10, configurable: true });
    expect(terminalWidth()).toBe(40);
    Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
  });
});

describe('wrap', () => {
  it('leaves short text alone', () => {
    expect(wrap('short', 40)).toBe('short');
  });

  it('word-wraps long text to the given width', () => {
    const long = 'one two three four five six seven eight nine ten';
    const out = wrap(long, 20);
    expect(out.split('\n').every((line) => line.length <= 20)).toBe(true);
    expect(out.replace(/\n/g, ' ')).toBe(long);
  });

  it('preserves paragraphs', () => {
    const out = wrap('aaaa\n\nbbbb', 10);
    expect(out).toBe('aaaa\n\nbbbb');
  });
});
