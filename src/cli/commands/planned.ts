import { theme } from '../ui/theme.js';
import { pageHeader } from '../ui/banner.js';
import { EXIT_ERROR } from '../../core/errors.js';

/**
 * Forward-declared command (`unscript file`) is recognized so the CLI
 * surface stays stable, but it is not implemented.
 * Report that honestly and exit non-zero.
 */
export async function runPlanned(word: string): Promise<number> {
  const lines = ['', ...pageHeader(`${word} — later step`)];
  lines.push('', theme.bright(`${word}: planned, not implemented yet.`));
  lines.push(
    theme.muted(
      'This command arrives in a later step. Run `unscript` to open the home screen, ' +
        '`unscript humanize` to transform text, or `unscript help` to see what is available today.',
    ),
    '',
  );
  for (const line of lines) process.stdout.write(`${line}\n`);
  return EXIT_ERROR;
}
