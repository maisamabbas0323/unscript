import { describe, expect, it } from 'vitest';
import { assembleAgentContext, detectRuleConflicts } from '../src/agent/context.js';
import { runTransformation } from '../src/agent/agent.js';
import { TransformationError } from '../src/agent/errors.js';
import type { ContextMcp } from '../src/mcp/contextMcp.js';
import type { GeminiClient, GenerateOptions, GenerateResult } from '../src/gemini/client.js';
import type { RawDoc, TransformationRuleDoc } from '../src/knowledge/types.js';
import type { RetrievalRequest, RetrievalResult } from '../src/knowledge/retrieval.js';

function stubMcp(rows: { contentType: RawDoc[]; level: RawDoc[]; tone: RawDoc[] }): ContextMcp {
  return {
    client: {} as never,
    initialize: async () => {},
    listTools: async () => [],
    fetchInitialContext: async () => ({ text: '', json: null, tools: [] }),
    initialContext: async () => ({ text: '', json: null, tools: [] }),
    queryGroq: async (query: string) => {
      if (query.includes('_type == "writingPattern"')) return [];
      if (query.includes('_type == "transformationRule"')) return [];
      if (query.includes('_type == "preservationRule"')) return [];
      if (query.includes('_type == "userDecision"')) return [];
      if (query.includes('_type == "humanizationLevel"')) return rows.level;
      if (query.includes('_type == "toneRule"')) return rows.tone;
      if (query.includes('_type == "contentType"')) return rows.contentType;
      return [];
    },
    exploreSchema: async () => ({}),
    hasRequiredTools: () => true,
  };
}

function fakeGeminiWithText(text: string): GeminiClient {
  return {
    model: 'fake',
    generate: async (_options: GenerateOptions): Promise<GenerateResult> => ({
      text,
      finishReason: 'STOP',
      usage: {},
    }),
    ping: async () => {},
  };
}

const REQUEST: RetrievalRequest = {
  contentTypeSlug: 'technical',
  toneSlug: 'business',
  levelSlug: 'natural',
};

describe('detectRuleConflicts', () => {
  it('reports a priority-resolved conflict exactly once', () => {
    const rules: TransformationRuleDoc[] = [
      {
        _id: 'a',
        _type: 'transformationRule',
        title: 'Active voice',
        priority: 100,
        conflictsWith: [{ _id: 'b', title: 'Passive ok', priority: 40 }],
      },
      {
        _id: 'b',
        _type: 'transformationRule',
        title: 'Passive ok',
        priority: 40,
        conflictsWith: [{ _id: 'a', title: 'Active voice', priority: 100 }],
      },
    ];
    const conflicts = detectRuleConflicts(rules);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.resolution).toBe('priority');
    expect(conflicts[0]?.ruleId).toBe('a');
  });

  it('marks equal priorities as unresolved', () => {
    const rules: TransformationRuleDoc[] = [
      {
        _id: 'a',
        _type: 'transformationRule',
        title: 'A',
        priority: 50,
        conflictsWith: [{ _id: 'b', title: 'B', priority: 50 }],
      },
      {
        _id: 'b',
        _type: 'transformationRule',
        title: 'B',
        priority: 50,
        conflictsWith: [{ _id: 'a', title: 'A', priority: 50 }],
      },
    ];
    expect(detectRuleConflicts(rules)[0]?.resolution).toBe('unresolved');
  });

  it('ignores conflicts pointing outside the applied set', () => {
    const rules: TransformationRuleDoc[] = [
      {
        _id: 'a',
        _type: 'transformationRule',
        title: 'A',
        conflictsWith: [{ _id: 'not-applied', title: 'Ghost' }],
      },
    ];
    expect(detectRuleConflicts(rules)).toHaveLength(0);
  });
});

describe('assembleAgentContext', () => {
  it('keeps provenance and detected conflicts in the context', () => {
    const retrieval: RetrievalResult = {
      contentType: null,
      humanizationLevel: null,
      tone: null,
      patterns: [],
      transformationRules: [
        {
          _id: 'a',
          _type: 'transformationRule',
          title: 'A',
          conflictsWith: [{ _id: 'b', title: 'B' }],
        },
        { _id: 'b', _type: 'transformationRule', title: 'B' },
      ],
      preservationRules: [],
      sources: [],
      userDecisions: [],
    };
    const context = assembleAgentContext(REQUEST, retrieval);
    expect(context.conflicts).toHaveLength(1);
    expect(context.transformationRules.map((rule) => rule._id)).toEqual(['a', 'b']);
  });
});

