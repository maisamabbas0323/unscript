import { describe, expect, it } from 'vitest';
import { loadConfig, parseBool } from '../src/config/index.js';

describe('parseBool', () => {
  it('accepts true-ish values', () => {
    for (const value of ['1', 'true', 'yes', 'on', ' TRUE ', 'On']) {
      expect(parseBool(value)).toBe(true);
    }
  });

  it('accepts false-ish values', () => {
    for (const value of ['0', 'false', 'no', 'off', ' FALSE ']) {
      expect(parseBool(value)).toBe(false);
    }
  });

  it('returns null for unrecognized values', () => {
    expect(parseBool('banana')).toBeNull();
    expect(parseBool('')).toBeNull();
  });
});

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    const { config, problems } = loadConfig({});
    expect(config).toEqual({ debug: false });
    expect(problems).toEqual([]);
  });

  it('reads UNSCRIPT_DEBUG=true', () => {
    const { config, problems } = loadConfig({ UNSCRIPT_DEBUG: 'true' });
    expect(config.debug).toBe(true);
    expect(problems).toEqual([]);
  });

  it('reports an invalid UNSCRIPT_DEBUG and falls back to the default', () => {
    const { config, problems } = loadConfig({ UNSCRIPT_DEBUG: 'banana' });
    expect(config.debug).toBe(false);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.key).toBe('UNSCRIPT_DEBUG');
    expect(problems[0]?.severity).toBe('warn');
  });
});
