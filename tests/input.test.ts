import { describe, expect, it } from 'vitest';
import {
  isTerminator,
  reducePrompt,
  type PromptEvent,
  type TextOutcome,
} from '../src/cli/ui/input.js';

/**
 * The input collector's finish/cancel contract, tested as pure decisions.
 * The readline wiring feeds these exact events; a pty harness verifies the
 * wiring end to end (lone `.`, Ctrl+D including a partial line, Esc).
 */

function outcome(events: PromptEvent[]): TextOutcome | null {
  return reducePrompt(events);
}

describe('reducePrompt — single line input', () => {
  it('submits the collected text without the lone dot terminator', () => {
    expect(
      outcome([
        { type: 'line', value: 'hello this is python programming language' },
        { type: 'terminator' },
      ]),
    ).toEqual({ kind: 'text', value: 'hello this is python programming language' });
  });

  it('submits an immediate lone dot as an empty string (validated upstream)', () => {
    expect(outcome([{ type: 'terminator' }])).toEqual({ kind: 'text', value: '' });
  });
});

describe('reducePrompt — multiline input', () => {
  it('preserves blank lines inside the content', () => {
    expect(
      outcome([
        { type: 'line', value: 'hello this is python' },
        { type: 'line', value: 'programming is useful' },
        { type: 'line', value: '' },
        { type: 'line', value: 'I am learning functions' },
        { type: 'terminator' },
      ]),
    ).toEqual({
      kind: 'text',
      value: 'hello this is python\nprogramming is useful\n\nI am learning functions',
    });
  });

  it('keeps trailing whitespace-only lines in the collected value', () => {
    expect(outcome([{ type: 'line', value: '   ' }, { type: 'close' }])).toEqual({
      kind: 'text',
      value: '   ',
    });
  });
});

describe('reducePrompt — lone dot vs periods inside text', () => {
  it('does not terminate when a period is inside a sentence', () => {
    expect(
      outcome([
        { type: 'line', value: 'I am learning Python. It is useful.' },
        { type: 'line', value: 'This keeps going' },
        { type: 'terminator' },
      ]),
    ).toEqual({ kind: 'text', value: 'I am learning Python. It is useful.\nThis keeps going' });
  });

  it('keeps "hello world ." as normal content', () => {
    expect(
      outcome([
        { type: 'line', value: 'hello world .' },
        { type: 'line', value: 'This is a normal sentence.' },
        { type: 'terminator' },
      ]),
    ).toEqual({ kind: 'text', value: 'hello world .\nThis is a normal sentence.' });
  });
});

describe('isTerminator', () => {
  it('recognises only a lone dot (with tolerated trailing space)', () => {
    expect(isTerminator('.')).toBe(true);
    expect(isTerminator('.   ')).toBe(true);
    expect(isTerminator('hello world .')).toBe(false);
    expect(isTerminator('..')).toBe(false);
    expect(isTerminator('')).toBe(false);
  });
});

describe('reducePrompt — Ctrl+D (close)', () => {
  it('submits collected content when close arrives after lines', () => {
    expect(
      outcome([
        { type: 'line', value: 'hello one' },
        { type: 'line', value: 'hello two' },
        { type: 'close' },
      ]),
    ).toEqual({ kind: 'text', value: 'hello one\nhello two' });
  });

  it('submits a partial line flushed before close (Ctrl+D mid-line)', () => {
    expect(outcome([{ type: 'line', value: 'hello partial' }, { type: 'close' }])).toEqual({
      kind: 'text',
      value: 'hello partial',
    });
  });

  it('exits cleanly (not interrupted) when close arrives with no content', () => {
    expect(outcome([{ type: 'close' }])).toEqual({ kind: 'exit', interrupted: false });
  });
});

describe('reducePrompt — cancel (Esc / Ctrl+C)', () => {
  it('cancels cleanly on Esc (interrupted=false)', () => {
    expect(
      outcome([
        { type: 'line', value: 'typed something' },
        { type: 'cancel', interrupted: false },
      ]),
    ).toEqual({ kind: 'exit', interrupted: false });
  });

  it('interrupts on Ctrl+C (interrupted=true), ignoring collected content', () => {
    expect(
      outcome([
        { type: 'line', value: 'typed something' },
        { type: 'cancel', interrupted: true },
      ]),
    ).toEqual({ kind: 'exit', interrupted: true });
  });
});

describe('reducePrompt — determinism', () => {
  it('returns null while more input is expected', () => {
    expect(
      outcome([
        { type: 'line', value: 'a' },
        { type: 'line', value: 'b' },
      ]),
    ).toBeNull();
  });

  it('stops at the first deciding event', () => {
    expect(
      outcome([{ type: 'line', value: 'a' }, { type: 'terminator' }, { type: 'line', value: 'c' }]),
    ).toEqual({ kind: 'text', value: 'a' });
  });
});
