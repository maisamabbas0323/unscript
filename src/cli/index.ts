#!/usr/bin/env node

import { parseArgs } from './args.js';
import { printError, UsageError } from '../core/errors.js';
import { loadConfig, loadEnvFile } from '../config/index.js';
import { runHelp } from './commands/help.js';
import { runVersion } from './commands/version.js';
import { runDoctor } from './commands/doctor.js';
import { runShell } from './commands/shell.js';

/**
 * Piping CLI output into a program that closes early (e.g. `… | head`)
 * must not crash the process with an unhandled EPIPE stack trace.
 * Exit quietly instead.
 */
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
}

/**
 * Unscript CLI entry point.
 *
 * Step 1 scope: argument handling, version/help, local environment
 * checks (`doctor`), and the interactive shell. Nothing connects to
 * Sanity, MCP, Gemini, or a transformation engine — those are future
 * modules and must not be implied here.
 */

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  // Load .env (if any) first, so configuration is available even for
  // usage errors that are raised while parsing arguments.
  const envFile = loadEnvFile();
  const { config } = loadConfig(process.env);

  const parseResult = parseArgs(argv);
  if ('error' in parseResult) {
    throw new UsageError(parseResult.error, {
      hint: "Run 'unscript --help' for usage.",
    });
  }
  const args = parseResult.parsed;

  const debug = args.debug || config.debug;

  if (envFile.error && debug) {
    printError(new UsageError(`Could not read .env file: ${envFile.error}`), true);
  }

  switch (args.command) {
    case 'help':
      return await runHelp();
    case 'version':
      return await runVersion();
    case 'doctor':
      return await runDoctor(debug);
    case 'shell':
      return await runShell(debug);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const { config } = loadConfig(process.env);
    const debugRequested = process.argv.includes('--debug') || config.debug;
    printError(error, debugRequested);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
