import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '../src/config/env.js';
import { buildConfigRows, type ConfigRowInput } from '../src/cli/commands/config.js';
import { renderCheck } from '../src/core/errors.js';
import type { CheckResult } from '../src/types/config.js';

function input(overrides: Partial<ConfigRowInput>): ConfigRowInput {
  return {
    envFile: { found: false },
    runtime: loadRuntimeConfig({}),
    debugProblems: [],
    ...overrides,
  };
}

function rowNames(rows: CheckResult[]): string[] {
  return rows.map((row) => row.name);
}

describe('buildConfigRows', () => {
  it('reports a fully unconfigured environment honestly', () => {
    const rows = buildConfigRows(input({}));
    expect(rowNames(rows)).toEqual(['.env file', 'MCP URL', 'MCP token', 'Gemini key', 'Debug']);
    const byName = (name: string): CheckResult => rows.find((r) => r.name === name)!;
    expect(byName('MCP URL').status).toBe('warn');
    expect(byName('MCP URL').detail).toContain('SANITY_CONTEXT_MCP_URL unset');
    expect(byName('MCP token').status).toBe('warn');
    expect(byName('MCP token').detail).toContain('SANITY_ORGANIZATION_TOKEN unset');
    expect(byName('Gemini key').status).toBe('warn');
    expect(byName('Gemini key').detail).toContain('GEMINI_API_KEY unset');
    expect(byName('Debug').status).toBe('pass');
    expect(byName('Debug').detail).toContain('off');
  });

  it('passes every row when all runtime vars are set, with redacted labels only', () => {
    const rows = buildConfigRows(
      input({
        envFile: { found: true, filename: '.env' },
        runtime: loadRuntimeConfig({
          SANITY_CONTEXT_MCP_URL: 'https://api.sanity.io/v1/context/organizations/org/mcp/main',
          SANITY_ORGANIZATION_TOKEN: 'sk-org-super-secret-1234',
          GEMINI_API_KEY: 'AIza-alpha-beta-9876',
        }),
      }),
    );
    expect(rows.every((row) => row.status === 'pass')).toBe(true);
    const tokenRow = rows.find((r) => r.name === 'MCP token')!;
    expect(tokenRow.detail).toContain('sk-o');
    expect(tokenRow.detail).not.toContain('super-secret');
    const keyRow = rows.find((r) => r.name === 'Gemini key')!;
    expect(keyRow.detail).toContain('AIza');
    expect(keyRow.detail).not.toContain('alpha-beta');
  });

  it('fails when the .env file cannot be read', () => {
    const rows = buildConfigRows(
      input({ envFile: { found: true, filename: '.env', error: 'oops' } }),
    );
    const fileRow = rows.find((r) => r.name === '.env file')!;
    expect(fileRow.status).toBe('fail');
    expect(fileRow.detail).toContain('could not read');
  });

  it('warns on an invalid UNSCRIPT_DEBUG value', () => {
    const rows = buildConfigRows(
      input({
        debugProblems: [
          {
            key: 'UNSCRIPT_DEBUG',
            severity: 'warn',
            message: 'Not a recognized boolean; using the default "false".',
          },
        ],
      }),
    );
    const debugRow = rows.find((r) => r.name === 'Debug')!;
    expect(debugRow.status).toBe('warn');
  });

  it('never renders a raw secret through renderCheck', () => {
    const rows = buildConfigRows(
      input({
        runtime: loadRuntimeConfig({
          SANITY_CONTEXT_MCP_URL: 'https://api.sanity.io/v1/context/organizations/org/mcp/main',
          SANITY_ORGANIZATION_TOKEN: 'sk-org-super-secret-1234',
          GEMINI_API_KEY: 'AIza-alpha-beta-9876',
        }),
      }),
    );
    const rendered = rows.map((row) => renderCheck(row).replace(/\x1b\[[0-9;]*m/g, '')).join('\n');
    expect(rendered).not.toContain('super-secret');
    expect(rendered).not.toContain('alpha-beta');
  });
});
