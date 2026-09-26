import { createContextMcp, REQUIRED_TOOLS, type ContextMcp } from '../mcp/contextMcp.js';
import { McpToolError } from '../mcp/errors.js';
import { CONTEXT_TOOLS } from '../mcp/types.js';
import { createGeminiClient, type GeminiClient } from '../gemini/client.js';
import type { RuntimeConfig } from '../config/env.js';

/**
 * Wires the real runtime clients (Context MCP + Gemini) from configuration.
 * Configuration was already validated by the caller, so `configured`
 * guarantees the values exist here. No fake clients, no fallbacks.
 */

export interface RuntimeConnection {
  mcp: ContextMcp;
  gemini: GeminiClient;
  config: RuntimeConfig;
}

export function connectRuntime(config: RuntimeConfig): RuntimeConnection {
  const endpoint = config.contextMcp.url ?? '';
  const token = config.contextMcp.token ?? '';
  const mcp = createContextMcp({ endpoint, token, timeoutMs: 30_000 });
  const gemini = createGeminiClient({ apiKey: config.gemini.apiKey ?? '' });
  return { mcp, gemini, config };
}

/**
 * Connect to the Context MCP and prepare a session for knowledge retrieval.
 *
 * Session protocol per the Context MCP: `initialize` (plus the
 * `notifications/initialized` notification) is followed by the
 * `initial_context` tool — the endpoint requires that tool to run before
 * any `groq_query` — and then `tools/list`. A Knowledge Base-mode endpoint
 * surfaces a clear configuration error.
 */
/**
 * Real phases of the Context MCP session setup, in protocol order. Fired
 * via `onStep` only after each phase actually completes, so the interactive
 * progress line never implies work that has not happened yet.
 */
export type PreflightStep = 'initialize' | 'initial-context' | 'tools-list';

export async function preflightContextMcp(
  mcp: ContextMcp,
  onStep?: (step: PreflightStep) => void,
): Promise<void> {
  await mcp.initialize();
  onStep?.('initialize');

  // Context MCP: "Always call this first." Runs before any groq_query.
  let initialContextError: unknown = null;
  try {
    await mcp.initialContext();
    onStep?.('initial-context');
  } catch (error) {
    initialContextError = error;
  }

  const tools = await mcp.listTools();
  onStep?.('tools-list');
  const present = new Set(tools.map((tool) => tool.name));
  const missing = REQUIRED_TOOLS.filter((name) => !present.has(name));
  if (missing.length > 0) {
    const knowledgeBaseMode = present.has(CONTEXT_TOOLS.knowledgeBaseRead);
    throw new McpToolError(
      'tools/list',
      `Context MCP is missing required GROQ-mode tools: ${missing.join(', ')}.`,
      knowledgeBaseMode
        ? 'This endpoint serves a Knowledge Base. Create or select an endpoint in GROQ mode ' +
            '(a dataset source) that exposes groq_query.'
        : 'Create a Context MCP endpoint in GROQ mode, or check `SANITY_CONTEXT_MCP_URL`.',
    );
  }

  if (initialContextError !== null) {
    throw initialContextError instanceof Error
      ? initialContextError
      : new Error(String(initialContextError));
  }
}
