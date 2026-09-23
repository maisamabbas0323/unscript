/**
 * Strict argument parser for the Unscript CLI.
 *
 * The normal UX is interactive (`unscript` opens the home screen) with
 * readable subcommands: `unscript help`, `unscript doctor`,
 * `unscript version`. Conventional flags remain as aliases:
 * `-h/--help`, `-v/--version`, `--debug`.
 *
 * Future subcommands (`humanize`, `file`, `config`) are recognized as
 * planned so the surface stays stable — the feature itself is not
 * implemented.
 */

export type CommandId = 'help' | 'version' | 'doctor' | 'landing' | 'planned';

export interface ParsedArgs {
  command: CommandId;
  debug: boolean;
  /** True when the command came from a flag (`--version`) and wants machine-friendly output. */
  viaFlag: boolean;
  /** The original positional word, when the command is `planned`. */
  word?: string;
}

export type ParseResult = { parsed: ParsedArgs } | { error: string };

const HELP_FLAGS = new Set(['-h', '--help']);
const VERSION_FLAGS = new Set(['-v', '--version']);
const DEBUG_FLAGS = new Set(['--debug']);
const COMMANDS = new Set(['doctor', 'help', 'version']);
const PLANNED = new Set(['humanize', 'file', 'config']);

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

  if (help) return { parsed: { command: 'help', debug, viaFlag: true } };
  if (version) return { parsed: { command: 'version', debug, viaFlag: true } };

  const word = positionals[0];
  if (word === undefined || word === '') {
    return { parsed: { command: 'landing', debug, viaFlag: false } };
  }
  if (COMMANDS.has(word)) {
    return { parsed: { command: word as 'doctor' | 'help' | 'version', debug, viaFlag: false } };
  }
  if (PLANNED.has(word)) {
    return { parsed: { command: 'planned', debug, viaFlag: false, word } };
  }
  return { error: `Unknown command '${word}'.` };
}
