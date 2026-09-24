import { describe, expect, it } from 'vitest';
import {
  createContextMcp,
  parseGroqPayload,
  parseSchemaPayload,
  REQUIRED_TOOLS,
} from '../src/mcp/contextMcp.js';
import { McpProtocolError, McpToolError } from '../src/mcp/errors.js';
import { CONTEXT_TOOLS } from '../src/mcp/types.js';

describe('parseGroqPayload', () => {
  it('parses the envelope result array', () => {
    expect(parseGroqPayload({ result: [{ _id: 'a' }], meta: {} })).toEqual([{ _id: 'a' }]);
  });

  it('parses a bare array', () => {
    expect(parseGroqPayload([{ _id: 'b' }])).toEqual([{ _id: 'b' }]);
  });

  it('normalizes a single-document object (GROQ [0] projections)', () => {
    expect(parseGroqPayload({ _id: 'c', _type: 'source', title: 'C' })).toEqual([
      { _id: 'c', _type: 'source', title: 'C' },
    ]);
  });

  it('returns [] for "No results" text and empty strings', () => {
    expect(parseGroqPayload('No results')).toEqual([]);
    expect(parseGroqPayload('no results found')).toEqual([]);
    expect(parseGroqPayload('')).toEqual([]);
  });

  it('rejects non-JSON data with a protocol error', () => {
    expect(() => parseGroqPayload('definitely not json')).toThrow(McpProtocolError);
  });

  it('rejects unexpected shapes with a tool error', () => {
    expect(() => parseGroqPayload({ hello: 'world' })).toThrow(McpToolError);
  });
});

describe('parseSchemaPayload', () => {
  it('accepts objects and JSON strings', () => {
    expect(parseSchemaPayload({ name: 'x' })).toEqual({ name: 'x' });
    expect(parseSchemaPayload('{"name":"y"}')).toEqual({ name: 'y' });
  });

  it('rejects garbage as a tool error', () => {
    expect(() => parseSchemaPayload('not json')).toThrow(McpToolError);
  });
});

describe('createContextMcp', () => {
  it('runs a groq_query round trip against the real client path', async () => {
    const steps: Array<{ method: string | undefined; id: number | undefined }> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        method?: string;
        id?: number;
      };
      steps.push({ method: body.method, id: body.id });
      const index = steps.length;
      if (index === 1) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'mcp-session-id' ? 'sess-9' : null),
          },
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                serverInfo: { name: 's', version: '1' },
              },
            }),
          json: async () => ({}),
        };
      }
      if (index === 3) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: { tools: [{ name: CONTEXT_TOOLS.groqQuery }] },
            }),
          json: async () => ({}),
        };
      }
      if (index === 4) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: { content: [{ type: 'text', text: '[]' }] },
            }),
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }),
        json: async () => ({}),
      };
    }) as unknown as typeof fetch;

    const mcp = createContextMcp({
      endpoint: 'https://mcp.example.test',
      token: 'tok',
      fetchImpl,
    });
    await mcp.initialize();
    const tools = await mcp.listTools();
    expect(tools.map((tool) => tool.name)).toContain(CONTEXT_TOOLS.groqQuery);
    const rows = await mcp.queryGroq('*[_type == "source"]');
    expect(rows).toEqual([]);
    expect(steps.map((step) => step.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
    ]);
  });

  it('reports required tools as satisfied only in GROQ mode', () => {
    const { hasRequiredTools } = createContextMcp({ endpoint: 'u', token: 't' });
    expect(
      hasRequiredTools([
        { name: 'groq_query' },
        { name: 'initial_context' },
        { name: 'schema_explorer' },
      ]),
    ).toBe(true);
    expect(hasRequiredTools([{ name: 'knowledge_base_read' }])).toBe(false);
    expect(hasRequiredTools([{ name: 'groq_query' }])).toBe(false);
  });
});

describe('createContextMcp — initial_context tool', () => {
  it('parses the welcome text returned by the real tool', async () => {
    const steps: Array<{ method: string | undefined; params?: { name?: string } }> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        method?: string;
        params?: { name?: string };
      };
      steps.push({ method: body.method, params: body.params });
      if (steps.length === 1) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                serverInfo: { name: 's', version: '1' },
              },
            }),
          json: async () => ({}),
        };
      }
      if (steps.length === 3) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: {
                content: [{ type: 'text', text: '# Unscript Knowledge\nSchema overview' }],
              },
            }),
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 2, result: {} }),
        json: async () => ({}),
      };
    }) as unknown as typeof fetch;

    const mcp = createContextMcp({
      endpoint: 'https://mcp.example.test',
      token: 'tok',
      fetchImpl,
    });
    await mcp.initialize();
    const payload = await mcp.initialContext();
    expect(payload.text).toContain('Unscript Knowledge');
    expect(steps[2]?.method).toBe('tools/call');
    expect(steps[2]?.params?.name).toBe(CONTEXT_TOOLS.initialContext);
  });

  it('rejects unexpected payloads with a tool error', async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { id?: number };
      const id = body.id ?? 1;
      const isInit = String(init?.body ?? '').includes('"initialize"');
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          isInit
            ? JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  protocolVersion: 'x',
                  capabilities: {},
                  serverInfo: { name: 's', version: '1' },
                },
              })
            : JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                result: { content: [{ type: 'refusal', text: 'nope' }] },
              }),
        json: async () => ({}),
      };
    }) as unknown as typeof fetch;

    const mcp = createContextMcp({ endpoint: 'https://mcp.example.test', token: 't', fetchImpl });
    await mcp.initialize();
    await expect(mcp.initialContext()).rejects.toMatchObject({
      name: 'McpToolError',
      tool: CONTEXT_TOOLS.initialContext,
    });
  });
});

describe('REQUIRED_TOOLS', () => {
  it('expects exactly the GROQ-mode tool set', () => {
    expect(REQUIRED_TOOLS).toEqual(['initial_context', 'schema_explorer', 'groq_query']);
  });
});
