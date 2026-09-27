#!/usr/bin/env node

import { parseArgs } from './args.js';
import { printError, UsageError } from '../core/errors.js';
import { loadConfig, loadEnvFile } from '../config/index.js';
import { runHelp } from './commands/help.js';
import { runVersionPage, runVersionShort } from './commands/version.js';
import { runDoctor } from './commands/doctor.js';
import { runLanding } from './commands/landing.js';
import { runPlanned } from './commands/planned.js';
import { runConfig } from './commands/config.js';
import { runTransform, runKnowledge } from './commands/transform.js';

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
 * The primary UX is the interactive home screen (`unscript`). Readable
 * subcommands `humanize` (interactive transformation), `knowledge`
 * (knowledge inspection), `doctor`, `help`, and `version` cover the real
 * runtime. The runtime talks to Sanity through a hosted Context MCP and
 * to Gemini for language transformation; when either is unconfigured,
 * those commands fail honestly with setup instructions.
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
      hint: "Run 'unscript help' for usage.",
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
      return args.viaFlag ? await runVersionShort() : await runVersionPage();
    case 'doctor':
      return await runDoctor(debug);
    case 'transform':
      return await runTransform(debug);
    case 'knowledge':
      return await runKnowledge(debug);
    case 'config':
      return await runConfig(debug);
    case 'landing':
      return await runLanding(debug);
    case 'planned':
      return await runPlanned(args.word ?? 'command');
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
