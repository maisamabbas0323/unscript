import { describe, expect, it } from 'vitest';
import {
  isTerminator,
  reducePrompt,
  submitEvents,
  terminatorEvents,
  enterOutcome,
  finishOutcome,
  type PromptEvent,
  type TextOutcome,
} from '../src/cli/ui/input.js';
import { editingState, insertChars, newline, moveEnd, type EditState } from '../src/cli/ui/edit.js';

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

/** Build an EditState by typing and (optionally) inserting newlines. */
function typeBuffer(segments: Array<string | '\n'>): EditState {
  let state = editingState();
  for (const segment of segments) {
    if (segment === '\n') {
      const result = newline(state);
      if (result.kind === 'edited') state = result.state;
    } else {
      state = insertChars(state, segment);
    }
  }
  return state;
}

describe('submitEvents — whole-buffer submit projection', () => {
  it('projects the full document as line events plus close', () => {
    const state = typeBuffer(['Hello one', '\n', 'Hello two']);
    expect(submitEvents(state)).toEqual([
      { type: 'line', value: 'Hello one' },
      { type: 'line', value: 'Hello two' },
      { type: 'close' },
    ]);
  });

  it('drops one trailing empty line, like the original Ctrl+D contract', () => {
    const state = typeBuffer(['Hello', '\n']);
    expect(submitEvents(state).map((e) => (e.type === 'line' ? e.value : e.type))).toEqual([
      'Hello',
      'close',
    ]);
  });

  it('submitting the projection reproduces the collected value', () => {
    const state = typeBuffer(['a', '\n', 'b', '\n', '', '\n', 'c']);
    expect(reducePrompt(submitEvents(state))).toEqual({
      kind: 'text',
      value: 'a\nb\n\nc',
    });
  });
});

describe('terminatorEvents — lone-dot projection', () => {
  it('projects only the lines above the dot, then the terminator', () => {
    const state = typeBuffer(['alpha', '\n', 'beta', '\n', '.']);
    expect(terminatorEvents(state)).toEqual([
      { type: 'line', value: 'alpha' },
      { type: 'line', value: 'beta' },
      { type: 'terminator' },
    ]);
    expect(reducePrompt(terminatorEvents(state))).toEqual({
      kind: 'text',
      value: 'alpha\nbeta',
    });
  });
});

describe('enterOutcome — Enter = Continue (pure decision)', () => {
  it('submits the whole buffer with trailing empty lines dropped', () => {
    const state = typeBuffer(['Please rework this', '\n', 'and keep it short.']);
    expect(enterOutcome(state)).toEqual({
      kind: 'text',
      value: 'Please rework this\nand keep it short.',
    });
  });

  it('submits an empty value when nothing was entered (caller explains)', () => {
    expect(enterOutcome(editingState())).toEqual({ kind: 'text', value: '' });
    expect(enterOutcome(typeBuffer(['\n', '\n']))).toEqual({ kind: 'text', value: '' });
  });

  it('a lone `.` line at the end submits the lines above it', () => {
    const state = typeBuffer(['line one', '\n', 'line two', '\n', '.']);
    expect(enterOutcome(state)).toEqual({ kind: 'text', value: 'line one\nline two' });
  });

  it('a `.` inside the document is plain content, not a terminator', () => {
    // A mid-document lone dot exists once the cursor has moved above it;
    // Enter must then submit the whole document unchanged.
    const state: EditState = { lines: ['line one', '.', 'line three'], row: 0, col: 0 };
    expect(enterOutcome(state)).toEqual({
      kind: 'text',
      value: 'line one\n.\nline three',
    });
  });
});

describe('finishOutcome — Ctrl+D (pure decision, unchanged contract)', () => {
  it('submits the whole buffer, one trailing empty line dropped', () => {
    const state = typeBuffer(['hello', '\n', 'partial', '\n']);
    expect(finishOutcome(state)).toEqual({ kind: 'text', value: 'hello\npartial' });
  });

  it('exits cleanly when nothing was entered', () => {
    expect(finishOutcome(editingState())).toEqual({ kind: 'exit', interrupted: false });
  });

  it('is unaffected by the cursor position (submits the whole document)', () => {
    let state = typeBuffer(['first', '\n', 'second']);
    state = moveEnd(state);
    expect(finishOutcome(state)).toEqual({ kind: 'text', value: 'first\nsecond' });
  });
});
