import {
  McpAuthenticationError,
  McpConnectionError,
  McpProtocolError,
  McpToolError,
} from './errors.js';
import {
  MCP_PROTOCOL_VERSION,
  type JsonRpcMessage,
  type McpCallToolResult,
  type McpClientInfo,
  type McpContent,
  type McpInitializeResult,
  type McpListToolsResult,
  type McpTextContent,
  type McpTool,
} from './types.js';

/**
 * Low-level MCP streamable-HTTP client (JSON-RPC 2.0 over POST).
 *
 * The Sanity Context MCP endpoint accepts JSON-RPC messages on its URL
 * with `Accept: application/json, text/event-stream`. This client:
 *
 *  1. sends `initialize`, keeps the returned protocol version and session id
 *  2. fires the `notifications/initialized` notification
 *  3. discovers tools with `tools/list`
 *  4. calls tools with `tools/call`
 *
 * Responses may arrive as plain JSON, a JSON batch, or Server-Sent Events;
 * all three are parsed. Auth failures, timeouts, connectivity problems,
 * protocol errors, and tool errors map to distinct error classes.
 */

export interface McpClientOptions {
  endpoint: string;
  token: string;
  /** Per-request timeout in milliseconds (default 20s). */
  timeoutMs?: number;
  /** Injectable fetch for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface McpClient {
  initialize(): Promise<McpInitializeResult>;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Server-negotiated session id, or null before initialization. */
  sessionId: string | null;
}

export interface SseEvent {
  event: string | undefined;
  data: string;
}

/** Parse a Server-Sent Events body into event frames. */
export function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = text.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
      // `:` lines are SSE comments; ignored.
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('') });
  }
  return events;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function hasMatchingId(message: unknown, requestId: number): message is JsonRpcMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { id?: unknown };
  return candidate.id === requestId;
}

/**
 * Parse a JSON-RPC response body that may be JSON, a JSON batch, or SSE.
 * Throws McpProtocolError when no message with the request id is found.
 */
export function parseJsonRpcResponse(
  text: string,
  responseContentType: string,
  requestId: number,
): JsonRpcMessage {
  if (responseContentType.includes('text/event-stream')) {
    for (const event of parseSse(text)) {
      const parsed = tryParseJson(event.data);
      if (parsed !== null && hasMatchingId(parsed, requestId)) return parsed;
    }
    throw new McpProtocolError(
      'MCP server returned a streamed response that did not contain a reply.',
    );
  }

  const parsed = tryParseJson(text);
  if (parsed === null) {
    throw new McpProtocolError('MCP server returned a non-JSON response.');
  }
  if (Array.isArray(parsed)) {
    const message = parsed.find((item) => hasMatchingId(item, requestId));
    if (message !== undefined) return message;
    throw new McpProtocolError('MCP server returned a JSON batch without a reply.');
  }
  if (!hasMatchingId(parsed, requestId)) {
    throw new McpProtocolError('MCP server returned a response with a mismatched id.');
  }
  return parsed;
}

/** Join the text portions of an MCP tool result's content blocks. */
export function contentToText(content: McpContent[] | undefined): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (block): block is McpTextContent => block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text)
    .join('\n');
}

const DEFAULT_TIMEOUT_MS = 20_000;
const CLIENT_INFO: McpClientInfo = { name: 'unscript', version: '0.5.0' };

export function createMcpClient(options: McpClientOptions): McpClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let sessionId: string | null = null;
  let nextId = 0;

  async function post(body: JsonRpcMessage): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    headers.Authorization = `Bearer ${options.token}`;
    if (sessionId !== null) headers['MCP-Session-Id'] = sessionId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(options.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (cause.name === 'AbortError') {
        throw new McpConnectionError(
          `Context MCP request timed out after ${timeoutMs}ms.`,
          'Check the endpoint URL and your network connection, then retry.',
        );
      }
      throw new McpConnectionError(
        `Context MCP request failed: ${cause.message}`,
        'Check `SANITY_CONTEXT_MCP_URL` and your network connection.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function exchange(method: string, params?: unknown): Promise<JsonRpcMessage> {
    nextId += 1;
    const requestId = nextId;
    const body: JsonRpcMessage = { jsonrpc: '2.0', id: requestId, method };
    if (params !== undefined) body.params = params;

    const response = await post(body);
    const status = response.status;

    if (status === 401 || status === 403) {
      throw new McpAuthenticationError(
        `Context MCP authentication failed (HTTP ${status}).`,
        'Check `SANITY_ORGANIZATION_TOKEN` — it needs Context Viewer permission (sanity.knowledge-base.read).',
      );
    }
    if (status === 404) {
      throw new McpConnectionError(
        'Context MCP endpoint not found (HTTP 404).',
        'Check `SANITY_CONTEXT_MCP_URL` — the organization id or endpoint name may be wrong.',
      );
    }
    if (status === 502 || status === 503) {
      throw new McpConnectionError(
        `Context MCP endpoint is unreachable (HTTP ${status}).`,
        'The endpoint could not answer; verify the organization token and the endpoint sources.',
      );
    }
    if (status === 429) {
      throw new McpConnectionError(
        'Context MCP is rate-limited (HTTP 429).',
        'Wait a moment and retry.',
      );
    }
    if (!response.ok) {
      throw new McpConnectionError(
        `Context MCP returned HTTP ${status}.`,
        'Check the endpoint configuration and retry.',
      );
    }

    const nextSession = response.headers.get('MCP-Session-Id');
    if (nextSession !== null && nextSession !== '') sessionId = nextSession;

    const text = await response.text();
    const message = parseJsonRpcResponse(
      text,
      (response.headers.get('content-type') ?? '').toLowerCase(),
      requestId,
    );

    if (message.error !== undefined) {
      throw new McpProtocolError(
        `MCP server error (${message.error.code}): ${message.error.message}`,
      );
    }
    return message;
  }

  async function initialize(): Promise<McpInitializeResult> {
    const message = await exchange('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    const result = message.result as McpInitializeResult | undefined;
    if (result === undefined || typeof result !== 'object' || result === null) {
      throw new McpProtocolError('MCP initialize did not return a result.');
    }
    // Notification, no reply expected; failures here are ignored.
    void post({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => undefined);
    return result;
  }

  async function listTools(): Promise<McpTool[]> {
    const message = await exchange('tools/list', {});
    const result = message.result as Partial<McpListToolsResult> | undefined;
    if (result === undefined || !Array.isArray(result.tools)) {
      throw new McpProtocolError('MCP tools/list did not return a tool list.');
    }
    return result.tools;
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const message = await exchange('tools/call', { name, arguments: args });
    const result = message.result as Partial<McpCallToolResult> | undefined;
    if (result === undefined || typeof result !== 'object' || result === null) {
      throw new McpToolError(name, 'the tool returned no result.');
    }
    if (result.isError === true) {
      const detail = contentToText(result.content);
      throw new McpToolError(name, detail !== '' ? detail : 'the tool reported an error.');
    }
    if (result.structuredContent !== undefined) return result.structuredContent;
    const text = contentToText(result.content);
    if (text !== '') return text;
    throw new McpToolError(name, 'the tool returned an empty response.');
  }

  return {
    initialize,
    listTools,
    callTool,
    get sessionId(): string | null {
      return sessionId;
    },
  };
}
