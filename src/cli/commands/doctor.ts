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

/**
 * `unscript doctor` — real, local environment checks only.
 * Node version, npm availability, configuration loading, and terminal
 * behavior. No checks for Sanity, MCP, or Gemini: those integrations
 * are not part of the foundation and must not be implied.
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

async function runChecks(): Promise<CheckResult[]> {
  return Promise.all([
    checkNodeVersion(),
    checkNpm(),
    Promise.resolve(checkConfiguration()),
    Promise.resolve(checkTerminal()),
  ]);
}

export async function runDoctor(_debug: boolean): Promise<number> {
  const interactive = process.stdout.isTTY === true;
  const start = Date.now();

  if (interactive) {
    process.stdout.write(`${theme.muted('Checking your environment…')}\n`);
  }

  const checks = await runChecks();
  const elapsed = Date.now() - start;

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
  const warned = checks.some((check) => check.status === 'warn');
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
    lines.push(theme.bright('Foundation ready'));
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
