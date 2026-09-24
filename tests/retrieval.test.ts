import { describe, expect, it } from 'vitest';
import { listTypeChoices, retrieveKnowledge } from '../src/knowledge/retrieval.js';
import type { ContextMcp } from '../src/mcp/contextMcp.js';
import type { McpClient } from '../src/mcp/client.js';
import type { RawDoc } from '../src/knowledge/types.js';

/**
 * Stub Context MCP that answers retrieval queries with canned rows keyed
 * by the `_type` filter in the generated GROQ query.
 */
interface StubRows {
  contentType: RawDoc[];
  level: RawDoc[];
  tone: RawDoc[];
  patterns: RawDoc[];
  decisions: RawDoc[];
  typePreservation: RawDoc[];
  patternRules: RawDoc[];
  typeRules: RawDoc[];
}

function stubMcp(rows: StubRows): ContextMcp {
  const emptyClient = {} as McpClient;
  return {
    client: emptyClient,
    initialize: async () => {},
    listTools: async () => [],
    fetchInitialContext: async () => ({ text: '', json: null, tools: [] }),
    initialContext: async () => ({ text: '', json: null, tools: [] }),
    queryGroq: async (query: string) => {
      if (query.includes('_type == "writingPattern"')) return rows.patterns;
      if (query.includes('_type == "humanizationLevel"')) return rows.level;
      if (query.includes('_type == "toneRule"')) return rows.tone;
      if (query.includes('_type == "transformationRule"')) {
        if (query.includes('_id in')) return rows.patternRules;
        return rows.typeRules;
      }
      if (query.includes('_type == "preservationRule"')) return rows.typePreservation;
      if (query.includes('_type == "userDecision"')) return rows.decisions;
      if (query.includes('_type == "contentType"')) return rows.contentType;
      return [];
    },
    exploreSchema: async () => ({}),
    hasRequiredTools: () => true,
  };
}

const contentTypeRow: RawDoc = {
  _id: 'ct-1',
  _type: 'contentType',
  title: 'Technical documentation',
  slug: 'technical',
  description: 'Docs for engineers',
  audience: 'Engineers',
  preservationConsiderations: 'Keep version numbers intact',
  source: { _id: 'src-1', _type: 'source', title: 'Style Guide', url: 'https://example.com/style' },
};

const levelRow: RawDoc = {
  _id: 'lvl-1',
  _type: 'humanizationLevel',
  title: 'Natural',
  slug: 'natural',
  description: 'Readable, confident rewriting',
  intensity: 6,
  sentenceChange: 'Restructure 1-2 sentences',
  vocabularyChange: 'Prefer common words',
};

const toneRow: RawDoc = {
  _id: 'tone-1',
  _type: 'toneRule',
  title: 'Business',
  slug: 'business',
  toneCharacteristics: 'Clear, confident, direct',
  contentTypes: ['technical'],
};

const patternRow: RawDoc = {
  _id: 'pat-1',
  _type: 'writingPattern',
  title: 'Passive voice',
  slug: 'passive-voice',
  pattern: 'is being done',
  whenToChange: 'When the actor is known',
  severity: 'high',
  contentTypes: ['technical'],
  source: { _id: 'src-1', _type: 'source', title: 'Style Guide' },
};

const ruleLow: RawDoc = {
  _id: 'rule-100',
  _type: 'transformationRule',
  title: 'Prefer active voice',
  slug: 'active-voice',
  instruction: 'Rewrite passive constructions',
  priority: 100,
  source: { _id: 'src-1', _type: 'source', title: 'Style Guide' },
};

const ruleHigh: RawDoc = {
  _id: 'rule-90',
  _type: 'transformationRule',
  title: 'Keep button labels',
  slug: 'keep-labels',
  instruction: 'Never reword UI labels',
  priority: 90,
};

const preservationRow: RawDoc = {
  _id: 'pres-1',
  _type: 'preservationRule',
  title: 'Preserve numbers',
  slug: 'preserve-numbers',
  whatToPreserve: 'All figures',
  whatMustNotChange: 'Amounts and percentages',
  priority: 80,
};

