import { colors } from '../utils/colors.js';
import type { CheckResult, CheckStatus } from '../types/config.js';

/**
 * Error types carry a process exit code and an optional actionable hint.
 * Errors are rendered without raw stack traces unless debug mode is on.
 */

export type ExitCode = 0 | 1 | 2 | 130;

export const EXIT_OK: ExitCode = 0;
export const EXIT_ERROR: ExitCode = 1;
export const EXIT_USAGE: ExitCode = 2;
export const EXIT_INTERRUPTED: ExitCode = 130;

export class UnscriptError extends Error {
  readonly hint?: string;
  readonly exitCode: ExitCode;

  constructor(message: string, options: { hint?: string; exitCode?: ExitCode } = {}) {
    super(message);
    this.name = 'UnscriptError';
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? EXIT_ERROR;
  }
}

/** Bad or unknown CLI arguments — usage errors exit with code 2. */
export class UsageError extends UnscriptError {
  constructor(message: string, options: { hint?: string } = {}) {
    super(message, { ...options, exitCode: EXIT_USAGE });
    this.name = 'UsageError';
  }
}

/** Runtime/operational failure — exits with code 1. */
export class OperationalError extends UnscriptError {
  constructor(message: string, options: { hint?: string } = {}) {
    super(message, { ...options, exitCode: EXIT_ERROR });
    this.name = 'OperationalError';
  }
}

function paint(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return colors.green('✓');
    case 'warn':
      return colors.yellow('!');
    case 'fail':
      return colors.red('✗');
  }
}

/** Render one doctor check row: "✓ PASS  Node.js   v22.23.2". */
export function renderCheck(check: CheckResult): string {
  const statusText = check.status.toUpperCase();
  const status = (() => {
    switch (check.status) {
      case 'pass':
        return colors.green(statusText);
      case 'warn':
        return colors.yellow(statusText);
      case 'fail':
        return colors.red(statusText);
    }
  })();
  const row = `  ${paint(check.status)} ${status.padEnd(5)}  ${check.name.padEnd(14)}${check.detail}`;
  return check.hint ? `${row}\n  ${colors.dim(`↳ ${check.hint}`, process.stdout)}` : row;
}

/**
 * Write an error to stderr as a designed page. Raw stack traces appear
 * only when debug is on; the underlying message is never hidden.
 */
export function printError(error: unknown, debug: boolean): void {
  const stream = process.stderr;
  const dim = (text: string): string => colors.dim(text, stream);
  const bright = (text: string): string => colors.bold(text, stream);
  const red = (text: string): string => colors.red(text, stream);
  const cyan = (text: string): string => colors.cyan(text, stream);

  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof UnscriptError ? error.hint : undefined;
  const kind = error instanceof UnscriptError ? '\n' : '\n  (unexpected)';

  const header = `${red(bright('UNSCRIPT'))}${dim(' / ')}${bright('ERROR')}`;

  if (debug) {
    stream.write(`${header}${kind}\n\n`);
    stream.write(`${error instanceof Error ? (error.stack ?? message) : message}\n`);
    if (hint) stream.write(`${dim(`\n${hint}`)}\n`);
    if (error instanceof UnscriptError && error.exitCode) {
      stream.write(`${dim(`\nexit code ${error.exitCode}`)}\n`);
    }
    return;
  }

  stream.write(`${header}${kind}\n\n`);
  stream.write(`Something went wrong.\n\n`);
  stream.write(`  ${message}\n`);
  if (hint) {
    stream.write(`\nWhat to do next:\n\n`);
    stream.write(`  ${hint}\n`);
  }
  stream.write(`\n${dim(`Run ${cyan('unscript --debug')} for full details.`)}\n`);
}
