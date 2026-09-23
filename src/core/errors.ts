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

/** Render one doctor check line: "✓ PASS  label  detail". */
export function renderCheck(check: CheckResult): string {
  const label = check.name.padEnd(15);
  const statusText = check.status.toUpperCase().padEnd(5);
  const coloredStatus = (() => {
    switch (check.status) {
      case 'pass':
        return colors.green(statusText);
      case 'warn':
        return colors.yellow(statusText);
      case 'fail':
        return colors.red(statusText);
    }
  })();
  const line = `${paint(check.status)} ${coloredStatus}  ${label}${check.detail}`;
  return check.hint ? `${line}\n${colors.dim(`    ${check.hint}`)}` : line;
}

/** Write an error to stderr, hiding stack traces unless debug is on. */
export function printError(error: unknown, debug: boolean): void {
  const errStream = process.stderr;

  if (error instanceof UnscriptError) {
    if (debug) {
      errStream.write(`${error.stack ?? error.message}\n`);
      return;
    }
    errStream.write(`unscript: ${error.message}\n`);
    if (error.hint) {
      errStream.write(`${colors.dim(error.hint, errStream)}\n`);
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (debug && error instanceof Error && error.stack) {
    errStream.write(`${error.stack}\n`);
    return;
  }
  errStream.write(`unscript: unexpected error: ${message}\n`);
  errStream.write(`${colors.dim('Run unscript with --debug to see full details.', errStream)}\n`);
}