describe('retrieveKnowledge', () => {
  it('normalizes content type, level, tone, patterns, rules and provenance', async () => {
    const mcp = stubMcp({
      contentType: [contentTypeRow],
      level: [levelRow],
      tone: [toneRow],
      patterns: [patternRow],
      decisions: [],
      typePreservation: [preservationRow],
      patternRules: [],
      typeRules: [ruleLow],
    });

    const result = await retrieveKnowledge(mcp, {
      contentTypeSlug: 'technical',
      toneSlug: 'business',
      levelSlug: 'natural',
    });

    expect(result.contentType?.title).toBe('Technical documentation');
    expect(result.contentType?.source?.url).toBe('https://example.com/style');
    expect(result.humanizationLevel?.intensity).toBe(6);
    expect(result.tone?.contentTypes).toEqual(['technical']);
    expect(result.patterns.map((pattern) => pattern.slug)).toEqual(['passive-voice']);
    expect(result.transformationRules.map((rule) => rule.slug)).toEqual(['active-voice']);
    expect(result.preservationRules.map((rule) => rule.slug)).toEqual(['preserve-numbers']);
    // Provenance: each source is recorded once.
    expect(result.sources.map((source) => source._id)).toEqual(['src-1']);
    expect(result.sources[0]?.url).toBe('https://example.com/style');
  });

  it('sorts transformation rules by priority descending and dedupes by id', async () => {
    const mcp = stubMcp({
      contentType: [contentTypeRow],
      level: [{ ...levelRow, transformationRules: [ruleHigh] }],
      tone: [{ ...toneRow, transformationRules: [ruleLow] }],
      patterns: [],
      decisions: [],
      typePreservation: [],
      patternRules: [],
      typeRules: [ruleLow],
    });

    const result = await retrieveKnowledge(mcp, {
      contentTypeSlug: 'technical',
      toneSlug: 'business',
      levelSlug: 'natural',
    });

    // rule-100 appears via tone AND via type rules — it must be deduped.
    expect(result.transformationRules).toHaveLength(2);
    expect(result.transformationRules[0]?.slug).toBe('active-voice');
    expect(result.transformationRules[1]?.slug).toBe('keep-labels');
  });

  it('normalizes nested preservation rules attached to transformation rules', async () => {
    const mcp = stubMcp({
      contentType: [contentTypeRow],
      level: [],
      tone: [toneRow],
      patterns: [],
      decisions: [],
      typePreservation: [],
      patternRules: [],
      typeRules: [{ ...ruleLow, preservationRules: [preservationRow] }],
    });

    const result = await retrieveKnowledge(mcp, {
      contentTypeSlug: 'technical',
      toneSlug: 'business',
      levelSlug: 'natural',
    });

    expect(result.preservationRules.map((rule) => rule.slug)).toEqual(['preserve-numbers']);
  });

  it('runs pattern-derived rule queries only when patterns exist', async () => {
    const mcp = stubMcp({
      contentType: [contentTypeRow],
      level: [],
      tone: [],
      patterns: [patternRow],
      decisions: [],
      typePreservation: [],
      patternRules: [ruleLow],
      typeRules: [],
    });

    const result = await retrieveKnowledge(mcp, {
      contentTypeSlug: 'technical',
      toneSlug: 'business',
      levelSlug: 'natural',
    });

    expect(result.transformationRules.map((rule) => rule.slug)).toEqual(['active-voice']);
  });

  it('surfaces a retrieval failure as KnowledgeRetrievalError', async () => {
    const mcp = stubMcp({
      contentType: [],
      level: [],
      tone: [],
      patterns: [],
      decisions: [],
      typePreservation: [],
      patternRules: [],
      typeRules: [],
    });
    mcp.queryGroq = async () => {
      throw new Error('boom');
    };
    await expect(
      retrieveKnowledge(mcp, { contentTypeSlug: 'x', toneSlug: 'y', levelSlug: 'z' }),
    ).rejects.toMatchObject({
      name: 'KnowledgeRetrievalError',
    });
  });
});

describe('listTypeChoices', () => {
  it('returns sorted choices and skips rows without a slug', async () => {
    const mcp = stubMcp({
      contentType: [],
      level: [],
      tone: [],
      patterns: [],
      decisions: [],
      typePreservation: [],
      patternRules: [],
      typeRules: [],
    });
    mcp.queryGroq = async () => [
      { _id: 'b', title: 'Beta', slug: 'beta' },
      { _id: 'a', title: 'Alpha', slug: 'alpha', description: 'First' },
      { _id: 'c', title: 'No slug' },
    ];

    const choices = await listTypeChoices(mcp, 'toneRule');
    expect(choices.map((choice) => choice.slug)).toEqual(['alpha', 'beta']);
    expect(choices[0]).toMatchObject({ _id: 'a', title: 'Alpha', description: 'First' });
  });
});
