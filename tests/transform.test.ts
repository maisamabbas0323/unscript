import { describe, expect, it } from 'vitest';
import {
  buildSystemInstruction,
  buildUserPrompt,
  callTransformation,
} from '../src/transformation/transform.js';
import type { AgentContext } from '../src/agent/context.js';
import type { GeminiClient, GenerateOptions, GenerateResult } from '../src/gemini/client.js';
import { TransformationError } from '../src/agent/errors.js';

function fakeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    request: { contentTypeSlug: 'technical', toneSlug: 'business', levelSlug: 'natural' },
    contentType: {
      _id: 'ct-1',
      _type: 'contentType',
      title: 'Technical documentation',
      slug: 'technical',
    },
    humanizationLevel: {
      _id: 'lvl-1',
      _type: 'humanizationLevel',
      title: 'Natural',
      slug: 'natural',
      intensity: 6,
    },
    tone: { _id: 'tone-1', _type: 'toneRule', title: 'Business', slug: 'business' },
    patterns: [],
    transformationRules: [
      {
        _id: 'rule-1',
        _type: 'transformationRule',
        title: 'Prefer active voice',
        slug: 'active-voice',
        priority: 100,
        instruction: 'Rewrite passive constructions to active voice.',
      },
    ],
    preservationRules: [
      {
        _id: 'pres-1',
        _type: 'preservationRule',
        title: 'Preserve figures',
        slug: 'preserve-figures',
        priority: 90,
      },
    ],
    sources: [],
    userDecisions: [],
    conflicts: [],
    ...overrides,
  };
}

function modelScript(script: Array<{ text: string }>): GeminiClient & { prompts: string[] } {
  const prompts: string[] = [];
  let call = 0;
  return {
    model: 'fake',
    prompts,
    generate: async (options: GenerateOptions): Promise<GenerateResult> => {
      call += 1;
      prompts.push(options.prompt);
      const step = script[call - 1];
      return { text: step?.text ?? '', finishReason: 'STOP', usage: {} };
    },
    ping: async () => {},
  };
}

describe('buildSystemInstruction', () => {
  it('compiles retrieved knowledge with provenance and priorities', () => {
    const instruction = buildSystemInstruction(fakeContext());
    expect(instruction).toContain('CONTENT TYPE');
    expect(instruction).toContain('Technical documentation');
    expect(instruction).toContain('HUMANIZATION LEVEL');
    expect(instruction).toContain('HARD CONSTRAINTS');
    expect(instruction).toContain('Prefer active voice (priority 100) [sanity:rule-1]');
    expect(instruction).toContain('PRESERVATION RULES');
    expect(instruction).toContain('[sanity:pres-1]');
  });

  it('flags unresolved conflicts without inventing resolutions', () => {
    const context = fakeContext({
      conflicts: [
        {
          ruleId: 'rule-1',
          ruleTitle: 'Prefer active voice',
          rulePriority: 100,
          conflictsWithId: 'rule-2',
          conflictsWithTitle: 'Ignore voice',
          conflictsWithPriority: 100,
          resolution: 'unresolved',
          detail: 'unresolved',
        },
      ],
    });
    expect(buildSystemInstruction(context)).toContain('DOCUMENTED RULE CONFLICTS');
    expect(buildSystemInstruction(context)).not.toContain('invented');
  });
});

describe('buildUserPrompt', () => {
  it('wraps the original text between markers and states the output contract', () => {
    const prompt = buildUserPrompt('Original sentence.');
    expect(prompt).toContain('<begin original>');
    expect(prompt).toContain('Original sentence.');
    expect(prompt).toContain('<end original>');
    expect(prompt).toContain('transformedText');
    expect(prompt).not.toContain('Previous response');
  });

  it('appends a correction note on retry', () => {
    const prompt = buildUserPrompt('Original sentence.', {
      correction: 'transformedText was not a valid JSON string',
    });
    expect(prompt).toContain('previous response was rejected');
    expect(prompt).toContain('transformedText was not a valid JSON string');
  });
});

describe('callTransformation', () => {
  it('returns a validated JSON payload from the model', async () => {
    const gemini = modelScript([
      {
        text: JSON.stringify({
          transformedText: 'Rewritten correctly.',
          appliedRules: ['active-voice'],
          preservedElements: ['figures'],
          notes: [],
        }),
      },
    ]);
    const payload = await callTransformation(gemini, 'sys', 'Original.');
    expect(payload.transformedText).toBe('Rewritten correctly.');
    expect(payload.appliedRules).toEqual(['active-voice']);
  });

  it('accepts plain-text output with an honest note', async () => {
    const gemini = modelScript([{ text: 'Just a plain rewrite.' }]);
    const payload = await callTransformation(gemini, 'sys', 'Original.');
    expect(payload.transformedText).toBe('Just a plain rewrite.');
    expect(payload.notes).toHaveLength(1);
  });

  it('retries malformed JSON once with a correction note', async () => {
    const gemini = modelScript([
      { text: '{"somethingElse": 1}' },
      {
        text: JSON.stringify({
          transformedText: 'Fixed after retry.',
        }),
      },
    ]);
    const payload = await callTransformation(gemini, 'sys', 'Original.');
    expect(payload.transformedText).toBe('Fixed after retry.');
    expect(gemini.prompts[1]).toContain('previous response was rejected');
    expect(gemini.prompts[1]).toContain('transformedText was not a valid JSON string');
  });

  it('throws TransformationError when both attempts are invalid', async () => {
    const gemini = modelScript([{ text: '{"nope": true}' }, { text: '{"transformedText": 42}' }]);
    await expect(callTransformation(gemini, 'sys', 'Original.')).rejects.toBeInstanceOf(
      TransformationError,
    );
  });
});
