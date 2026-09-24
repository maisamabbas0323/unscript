import { isConfigured, redactSecret } from '../utils/secrets.js';
import { parseBool } from './index.js';

/**
 * Runtime configuration for the Unscript agent runtime (Step 5).
 *
 * Environment variables:
 *
 *   SANITY_CONTEXT_MCP_URL    — full URL of the hosted Sanity Context MCP
 *                               endpoint, e.g.
 *                               https://api.sanity.io/v1/context/organizations/<org-id>/mcp/<endpoint-name>
 *   SANITY_ORGANIZATION_TOKEN — organization API token with Context Viewer
 *                               permission (grant `sanity.knowledge-base.read`)
 *   GEMINI_API_KEY            — Google AI Studio API key used to authenticate
 *                               Gemini requests.
 *
 * Values are never logged and never embedded in error messages. The only
 * derived forms exposed to the UI are redacted labels for doctor output.
 */

export interface ContextMcpConfig {
  /** Full Context MCP endpoint URL, or null when not set. */
  url: string | null;
  /** Organization API token, or null when not set. */
  token: string | null;
  /** True only when both the endpoint and token are present. */
  configured: boolean;
  /** Redacted form of the token for safe display. */
  tokenLabel: string | null;
}

export interface GeminiConfig {
  /** Gemini API key, or null when not set. */
  apiKey: string | null;
  /** True when an API key is present. */
  configured: boolean;
  /** Redacted form of the key for safe display. */
  apiKeyLabel: string | null;
}

export interface RuntimeConfig {
  debug: boolean;
  contextMcp: ContextMcpConfig;
  gemini: GeminiConfig;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const rawDebug = env.UNSCRIPT_DEBUG;
  const debug = rawDebug !== undefined && rawDebug !== '' ? (parseBool(rawDebug) ?? false) : false;

  const url = env.SANITY_CONTEXT_MCP_URL?.trim() || null;
  const token = env.SANITY_ORGANIZATION_TOKEN?.trim() || null;
  const apiKey = env.GEMINI_API_KEY?.trim() || null;

  return {
    debug,
    contextMcp: {
      url,
      token,
      configured: isConfigured(url) && isConfigured(token),
      tokenLabel: token ? redactSecret(token) : null,
    },
    gemini: {
      apiKey,
      configured: isConfigured(apiKey),
      apiKeyLabel: apiKey ? redactSecret(apiKey) : null,
    },
  };
}

export type MissingRuntime = 'context-mcp' | 'gemini';

/** Which runtime dependencies are not configured. */
export function missingRuntimeConfig(config: RuntimeConfig): MissingRuntime[] {
  const missing: MissingRuntime[] = [];
  if (!config.contextMcp.configured) missing.push('context-mcp');
  if (!config.gemini.configured) missing.push('gemini');
  return missing;
}

/** Actionable, secret-free setup instructions for whatever is missing. */
export function runtimeSetupMessage(missing: MissingRuntime[]): string {
  const lines: string[] = [];
  const add = (name: string, value: string, note: string): void => {
    lines.push(`  ${name}${' '.repeat(Math.max(1, 24 - name.length))}${note}`);
    if (value !== '') lines.push(`${' '.repeat(26)}${value}`);
  };

  if (missing.includes('context-mcp')) {
    lines.push('Context MCP is not configured.');
    lines.push('Create a Context MCP endpoint in the Sanity Context app (GROQ mode),');
    lines.push('then set:');
    add(
      'SANITY_CONTEXT_MCP_URL',
      'https://api.sanity.io/v1/context/organizations/<org-id>/mcp/<endpoint-name>',
      'the hosted Context MCP endpoint URL',
    );
    add('SANITY_ORGANIZATION_TOKEN', '', 'organization API token with Context Viewer permission');
  }

  if (missing.includes('gemini')) {
    if (lines.length > 0) lines.push('');
    lines.push('Gemini is not configured.');
    lines.push('Set:');
    add('GEMINI_API_KEY', '', 'Google AI Studio API key');
  }

  lines.push('');
  lines.push('Create a `.env` file from `.env.example` with these values and retry.');
  return lines.join('\n');
}
