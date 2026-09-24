import { describe, expect, it } from 'vitest';
import {
  extractJsonCandidate,
  validateTransformationOutput,
} from '../src/transformation/validation.js';

describe('validateTransformationOutput', () => {
  it('accepts a well-formed payload', () => {
    const result = validateTransformationOutput({
      transformedText: 'Rewritten',
      appliedRules: ['active-voice'],
      preservedElements: ['number'],
      notes: ['done'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.transformedText).toBe('Rewritten');
      expect(result.payload.appliedRules).toEqual(['active-voice']);
    }
  });

  it('rejects non-objects and missing/empty text', () => {
    expect(validateTransformationOutput('nope').ok).toBe(false);
    expect(validateTransformationOutput(null).ok).toBe(false);
    expect(validateTransformationOutput({}).ok).toBe(false);
    expect(validateTransformationOutput({ transformedText: '   ' }).ok).toBe(false);
  });

  it('rejects malformed optional fields', () => {
    expect(validateTransformationOutput({ transformedText: 'x', appliedRules: 'nope' }).ok).toBe(
      false,
    );
    expect(validateTransformationOutput({ transformedText: 'x', notes: [1] }).ok).toBe(false);
    expect(validateTransformationOutput({ transformedText: 'x', conflicts: 'nope' }).ok).toBe(
      false,
    );
  });

  it('drops model-reported conflicts but tolerates a conflicts array', () => {
    const result = validateTransformationOutput({
      transformedText: 'x',
      conflicts: [{ a: 1 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect('conflicts' in result.payload).toBe(false);
  });
});

describe('extractJsonCandidate', () => {
  it('parses direct JSON', () => {
    expect(extractJsonCandidate('{"transformedText":"a"}')).toEqual({ transformedText: 'a' });
  });

  it('parses fenced JSON', () => {
    expect(extractJsonCandidate('```json\n{"transformedText":"a"}\n```')).toEqual({
      transformedText: 'a',
    });
  });

  it('falls back to the first balanced object span', () => {
    expect(extractJsonCandidate('Here: {"transformedText":"a"} thanks')).toEqual({
      transformedText: 'a',
    });
  });

  it('returns null for non-JSON chatter', () => {
    expect(extractJsonCandidate('just some prose')).toBeNull();
  });
});
