/**
 * Tiny, strict argument parser for the foundation CLI.
 *
 * Commands today: `doctor` plus the interactive shell (default).
 * Global flags: --help/-h, --version/-v, --debug.
 */

export type CommandId = 'help' | 'version' | 'doctor' | 'shell';

export interface ParsedArgs {
  command: CommandId;
  debug: boolean;
}

export type ParseResult = { parsed: ParsedArgs } | { error: string };

const HELP_FLAGS = new Set(['-h', '--help']);
const VERSION_FLAGS = new Set(['-v', '--version']);
const DEBUG_FLAGS = new Set(['--debug']);
const COMMANDS = new Set(['doctor']);

export function parseArgs(argv: string[]): ParseResult {
  let debug = false;
  let help = false;
  let version = false;
  const positionals: string[] = [];

  for (const arg of argv) {
    if (HELP_FLAGS.has(arg)) {
      help = true;
    } else if (VERSION_FLAGS.has(arg)) {
      version = true;
    } else if (DEBUG_FLAGS.has(arg)) {
      debug = true;
    } else if (arg.startsWith('-')) {
      return { error: `Unknown option '${arg}'.` };
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    return { error: `Unexpected argument '${positionals[1]}'.` };
  }

  if (help) return { parsed: { command: 'help', debug } };
  if (version) return { parsed: { command: 'version', debug } };

  const command = positionals[0];
  if (command === undefined || command === '') {
    return { parsed: { command: 'shell', debug } };
  }
  if (COMMANDS.has(command)) {
    return { parsed: { command: 'doctor', debug } };
  }
  return { error: `Unknown command '${command}'.` };
}
