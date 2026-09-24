import { createMcpClient, type McpClient, type McpClientOptions } from './client.js';
import { McpProtocolError, McpToolError } from './errors.js';
import { CONTEXT_TOOLS, type McpTool } from './types.js';

/**
 * Sanity Context MCP facade.
 *
 * Context MCP is the hosted, read-only MCP server behind Sanity Context
 * (https://www.sanity.io/docs/ai/sanity-context). In GROQ mode it serves
 * `initial_context`, `schema_explorer`, and `groq_query`; it can never
 * write to the dataset. The runtime depends on that read-only access for
 * knowledge retrieval.
 */

export interface ContextMcpOptions {
  endpoint: string;
  token: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/** Initial-context payload: free text/JSON describing schema and tools. */
export interface InitialContextPayload {
  text: string;
  json: Record<string, unknown> | null;
  tools: string[];
}

/** Welcome payload shape that some Context MCP servers return as JSON. */
interface WelcomeJson {
  tools?: unknown;
  instructions?: unknown;
  schema?: unknown;
}

export interface ContextMcp {
  /** The raw JSON-RPC client underlying this facade. */
  client: McpClient;
  initialize(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  /** Fetch the initial-context payload over HTTP (no MCP round trip). */
  fetchInitialContext(): Promise<InitialContextPayload>;
  /**
   * Call the real `initial_context` MCP tool. The Context MCP requires
   * this tool to run before any `groq_query`; every session calls it
   * during preflight.
   */
  initialContext(): Promise<InitialContextPayload>;
  /** Run a GROQ query against the endpoint's dataset source. */
  queryGroq(query: string): Promise<unknown[]>;
  /** Read detailed schema information for one type. */
  exploreSchema(type: string): Promise<Record<string, unknown>>;
  /** True when the server exposed all tools GROQ mode requires. */
  hasRequiredTools(tools: McpTool[]): boolean;
}

/** Names the runtime needs from a GROQ-mode Context MCP endpoint. */
export const REQUIRED_TOOLS = [
  CONTEXT_TOOLS.initialContext,
  CONTEXT_TOOLS.schemaExplorer,
  CONTEXT_TOOLS.groqQuery,
] as const;

function parseWelcomePayload(text: string): InitialContextPayload {
  let json: Record<string, unknown> | null = null;
  const tools: string[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      json = parsed as Record<string, unknown>;
      const welcome = json as WelcomeJson;
      if (Array.isArray(welcome.tools)) {
        for (const tool of welcome.tools) {
          if (typeof tool === 'string') tools.push(tool);
          else if (typeof tool === 'object' && tool !== null) {
            const name = (tool as { name?: unknown }).name;
            if (typeof name === 'string') tools.push(name);
          }
        }
      }
    }
  } catch {
    json = null;
  }
  return { text, json, tools };
}

/**
 * Parse a `groq_query` result payload into a document array. Handles the
 * `{"result": [...], "meta": {...}}` envelope, bare arrays, single-document
 * objects, and empty "No results" text. Anything else surfaces as a tool
 * error — never a fabricated empty result.
 */
export function parseGroqPayload(payload: unknown): unknown[] {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed === '' || /^no results/i.test(trimmed)) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new McpProtocolError(
        `groq_query returned data that is not valid JSON: ${trimmed.slice(0, 160)}`,
      );
    }
    return unwrapGroqValue(parsed, trimmed);
  }
  return unwrapGroqValue(payload, undefined);
}

/**
 * Unwrap a GROQ result value into a document array. Accepts bare arrays,
 * the `{"result": [...], "meta": {...}}` envelope (which some servers
 * return for their structured payload), and single-document objects.
 * Anything else surfaces as a tool error — never a fabricated empty result.
 */
function unwrapGroqValue(value: unknown, raw: string | undefined): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value !== null) {
    const record = value as { result?: unknown; data?: unknown; _id?: unknown; _type?: unknown };
    if (record.result !== undefined) return normalizeGroqValue(record.result);
    if (record.data !== undefined) return normalizeGroqValue(record.data);
    // A single document object served directly (GROQ `[0]` projections).
    if (typeof record._id === 'string' && typeof record._type === 'string') {
      return [record];
    }
  }
  const detail = raw !== undefined ? raw.slice(0, 160) : String(value);
  throw new McpToolError(
    CONTEXT_TOOLS.groqQuery,
    `groq_query returned an unexpected payload: ${detail}`,
  );
}

/** Normalize a GROQ result value into an array. */
function normalizeGroqValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value !== null) return [value];
  return [];
}

/** Parse a `schema_explorer` result into a plain record. */
export function parseSchemaPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === 'object' && payload !== null) {
    return payload as Record<string, unknown>;
  }
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to the error below
    }
  }
  throw new McpToolError(
    CONTEXT_TOOLS.schemaExplorer,
    'schema_explorer returned an unexpected payload.',
  );
}

export function createContextMcp(options: ContextMcpOptions): ContextMcp {
  const clientOptions: McpClientOptions = {
    endpoint: options.endpoint,
    token: options.token,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  };
  const client = createMcpClient(clientOptions);

  async function initialize(): Promise<void> {
    await client.initialize();
  }

  async function listTools(): Promise<McpTool[]> {
    return client.listTools();
  }

  async function fetchInitialContext(): Promise<InitialContextPayload> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const url = `${options.endpoint.replace(/\/+$/, '')}/initial-context`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.token}` },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new McpProtocolError(
          `Initial-context request was refused (HTTP ${response.status}).`,
          'Check `SANITY_ORGANIZATION_TOKEN` permissions.',
        );
      }
      if (!response.ok) {
        throw new McpProtocolError(`Initial-context request failed (HTTP ${response.status}).`);
      }
      return parseWelcomePayload(await response.text());
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (cause.name === 'AbortError') {
        throw new McpProtocolError('The initial-context request timed out.');
      }
      if (error instanceof McpProtocolError) throw error;
      throw new McpProtocolError(`Initial-context request failed: ${cause.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function queryGroq(query: string): Promise<unknown[]> {
    const payload = await client.callTool(CONTEXT_TOOLS.groqQuery, { query });
    return parseGroqPayload(payload);
  }

  /** Call the `initial_context` MCP tool and parse its welcome payload. */
  async function initialContext(): Promise<InitialContextPayload> {
    const payload = await client.callTool(CONTEXT_TOOLS.initialContext, {});
    if (typeof payload === 'string') return parseWelcomePayload(payload);
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      const text = typeof record.text === 'string' ? record.text : JSON.stringify(payload);
      return parseWelcomePayload(text);
    }
    throw new McpToolError(
      CONTEXT_TOOLS.initialContext,
      'initial_context returned an unexpected payload.',
    );
  }

  async function exploreSchema(type: string): Promise<Record<string, unknown>> {
    const payload = await client.callTool(CONTEXT_TOOLS.schemaExplorer, { type });
    return parseSchemaPayload(payload);
  }

  function hasRequiredTools(tools: McpTool[]): boolean {
    const present = new Set(tools.map((tool) => tool.name));
    return REQUIRED_TOOLS.every((name) => present.has(name));
  }

  return {
    client,
    initialize,
    listTools,
    fetchInitialContext,
    initialContext,
    queryGroq,
    exploreSchema,
    hasRequiredTools,
  };
}
