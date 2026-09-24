import { describe, expect, it } from 'vitest';
import { preflightContextMcp } from '../src/cli/runtime.js';
import { createContextMcp } from '../src/mcp/contextMcp.js';
import { McpToolError } from '../src/mcp/errors.js';
import { CONTEXT_TOOLS } from '../src/mcp/types.js';

interface RecordedRequest {
  body: { method?: string; id?: number; params?: { name?: string } };
}

/**
 * Servers scripted JSON-RPC responses and records the request stream so the
 * session protocol (initialize → initial_context → tools/list → groq_query)
 * can be asserted directly.
 */
function serve(responses: Array<{ status: number; body: string }>): {
  requests: RecordedRequest[];
  mcp: ReturnType<typeof createContextMcp>;
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const rawBody = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody) as {
      method?: string;
      id?: number;
      params?: { name?: string };
    };
    requests.push({ body });
    const scripted = responses[requests.length - 1];
    if (scripted === undefined) {
      return {
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: async () => 'unexpected request',
        json: async () => ({}),
      };
    }
    return {
      ok: scripted.status >= 200 && scripted.status < 300,
      status: scripted.status,
      headers: { get: () => null },
      text: async () => scripted.body,
      json: async () => JSON.parse(scripted.body),
    };
  }) as unknown as typeof fetch;

  return {
    requests,
    mcp: createContextMcp({ endpoint: 'https://mcp.example.test', token: 'tok', fetchImpl }),
  };
}

const INIT_RESULT = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  result: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    serverInfo: { name: 's', version: '1' },
  },
});

function callResult(id: number, text: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }] },
  });
}

function listResult(id: number, tools: string[]): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { tools: tools.map((name) => ({ name })) },
  });
}

const GROQ_TOOLS = [
  CONTEXT_TOOLS.initialContext,
  CONTEXT_TOOLS.schemaExplorer,
  CONTEXT_TOOLS.groqQuery,
];

describe('preflightContextMcp — GROQ-mode session protocol', () => {
  it('calls initial_context before tools/list and before any groq_query', async () => {
    const { requests, mcp } = serve([
      { status: 200, body: INIT_RESULT }, // initialize (id 1)
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0' }) }, // notifications/initialized
      { status: 200, body: callResult(2, '# Unscript Knowledge\nSchema overview...') }, // initial_context
      { status: 200, body: listResult(3, GROQ_TOOLS) }, // tools/list
      { status: 200, body: callResult(4, '[]') }, // groq_query (after preflight)
    ]);

    await preflightContextMcp(mcp);
    await mcp.queryGroq('*[_type == "source"]');

    const methods = requests.map((request) => request.body.method);
    expect(methods).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/call',
      'tools/list',
      'tools/call',
    ]);

    // initial_context is the first tool call and precedes the groq query.
    const toolCallNames = requests
      .filter((request) => request.body.method === 'tools/call')
      .map((request) => request.body.params?.name);
    expect(toolCallNames).toEqual([CONTEXT_TOOLS.initialContext, CONTEXT_TOOLS.groqQuery]);
  });

  it('rethrows the initial_context failure when the tool list is otherwise complete', async () => {
    const { mcp } = serve([
      { status: 200, body: INIT_RESULT },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0' }) },
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { isError: true, content: [{ type: 'text', text: 'session not initialized' }] },
        }),
      },
      { status: 200, body: listResult(3, GROQ_TOOLS) },
    ]);

    await expect(preflightContextMcp(mcp)).rejects.toMatchObject({
      name: 'McpToolError',
      tool: CONTEXT_TOOLS.initialContext,
      message: expect.stringContaining('session not initialized'),
    });
  });

  it('reports a Knowledge Base-mode endpoint as a configuration error', async () => {
    const { mcp } = serve([
      { status: 200, body: INIT_RESULT },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0' }) },
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { isError: true, content: [{ type: 'text', text: 'tool not found' }] },
        }),
      },
      { status: 200, body: listResult(3, [CONTEXT_TOOLS.knowledgeBaseRead]) },
    ]);

    await expect(preflightContextMcp(mcp)).rejects.toMatchObject({
      name: 'McpToolError',
      hint: expect.stringContaining('Knowledge Base'),
    });
  });

  it('fails honestly when a required GROQ-mode tool is missing entirely', async () => {
    const { mcp } = serve([
      { status: 200, body: INIT_RESULT },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0' }) },
      { status: 200, body: callResult(2, 'context text') },
      { status: 200, body: listResult(3, [CONTEXT_TOOLS.groqQuery]) },
    ]);

    await expect(preflightContextMcp(mcp)).rejects.toBeInstanceOf(McpToolError);
  });
});
