import { execFile } from 'node:child_process';
import { renderCheck, EXIT_OK, EXIT_ERROR } from '../../core/errors.js';
import { loadConfig, loadEnvFile } from '../../config/index.js';
import {
  requiredNodeVersion,
  satisfiesMinimum,
  readPackageJson,
} from '../../utils/package-info.js';
import { theme } from '../ui/theme.js';
import { pageHeader, rule } from '../ui/banner.js';
import type { CheckResult } from '../../types/config.js';
import { loadRuntimeConfig } from '../../config/env.js';
import { createContextMcp, REQUIRED_TOOLS } from '../../mcp/contextMcp.js';
import { createGeminiClient } from '../../gemini/client.js';
import { GEMINI_MODEL } from '../../gemini/types.js';
import { debugLog } from '../../utils/log.js';

/**
 * `unscript doctor` — real environment checks only.
 *
 * Local checks cover Node.js, npm, configuration, and terminal behavior.
 * Runtime service checks are honest about configuration: when a runtime
 * credential is missing the check warns (never fails) and tells the user
 * what to set; when credentials exist, doctor runs a real lightweight
 * connectivity probe against the Context MCP and Gemini, clearly labeled
 * as live checks.
 */

interface RunResult {
  code: number | null;
  stdout: string;
  err: Error | null;
}

function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10_000, windowsHide: true }, (err, stdout) => {
      resolve({
        code: err
          ? typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code?: unknown }).code as number)
            : null
          : 0,
        stdout: stdout.trim(),
        err,
      });
    });
  });
}

async function checkNodeVersion(): Promise<CheckResult> {
  const minimum = requiredNodeVersion();
  const current = process.versions.node;
  if (minimum === '') {
    return {
      name: 'Node.js',
      detail: current,
      status: 'warn',
      hint: 'No "engines.node" minimum declared in package.json.',
    };
  }
  if (satisfiesMinimum(current, minimum)) {
    return { name: 'Node.js', detail: `v${current} (requires >=${minimum})`, status: 'pass' };
  }
  return {
    name: 'Node.js',
    detail: `v${current} (requires >=${minimum})`,
    status: 'fail',
    hint: 'Upgrade Node.js to the version in package.json "engines".',
  };
}

async function checkNpm(): Promise<CheckResult> {
  const result = await run('npm', ['--version']);
  if (result.code === 0 && result.stdout !== '') {
    return { name: 'npm', detail: result.stdout, status: 'pass' };
  }
  const message = result.err?.message ?? 'could not determine version';
  return {
    name: 'npm',
    detail: 'not available',
    status: 'warn',
    hint: `npm is needed for install/build scripts (${message}).`,
  };
}

function checkConfiguration(): CheckResult {
  const envFile = loadEnvFile();
  const { problems } = loadConfig(process.env);

  const name = 'Configuration';
  if (envFile.error) {
    return {
      name,
      detail: 'could not read .env file',
      status: 'fail',
      hint: `Fix the .env file syntax and re-run (${envFile.error}).`,
    };
  }
  const fatal = problems.filter((p) => p.severity === 'fail');
  if (fatal.length > 0) {
    return {
      name,
      detail: fatal[0]!.message,
      status: 'fail',
      hint: 'Fix the reported value in .env and re-run doctor.',
    };
  }
  const warns = problems.filter((p) => p.severity === 'warn');
  const source = envFile.found ? '.env loaded' : '.env not found; defaults are valid';
  if (warns.length > 0) {
    return {
      name,
      detail: `${source} — ${warns[0]!.message}`,
      status: 'warn',
      hint: 'Fix the reported value in .env.',
    };
  }
  return { name, detail: source, status: 'pass' };
}

function checkTerminal(): CheckResult {
  const isTty = process.stdout.isTTY === true && process.stdin.isTTY === true;
  if (isTty) {
    return { name: 'Terminal', detail: 'interactive TTY detected', status: 'pass' };
  }
  return {
    name: 'Terminal',
    detail: 'output is not a TTY',
    status: 'warn',
    hint: 'Colors are disabled and the home screen is unavailable; commands still work.',
  };
}

