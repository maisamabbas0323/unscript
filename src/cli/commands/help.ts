import { blank, dim, line, prose, section } from '../../core/output.js';
import { readPackageJson } from '../../utils/package-info.js';

/**
 * `unscript --help` — a carefully designed help screen.
 * Unfinished integrations (Sanity, MCP, Gemini, transformation) are
 * intentionally not mentioned here.
 */
export async function runHelp(): Promise<number> {
  blank();
  line('unscript — a terminal writing transformation agent');
  blank();
  prose(
    'The foundation is ready: commands, environment checks, configuration, and an ' +
      'interactive shell. Text transformation, Sanity, and model integration come ' +
      'in later steps — nothing is wired up yet.',
  );
  section('Usage');
  line('  unscript [command] [options]');
  section('Commands');
  line('  unscript                 Start the interactive shell');
  line('  unscript doctor          Check your local environment (Node, npm, config)');
  line('  unscript --version, -v   Print the installed version');
  line('  unscript --help, -h      Show this help');
  section('Options');
  line('  --debug                  Show full error details and stack traces');
  section('Environment');
  line('  NO_COLOR                 Disable colored output');
  line('  UNSCRIPT_DEBUG           Enable debug output (same as --debug)');
  blank();
  dim('Run `unscript doctor` first if anything looks wrong.');
  blank();
  return 0;
}
