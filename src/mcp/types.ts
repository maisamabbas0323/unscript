/**
 * Minimal JSON-RPC 2.0 / Model Context Protocol types used by the
 * Sanity Context MCP client. Only the pieces the runtime needs are
 * modeled; unknown fields on wire responses are tolerated.
 */

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  /** Present on requests and responses, absent on notifications. */
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpClientInfo {
  name: string;
  version: string;
}

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: McpClientInfo;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name?: string; version?: string; [key: string]: unknown };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface McpListToolsResult {
  tools: McpTool[];
}

export interface McpTextContent {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

export interface McpImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  [key: string]: unknown;
}

/** Content block union; only text content is consumed by the runtime. */
export type McpContent =
  McpTextContent | McpImageContent | { type: string; [key: string]: unknown };

export interface McpCallToolResult {
  content: McpContent[];
  isError?: boolean;
  structuredContent?: unknown;
  [key: string]: unknown;
}

/** The Context MCP tool names the runtime depends on (GROQ mode). */
export const CONTEXT_TOOLS = {
  initialContext: 'initial_context',
  schemaExplorer: 'schema_explorer',
  groqQuery: 'groq_query',
  knowledgeBaseRead: 'knowledge_base_read',
} as const;

/** MCP protocol version the client negotiates. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
