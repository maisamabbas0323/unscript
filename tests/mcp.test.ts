import { describe, expect, it } from 'vitest';
import {
  contentToText,
  createMcpClient,
  parseJsonRpcResponse,
  parseSse,
  type McpClient,
} from '../src/mcp/client.js';
import { McpAuthenticationError, McpProtocolError } from '../src/mcp/errors.js';

function sseEvent(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

describe('parseSse', () => {
  it('parses event frames with typed events', () => {
    const events = parseSse(`${sseEvent('message', { a: 1 })}${sseEvent('message', { b: 2 })}`);
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe('message');
    expect(events[1]?.data).toBe('{"b":2}');
  });

  it('ignores comment lines and empty frames', () => {
    expect(parseSse(': keep-alive\n\n')).toHaveLength(0);
  });
});

describe('parseJsonRpcResponse', () => {
  const requestId = 7;

  it('parses a plain JSON response with a matching id', () => {
    const message = parseJsonRpcResponse(
      JSON.stringify({ jsonrpc: '2.0', id: 7, result: { ok: true } }),
      'application/json',
      requestId,
    );
    expect(message.result).toEqual({ ok: true });
  });

  it('parses a JSON batch and finds the matching id', () => {
    const batch = JSON.stringify([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 7, result: { ok: true } },
    ]);
    expect(parseJsonRpcResponse(batch, 'application/json', requestId).result).toEqual({
      ok: true,
    });
  });

  it('parses SSE bodies for streamable HTTP', () => {
    const body = `${sseEvent('message', { jsonrpc: '2.0', id: 7, result: { ok: true } })}`;
    expect(parseJsonRpcResponse(body, 'text/event-stream', requestId).result).toEqual({ ok: true });
  });

  it('rejects non-JSON bodies', () => {
    expect(() => parseJsonRpcResponse('<html>oops</html>', 'text/html', requestId)).toThrow(
      McpProtocolError,
    );
  });

  it('rejects ids that do not match the request', () => {
    expect(() =>
      parseJsonRpcResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 99, result: {} }),
        'application/json',
        requestId,
      ),
    ).toThrow(/mismatched id/);
  });

  it('rejects a stream without a matching reply', () => {
    const body = sseEvent('message', { jsonrpc: '2.0', id: 99, result: {} });
    expect(() => parseJsonRpcResponse(body, 'text/event-stream', requestId)).toThrow(
      McpProtocolError,
    );
  });
});

describe('contentToText', () => {
  it('joins text blocks and ignores non-text content', () => {
    expect(
      contentToText([
        { type: 'text', text: 'one' },
        { type: 'image', data: '', mimeType: 'image/png' },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('one\ntwo');
  });

  it('returns empty string for undefined content', () => {
    expect(contentToText(undefined)).toBe('');
  });
});

interface RecordedRequest {
  url: string;
  body: { method?: string; id?: number };
  headers: Record<string, string>;
}

/** Serves scripted JSON-RPC responses and records requests for assertions. */
function serveClient(
  responses: Array<{ status: number; body: string; headers?: Record<string, string> }>,
): {
  client: McpClient;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const rawBody = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody) as { method?: string; id?: number };
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key.toLowerCase()] = value;
      }
    }
    requests.push({ url, body, headers });

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
      headers: { get: (name: string) => scripted.headers?.[name.toLowerCase()] ?? null },
      text: async () => scripted.body,
      json: async () => JSON.parse(scripted.body),
    };
  }) as unknown as typeof fetch;

  return {
    client: createMcpClient({
      endpoint: 'https://mcp.example.test',
      token: 'tok-secret',
      fetchImpl,
    }),
    requests,
  };
}

describe('createMcpClient', () => {
  it('initializes, stores the session id, lists tools, and calls tools', async () => {
    const { client, requests } = serveClient([
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            serverInfo: { name: 'sanity-context', version: '1' },
          },
        }),
        headers: { 'mcp-session-id': 'sess-123' },
      },
      // notifications/initialized uses the same script queue.
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }) },
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'groq_query' }] },
        }),
      },
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: {
            content: [{ type: 'text', text: '[{"_id":"a"}]' }],
          },
        }),
      },
    ]);

    const initialize = await client.initialize();
    expect(initialize.serverInfo.name).toBe('sanity-context');
    expect(client.sessionId).toBe('sess-123');

    const tools = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('groq_query');

    const result = await client.callTool('groq_query', { query: '*[_type == "source"]' });
    expect(result).toBe('[{"_id":"a"}]');

    // The token travels in the Authorization header, never in the URL or body.
    expect(requests[0]?.headers.authorization).toBe('Bearer tok-secret');
    expect(requests[0]?.body.method).toBe('initialize');
    // Session id is attached to every request after initialization.
    expect(requests[3]?.headers['mcp-session-id']).toBe('sess-123');
  });

  it('surfaces structuredContent directly', async () => {
    const { client } = serveClient([
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 'x',
            capabilities: {},
            serverInfo: { name: 's', version: '1' },
          },
        }),
      },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }) },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }) },
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: { structuredContent: { result: [{ _id: 'a' }] } },
        }),
      },
    ]);
    await client.initialize();
    await client.listTools();
    const result = await client.callTool('groq_query', { query: 'q' });
    expect(result).toEqual({ result: [{ _id: 'a' }] });
  });

  it('maps tool errors to McpToolError with the tool name', async () => {
    const { client } = serveClient([
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 'x',
            capabilities: {},
            serverInfo: { name: 's', version: '1' },
          },
        }),
      },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }) },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }) },
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: { isError: true, content: [{ type: 'text', text: 'query failed' }] },
        }),
      },
    ]);
    await client.initialize();
    await client.listTools();
    await expect(client.callTool('groq_query', { query: 'q' })).rejects.toMatchObject({
      name: 'McpToolError',
      tool: 'groq_query',
      message: expect.stringContaining('query failed'),
    });
  });

  it('maps 401 to McpAuthenticationError', async () => {
    const { client } = serveClient([{ status: 401, body: '{"error":"unauthorized"}' }]);
    await expect(client.initialize()).rejects.toBeInstanceOf(McpAuthenticationError);
  });

  it('maps 404 to McpConnectionError and 429 to a rate-limit message', async () => {
    const { client } = serveClient([{ status: 404, body: '{}' }]);
    await expect(client.initialize()).rejects.toMatchObject({
      name: 'McpConnectionError',
      message: expect.stringContaining('404'),
    });

    const { client: rate } = serveClient([{ status: 429, body: '{}' }]);
    await expect(rate.initialize()).rejects.toMatchObject({
      name: 'McpConnectionError',
      message: expect.stringContaining('rate-limited'),
    });
  });

  it('surfaces JSON-RPC error responses as McpProtocolError', async () => {
    const { client } = serveClient([
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32601, message: 'method not found' },
        }),
      },
    ]);
    await expect(client.initialize()).rejects.toMatchObject({
      name: 'McpProtocolError',
      message: expect.stringContaining('-32601'),
    });
  });
});
