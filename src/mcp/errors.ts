import { EXIT_ERROR, UnscriptError } from '../core/errors.js';

/**
 * Context MCP failure classes. Each carries an actionable hint and a real
 * exit code; messages never include tokens or full headers.
 */

/** The endpoint is unreachable, misconfigured, or did not respond. */
export class McpConnectionError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'McpConnectionError';
  }
}

/** The org token was rejected (HTTP 401/403) or lacks Context Viewer. */
export class McpAuthenticationError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'McpAuthenticationError';
  }
}

/** The server answered, but with a protocol-level failure. */
export class McpProtocolError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'McpProtocolError';
  }
}

/** A specific tool call failed, or a required tool is missing. */
export class McpToolError extends UnscriptError {
  readonly tool: string;

  constructor(tool: string, message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'McpToolError';
    this.tool = tool;
  }
}
