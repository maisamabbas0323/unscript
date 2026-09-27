import { renderCheck, EXIT_OK } from '../../core/errors.js';
import { loadEnvFile, loadConfig } from '../../config/index.js';
import {
  loadRuntimeConfig,
  missingRuntimeConfig,
  runtimeSetupMessage,
  type RuntimeConfig,
} from '../../config/env.js';
import type { CheckResult, ConfigProblem } from '../../types/config.js';
import { theme } from '../ui/theme.js';
import { pageHeader, rule } from '../ui/banner.js';
import { wrap } from '../../utils/text.js';
import { debugLog } from '../../utils/log.js';
import { readPackageJson } from '../../utils/package-info.js';

/**
 * `unscript config` — honest local configuration status.
 *
 * Reads the working-directory `.env` file and the three runtime
 * environment variables, then renders exactly what is set. This is a
 * purely local read — no network, no service calls — so the page is
 * deterministic and works identically in TTY and non-TTY modes. Values
 * are never printed: tokens and keys appear only as redacted labels
 * (e.g. `sk-o••••••••1234`) produced by `loadRuntimeConfig`.
 */

export interface ConfigRowInput {
  /** Status of the `.env` file, from `loadEnvFile()`. */
  envFile: { found: boolean; filename?: string; error?: string };
  /** Runtime configuration, from `loadRuntimeConfig()`. */
  runtime: RuntimeConfig;
  /** Problems from `loadConfig()` (e.g. an invalid `UNSCRIPT_DEBUG` value). */
  debugProblems: ConfigProblem[];
}

/** Rows for the config page, one per setting; labels, never color-only. */
export function buildConfigRows(input: ConfigRowInput): CheckResult[] {
  const { envFile, runtime, debugProblems } = input;
  const rows: CheckResult[] = [];

  if (envFile.error) {
    rows.push({
      name: '.env file',
      detail: `found but could not read: ${envFile.error}`,
      status: 'fail',
      hint: 'Fix the .env file syntax and re-run `unscript config`.',
    });
  } else if (envFile.found) {
    rows.push({
      name: '.env file',
      detail: `found (${envFile.filename ?? '.env'})`,
      status: 'pass',
    });
  } else {
    rows.push({
      name: '.env file',
      detail: 'not found — shell environment values still apply',
      status: 'pass',
      hint: 'Copy .env.example to .env to configure the runtime.',
    });
  }

  const url = runtime.contextMcp.url;
  rows.push(
    url !== null
      ? { name: 'MCP URL', detail: 'SANITY_CONTEXT_MCP_URL set', status: 'pass' }
      : {
          name: 'MCP URL',
          detail: 'SANITY_CONTEXT_MCP_URL unset',
          status: 'warn',
          hint: 'Set the hosted Context MCP endpoint URL in .env (see .env.example).',
        },
  );

  const tokenLabel = runtime.contextMcp.tokenLabel;
  rows.push(
    tokenLabel !== null
      ? {
          name: 'MCP token',
          detail: `SANITY_ORGANIZATION_TOKEN set (${tokenLabel})`,
          status: 'pass',
        }
      : {
          name: 'MCP token',
          detail: 'SANITY_ORGANIZATION_TOKEN unset',
          status: 'warn',
          hint: 'Set an organization API token with Context Viewer permission.',
        },
  );

  const keyLabel = runtime.gemini.apiKeyLabel;
  rows.push(
    keyLabel !== null
      ? { name: 'Gemini key', detail: `GEMINI_API_KEY set (${keyLabel})`, status: 'pass' }
      : {
          name: 'Gemini key',
          detail: 'GEMINI_API_KEY unset',
          status: 'warn',
          hint: 'Set a Google AI Studio API key in your .env file.',
        },
  );

  const debugProblem = debugProblems.find((problem) => problem.key === 'UNSCRIPT_DEBUG');
  rows.push(
    debugProblem
      ? { name: 'Debug', detail: debugProblem.message, status: 'warn' }
      : { name: 'Debug', detail: `UNSCRIPT_DEBUG ${runtime.debug ? 'on' : 'off'}`, status: 'pass' },
  );

  return rows;
}

/**
 * Hard-split a token (e.g. a full endpoint URL) that no word-wrap can
 * break: cut at the last `/` within each available-width window so the
 * split falls on path boundaries; fall back to character slicing.
 */
function hardSplitLongWord(word: string, available: number): string[] {
  const lines: string[] = [];
  let rest = word;
  while (rest.length > available) {
    const window = rest.slice(0, available);
    const slash = window.lastIndexOf('/');
    if (slash > 0) {
      lines.push(rest.slice(0, slash + 1));
      rest = rest.slice(slash + 1);
    } else {
      lines.push(window);
      rest = rest.slice(available);
    }
  }
  if (rest !== '') lines.push(rest);
  return lines;
}

/**
 * Wrap one printed line to the page width, preserving its leading
 * indent so `runtimeSetupMessage`'s two-column variable list keeps its
 * alignment (continuation lines re-use the same indent). Tokens too
 * long to break on spaces (e.g. a full endpoint URL) are hard-split at
 * path boundaries. Lines that already fit are returned unchanged.
 */
function wrapIndented(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const indent = line.length - line.trimStart().length;
  const content = line.trim();
  const available = Math.max(8, width - indent);
  const out: string[] = [];
  for (const part of wrap(content, available).split('\n')) {
    for (const chunk of part.length <= available ? [part] : hardSplitLongWord(part, available)) {
      out.push(`${' '.repeat(indent)}${chunk}`);
    }
  }
  return out;
}

/** `unscript config` — local status, exit 0; setup guidance when anything is missing. */
export function runConfig(debug: boolean): number {
  const start = Date.now();
  const envFile = loadEnvFile();
  const runtime = loadRuntimeConfig();
  const { problems } = loadConfig(process.env);
  const rows = buildConfigRows({ envFile, runtime, debugProblems: problems });

  const width = Math.max(40, Math.min(process.stdout.columns ?? 80, 100));
  const lines: string[] = ['', ...pageHeader('Config', width), ''];
  for (const row of rows) lines.push(renderCheck(row));

  lines.push('', rule(Math.min(width, 80)), '');

  const missing = missingRuntimeConfig(runtime);
  const bodyWidth = Math.min(width, 80);
  if (missing.length === 0) {
    lines.push(`  ${theme.success('✓')} Runtime ready`);
    lines.push(theme.muted('  everything the transformation flow needs is configured'));
  } else {
    lines.push(`  ${theme.warning('!')} Setup needed: ${missing.join(', ')}`);
    lines.push('');
    for (const line of runtimeSetupMessage(missing).split('\n')) {
      if (line === '') lines.push('');
      else lines.push(...wrapIndented(line, bodyWidth));
    }
  }
  const { version } = readPackageJson();
  lines.push(theme.muted(`  unscript v${version} · local status, no network`));
  lines.push('');

  if (debug) debugLog(`config reported in ${Date.now() - start}ms`);
  for (const line of lines) process.stdout.write(`${line}\n`);
  return EXIT_OK;
}
