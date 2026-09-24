import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig, missingRuntimeConfig, runtimeSetupMessage } from '../src/config/env.js';

describe('loadRuntimeConfig', () => {
  it('defaults to fully unconfigured when no runtime vars are set', () => {
    const config = loadRuntimeConfig({});
    expect(config.debug).toBe(false);
    expect(config.contextMcp.configured).toBe(false);
    expect(config.contextMcp.url).toBeNull();
    expect(config.contextMcp.token).toBeNull();
    expect(config.contextMcp.tokenLabel).toBeNull();
    expect(config.gemini.configured).toBe(false);
    expect(config.gemini.apiKey).toBeNull();
  });

  it('reads the Context MCP URL and token together', () => {
    const config = loadRuntimeConfig({
      SANITY_CONTEXT_MCP_URL: 'https://api.sanity.io/v1/context/organizations/org/mcp/main',
      SANITY_ORGANIZATION_TOKEN: 'sk-org-token-value',
    });
    expect(config.contextMcp.configured).toBe(true);
    expect(config.contextMcp.url).toBe(
      'https://api.sanity.io/v1/context/organizations/org/mcp/main',
    );
    expect(config.contextMcp.token).toBe('sk-org-token-value');
    expect(config.contextMcp.tokenLabel).toContain('sk-o');
    expect(config.contextMcp.tokenLabel).not.toContain('org-token');
  });

  it('considers the Context MCP unconfigured when only one of url/token is set', () => {
    const config = loadRuntimeConfig({ SANITY_ORGANIZATION_TOKEN: 'sk-org' });
    expect(config.contextMcp.configured).toBe(false);
  });

  it('reads the Gemini key and produces a redacted label', () => {
    const config = loadRuntimeConfig({ GEMINI_API_KEY: 'AIzaSylvester-key-1234' });
    expect(config.gemini.configured).toBe(true);
    expect(config.gemini.apiKey).toBe('AIzaSylvester-key-1234');
    expect(config.gemini.apiKeyLabel).toContain('AIza');
    expect(config.gemini.apiKeyLabel).not.toContain('key-1234');
  });

  it('trims whitespace and treats blanks as missing', () => {
    const config = loadRuntimeConfig({
      GEMINI_API_KEY: '   ',
      SANITY_ORGANIZATION_TOKEN: '',
    });
    expect(config.gemini.configured).toBe(false);
    expect(config.contextMcp.configured).toBe(false);
  });
});

describe('missingRuntimeConfig', () => {
  it('reports everything that is unconfigured', () => {
    expect(missingRuntimeConfig(loadRuntimeConfig({}))).toEqual(['context-mcp', 'gemini']);
    expect(missingRuntimeConfig(loadRuntimeConfig({ GEMINI_API_KEY: 'k' }))).toEqual([
      'context-mcp',
    ]);
    expect(
      missingRuntimeConfig(
        loadRuntimeConfig({
          GEMINI_API_KEY: 'k',
          SANITY_ORGANIZATION_TOKEN: 't',
          SANITY_CONTEXT_MCP_URL: 'u',
        }),
      ),
    ).toEqual([]);
  });
});

describe('runtimeSetupMessage', () => {
  it('names the variables to set without echoing values', () => {
    const message = runtimeSetupMessage(['context-mcp', 'gemini']);
    expect(message).toContain('SANITY_CONTEXT_MCP_URL');
    expect(message).toContain('SANITY_ORGANIZATION_TOKEN');
    expect(message).toContain('GEMINI_API_KEY');
    expect(message).toContain('.env.example');
  });

  it('only mentions what is actually missing', () => {
    const message = runtimeSetupMessage(['gemini']);
    expect(message).toContain('GEMINI_API_KEY');
    expect(message).not.toContain('SANITY_ORGANIZATION_TOKEN');
  });
});