describe('runTransformation', () => {
  it('orchestrates retrieval, context, generation, and validation honestly', async () => {
    const original =
      'Deploy to https://example.com/app with 5 workers on 2024-05-01. It must stay responsive.';
    const rewritten =
      'Roll out to https://example.com/app with 5 workers on 2024-05-01. It must stay responsive.';
    const gemini = fakeGeminiWithText(
      JSON.stringify({
        transformedText: rewritten,
        appliedRules: ['active-voice'],
        preservedElements: ['url', '5', '2024-05-01'],
        notes: [],
      }),
    );
    const mcp = stubMcp({
      contentType: [
        {
          _id: 'ct-1',
          _type: 'contentType',
          title: 'Technical documentation',
          slug: 'technical',
          source: { _id: 'src-1', _type: 'source', title: 'Style Guide' },
        },
      ],
      level: [{ _id: 'lvl-1', _type: 'humanizationLevel', title: 'Natural', slug: 'natural' }],
      tone: [
        {
          _id: 'tone-1',
          _type: 'toneRule',
          title: 'Business',
          slug: 'business',
          transformationRules: [
            {
              _id: 'rule-1',
              _type: 'transformationRule',
              title: 'Prefer active voice',
              slug: 'active-voice',
              priority: 100,
              instruction: 'Use active voice.',
              source: { _id: 'src-1', _type: 'source', title: 'Style Guide' },
            },
          ],
        },
      ],
    });

    const result = await runTransformation(
      { mcp, gemini },
      {
        text: original,
        contentTypeSlug: 'technical',
        toneSlug: 'business',
        levelSlug: 'natural',
      },
    );

    expect(result.requestText).toBe(original);
    expect(result.transformedText).toBe(rewritten);
    expect(result.applied.contentTypeTitle).toBe('Technical documentation');
    expect(result.applied.toneTitle).toBe('Business');
    expect(result.applied.ruleIds).toContain('rule-1');
    expect(result.applied.sourceCount).toBe(1);
    // Numbers, dates, urls, and requirements were kept → passed.
    expect(result.preservation.passed).toBe(true);
    expect(result.preservation.checked).toBeGreaterThan(0);
    // Provenance carries every applied knowledge item back to its source.
    expect(result.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'contentType', id: 'ct-1' }),
        expect.objectContaining({ kind: 'humanizationLevel', id: 'lvl-1' }),
        expect.objectContaining({ kind: 'toneRule', id: 'tone-1' }),
        expect.objectContaining({ kind: 'transformationRule', id: 'rule-1' }),
      ]),
    );
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('surfaces changed protected items in notes without fixing them', async () => {
    const original = '50 replicas are needed.';
    const gemini = fakeGeminiWithText(
      JSON.stringify({ transformedText: 'A lot of replicas are needed.' }),
    );
    const mcp = stubMcp({
      contentType: [{ _id: 'ct-1', _type: 'contentType', title: 'X', slug: 'x' }],
      level: [{ _id: 'lvl-1', _type: 'humanizationLevel', title: 'Y', slug: 'y' }],
      tone: [{ _id: 'tone-1', _type: 'toneRule', title: 'Z', slug: 'z' }],
    });

    const result = await runTransformation(
      { mcp, gemini },
      {
        text: original,
        contentTypeSlug: 'x',
        toneSlug: 'z',
        levelSlug: 'y',
      },
    );
    expect(result.preservation.passed).toBe(false);
    expect(result.preservation.changedProtectedItems.map((item) => item.value)).toContain('50');
    expect(result.notes.join(' ')).toContain('50');
    // The model's "fixed" text is untouched — changes are surfaced, not repaired.
    expect(result.transformedText).toBe('A lot of replicas are needed.');
  });

  it('throws TransformationError when knowledge is incomplete', async () => {
    const mcp = stubMcp({ contentType: [], level: [], tone: [] });
    const gemini = fakeGeminiWithText('{}');
    await expect(
      runTransformation(
        { mcp, gemini },
        { text: 'x', contentTypeSlug: 'none', toneSlug: 'none', levelSlug: 'none' },
      ),
    ).rejects.toBeInstanceOf(TransformationError);
  });
});
