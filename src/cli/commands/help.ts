import { theme } from '../ui/theme.js';
import { pageHeader } from '../ui/banner.js';
import { terminalWidth } from '../../utils/text.js';
import { wrap } from '../../utils/text.js';

/**
 * `unscript help` (or `unscript --help`) — grouped, human help screen.
 * Unfinished integrations (Sanity, MCP, Gemini, transformation) are
 * mentioned only as "later steps", never as working features.
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
      ['unscript help', 'Show this help'],
      ['unscript doctor', 'Check your environment'],
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
      ['-h, -v, --debug', 'Flag aliases still work'],
    ]),
  );

  lines.push(
    ...group('DIAGNOSTICS', [
      ['unscript doctor', 'Checks Node.js, npm, configuration, terminal'],
      ['--debug', 'Show stack traces and full error details'],
    ]),
  );

  lines.push('');
  lines.push(
    theme.muted(
      wrap(
        'Step 1 foundation: commands, environment checks, and the interactive UI work. ' +
          'Text transformation, Sanity, and model integration arrive in later steps.',
        width,
      ),
    ),
  );
  lines.push('');

  printLines(lines);
  return 0;
}