async function checkContextMcp(): Promise<CheckResult> {
  const config = loadRuntimeConfig();
  const name = 'Context MCP';

  if (!config.contextMcp.configured) {
    const missing =
      config.contextMcp.url === null && config.contextMcp.token === null
        ? 'not configured'
        : config.contextMcp.url === null
          ? 'endpoint URL missing'
          : 'token missing';
    return {
      name,
      detail: `${missing} (SANITY_CONTEXT_MCP_URL / SANITY_ORGANIZATION_TOKEN)`,
      status: 'warn',
      hint: 'Set both variables so the knowledge layer can reach Sanity. Copy .env.example to .env.',
    };
  }

  const mcp = createContextMcp({
    endpoint: config.contextMcp.url!,
    token: config.contextMcp.token!,
    timeoutMs: 15_000,
  });
  try {
    await mcp.initialize();
    const tools = await mcp.listTools();
    const missingTools = REQUIRED_TOOLS.filter((name) => !tools.some((tool) => tool.name === name));
    if (missingTools.length > 0) {
      return {
        name,
        detail: `connected, but missing tools: ${missingTools.join(', ')}`,
        status: 'fail',
        hint: 'Use a Context MCP endpoint in GROQ mode (dataset source), or recreate the endpoint.',
      };
    }
    // The endpoint requires initial_context before any groq_query; run it to
    // verify the session protocol works end to end.
    await mcp.initialContext();
    return {
      name,
      detail: `live check passed · ${tools.length} tool(s), initial_context + groq_query ok`,
      status: 'pass',
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message !== '' ? String(error.message) : 'connection failed';
    return {
      name,
      detail: `live check failed: ${message}`,
      status: 'fail',
      hint: `Check the endpoint and token${config.contextMcp.tokenLabel !== null ? ` (token ${config.contextMcp.tokenLabel})` : ''}.`,
    };
  }
}

async function checkGemini(): Promise<CheckResult> {
  const config = loadRuntimeConfig();
  const name = 'Gemini';

  if (!config.gemini.configured) {
    return {
      name,
      detail: 'not configured (GEMINI_API_KEY)',
      status: 'warn',
      hint: 'Set GEMINI_API_KEY to use the transformation engine with ' + GEMINI_MODEL + '.',
    };
  }

  const client = createGeminiClient({
    apiKey: config.gemini.apiKey!,
    timeoutMs: 15_000,
  });
  try {
    await client.ping();
    return {
      name,
      detail: `live check passed · key ${config.gemini.apiKeyLabel} reachable`,
      status: 'pass',
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message !== '' ? String(error.message) : 'connection failed';
    const detail =
      error instanceof Error && error.name === 'GeminiApiError'
        ? message
        : `live check failed: ${message}`;
    return {
      name,
      detail,
      status: 'fail',
      hint: 'Ensure the API key is valid and the network can reach Google AI.',
    };
  }
}

async function runChecks(): Promise<CheckResult[]> {
  return Promise.all([
    checkNodeVersion(),
    checkNpm(),
    Promise.resolve(checkConfiguration()),
    Promise.resolve(checkTerminal()),
    checkContextMcp(),
    checkGemini(),
  ]);
}

export async function runDoctor(debug: boolean): Promise<number> {
  const interactive = process.stdout.isTTY === true;
  const start = Date.now();

  if (interactive) {
    process.stdout.write(`${theme.muted('Checking your environment…')}\n`);
  }

  const checks = await runChecks();
  const elapsed = Date.now() - start;
  if (debug) debugLog(`doctor ran ${checks.length} checks in ${elapsed}ms`);

  if (interactive) {
    process.stdout.write('\u001b[1A\u001b[K');
  }

  const { version } = readPackageJson();
  const width = Math.max(40, Math.min(process.stdout.columns ?? 80, 100));
  const lines: string[] = ['', ...pageHeader('Doctor', width), ''];
  for (const check of checks) {
    lines.push(renderCheck(check));
  }
  lines.push('', rule(Math.min(width, 80)), '');

  const failed = checks.some((check) => check.status === 'fail');
  const passed = checks.filter((check) => check.status === 'pass').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;

  if (failCount === 0) {
    const summary =
      warnCount === 0
        ? `${checks.length} checks passed`
        : `${passed} passed · ${warnCount} warning${warnCount === 1 ? '' : 's'}`;
    lines.push(`  ${theme.success('✓')} ${summary}`);
    lines.push('');
    lines.push(theme.bright('Runtime ready'));
    lines.push(theme.muted(`  unscript v${version} · ${elapsed}ms real time`));
  } else {
    const summary = `${failCount} check${failCount === 1 ? '' : 's'} failed`;
    lines.push(`  ${theme.error('✗')} ${summary}`);
    lines.push('');
    lines.push(theme.warning('Fix the items above, then re-run `unscript doctor`.'));
  }
  lines.push('');

  for (const line of lines) process.stdout.write(`${line}\n`);
  return failed ? EXIT_ERROR : EXIT_OK;
}
