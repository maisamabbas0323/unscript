import { theme } from '../ui/theme.js';
import { introBlock } from '../ui/banner.js';
import { frameWidth, clearScreen } from '../ui/terminal.js';
import { promptSelect, promptAnyKey, type Choice } from '../ui/menu.js';
import { OperationalError, EXIT_OK, EXIT_INTERRUPTED } from '../../core/errors.js';
import { readPackageJson } from '../../utils/package-info.js';
import { runHelp } from './help.js';
import { runVersionPage } from './version.js';
import { runDoctor } from './doctor.js';

/**
 * `unscript` — the interactive home screen.
 *
 * The terminal is cleared first, then the colorful wordmark is pinned to
 * the top-left corner (3-line top margin, 2-column left margin) and
 * stays put while the menu redraws around it. Selecting a category clears
 * the terminal again and shows that page on its own — the logo is never
 * duplicated below earlier content.
 */

type LandingChoice = 'humanize' | 'doctor' | 'help' | 'version' | 'exit';

const CHOICES: Choice<LandingChoice>[] = [
  { id: 'humanize', label: 'Humanize text', note: 'later step' },
  { id: 'doctor', label: 'Inspect environment' },
  { id: 'help', label: 'Help' },
  { id: 'version', label: 'Version' },
  { id: 'exit', label: 'Exit' },
];

/** Static top of the home screen: logo pinned top-left, then status, then prompt. */
function landingTop(): string[] {
  const width = frameWidth();
  const { version } = readPackageJson();
  const intro = introBlock(width, { top: 3, left: 2 });
  return [
    ...intro,
    '',
    `  ${theme.success('Foundation ready')}${theme.muted(` · v${version} · foundation`)}`,
    '',
    '  ' + theme.bright('What would you like to do?'),
  ];
}

function printPage(lines: string[]): void {
  for (const line of lines) process.stdout.write(`${line}\n`);
}

function humanizePage(): void {
  printPage([
    '',
    '',
    theme.bright('Humanize text'),
    '',
    theme.muted('Text transformation isn’t available in this build.'),
    theme.muted('It arrives in a later step, together with Sanity and model integration.'),
    '',
  ]);
}

export async function runLanding(_debug: boolean): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new OperationalError('the interactive home screen needs a terminal', {
      hint: 'Run `unscript doctor`, `unscript help`, `unscript version`, or pipe output instead.',
    });
  }

  for (;;) {
    const result = await promptSelect(landingTop, CHOICES);

    if (result.kind === 'exit') {
      clearScreen();
      if (result.interrupted) {
        process.stdout.write(`${theme.muted('Interrupted.')}\n`);
        return EXIT_INTERRUPTED;
      }
      process.stdout.write(`${theme.muted('Bye.')}\n`);
      return EXIT_OK;
    }

    clearScreen();
    switch (result.id) {
      case 'humanize':
        humanizePage();
        break;
      case 'doctor':
        await runDoctor(_debug);
        break;
      case 'help':
        await runHelp();
        break;
      case 'version':
        await runVersionPage();
        break;
      case 'exit':
        process.stdout.write(`${theme.muted('Bye.')}\n`);
        return EXIT_OK;
    }

    if ((await promptAnyKey()).interrupted) {
      clearScreen();
      process.stdout.write(`${theme.muted('Interrupted.')}\n`);
      return EXIT_INTERRUPTED;
    }
  }
}
