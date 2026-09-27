import { theme } from '../ui/theme.js';
import { pageHeader } from '../ui/banner.js';
import { terminalWidth } from '../../utils/text.js';
import { wrap } from '../../utils/text.js';

/**
 * `unscript help` (or `unscript --help`) — grouped, human help screen.
 *
 * The runtime connects to real services (Sanity Context MCP, Gemini);
 * help stays factual about what is implemented and what requires
 * configuration.
 */

function printLines(lines: string[]): void {
  for (const line of lines) process.stdout.write(`${line}\n`);
}

/** Render one group: bright title, then "left  * right*" rows. */
function group(title: string, rows: Array<[string, string]>): string[] {
  const out: string[] = ['', theme.bright(title)];
  for (const [left, right] of rows) {
    out.push(`  ${left}  ${right}`);
  }
  return out;
}

export async function runHelp(): Promise<number> {
  const width = Math.max(40, Math.min(terminalWidth(), 100));

  const lines: string[] = [];
  lines.push('');
  lines.push(...pageHeader('Help', width));

  lines.push(
    ...group('GETTING STARTED', [
      ['unscript', 'Open the Unscript home screen'],
      ['unscript humanize', 'Transform text (interactive flow)'],
      ['unscript knowledge', 'Inspect retrieved Sanity knowledge'],
      ['unscript config', 'Show local config status (no network)'],
      ['unscript doctor', 'Check your environment'],
      ['unscript help', 'Show this help'],
      ['unscript version', 'Show the installed version'],
    ]),
  );

  lines.push(
    ...group('HOME SCREEN', [
      ['↑  ↓', 'Move between choices'],
      ['Enter', 'Select a choice'],
      ['Esc', 'Exit the home screen'],
      ['Ctrl+C', 'Interrupt and exit'],
    ]),
  );

  lines.push(
    ...group('ENVIRONMENT', [
      ['NO_COLOR', 'Disable terminal colors'],
      ['UNSCRIPT_DEBUG', 'Enable debug details (true/false/1/0)'],
      ['SANITY_CONTEXT_MCP_URL', 'Hosted Context MCP endpoint URL'],
      ['SANITY_ORGANIZATION_TOKEN', 'Organization API token (Context Viewer)'],
      ['GEMINI_API_KEY', 'Google AI Studio API key'],
      ['-h, -v, --debug', 'Flag aliases still work'],
    ]),
  );

  lines.push(
    ...group('DIAGNOSTICS', [
      ['unscript doctor', 'Checks Node.js, npm, configuration, services'],
      ['--debug', 'Show stack traces and full error details'],
    ]),
  );

  lines.push('');
  lines.push(
    theme.muted(
      wrap(
        'The runtime transforms text with Gemini using writing rules retrieved from Sanity ' +
          'through a hosted Context MCP. Copy `.env.example` to `.env` and set the three runtime ' +
          'variables; `unscript doctor` reports exactly what is configured.',
        width,
      ),
    ),
  );
  lines.push('');

  printLines(lines);
  return 0;
}
