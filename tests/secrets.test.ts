import { describe, expect, it } from 'vitest';
import { isConfigured, redactSecret, stripSecrets } from '../src/utils/secrets.js';

describe('isConfigured', () => {
  it('only accepts non-empty strings', () => {
    expect(isConfigured('abc')).toBe(true);
    expect(isConfigured('  abc  ')).toBe(true);
    expect(isConfigured('')).toBe(false);
    expect(isConfigured('   ')).toBe(false);
    expect(isConfigured(null)).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
  });
});

describe('redactSecret', () => {
  it('masks short values entirely', () => {
    expect(redactSecret('short')).toBe('••••••••');
  });

  it('keeps a short head and tail for longer values', () => {
    expect(redactSecret('abcdefghijklmnop')).toBe('abcd••••mnop');
  });

  it('never reveals the middle of the secret', () => {
    const redacted = redactSecret('sk-live-0123456789abcdef');
    expect(redacted).not.toContain('0123456789');
    expect(redacted).toContain('sk-l');
    expect(redacted).toContain('cdef');
  });
});

describe('stripSecrets', () => {
  it('replaces known secrets in a message', () => {
    const message = 'Rejected key sk-live-1234 at path /v1/key';
    expect(stripSecrets(message, ['sk-live-1234'])).toBe('Rejected key [redacted] at path /v1/key');
  });

  it('ignores null/empty secret entries', () => {
    expect(stripSecrets('plain', [null, undefined, ''])).toBe('plain');
  });
});
