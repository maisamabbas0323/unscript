import { theme } from '../ui/theme.js';
import { introBlock } from '../ui/banner.js';
import { frameWidth } from '../ui/terminal.js';
import { promptSelect, promptAnyKey, type Choice } from '../ui/menu.js';
import { OperationalError, EXIT_OK, EXIT_INTERRUPTED } from '../../core/errors.js';
import { readPackageJson } from '../../utils/package-info.js';
import { runHelp } from './help.js';
import { runVersionPage } from './version.js';
import { runDoctor } from './doctor.js';

/**
 * `unscript` — the interactive home screen.
 *
 * A polished landing: wordmark, tagline, current version, a truthful
 * status, and a keyboard-navigated menu. Text transformation is listed
 * as a later step and never as working functionality.
 */

type LandingChoice = 'humanize' | 'doctor' | 'help' | 'version' | 'exit';

const CHOICES: Choice<LandingChoice>[] = [
  { id: 'humanize', label: 'Humanize text', note: 'later step' },
  { id: 'doctor', label: 'Inspect environment' },
  { id: 'help', label: 'Help' },
  { id: 'version', label: 'Version' },
  { id: 'exit', label: 'Exit' },
];

/** Static frame above the menu: logo, tagline, version, status. */
function landingHeader(): string[] {
  const width = frameWidth();
  const { version } = readPackageJson();
  return [
    ...introBlock(width),
    '',
    `${theme.success('Foundation ready')}${theme.muted(` · v${version} · foundation`)}`,
    '',
    theme.bright('What would you like to do?'),
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
    const result = await promptSelect(landingHeader, CHOICES);

    if (result.kind === 'exit') {
      if (result.interrupted) {
        process.stdout.write('\n');
        return EXIT_INTERRUPTED;
      }
      process.stdout.write('\n');
      process.stdout.write(`${theme.muted('Bye.')}\n`);
      return EXIT_OK;
    }

    switch (result.id) {
      case 'humanize':
        humanizePage();
        await promptAnyKey();
        break;
      case 'doctor':
        await runDoctor(_debug);
        await promptAnyKey();
        break;
      case 'help':
        await runHelp();
        await promptAnyKey();
        break;
      case 'version':
        await runVersionPage();
        await promptAnyKey();
        break;
      case 'exit':
        process.stdout.write('\n');
        process.stdout.write(`${theme.muted('Bye.')}\n`);
        return EXIT_OK;
    }
  }
}
