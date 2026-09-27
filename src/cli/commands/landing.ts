import { theme } from '../ui/theme.js';
import { introBlock } from '../ui/banner.js';
import { clearScreen } from '../ui/terminal.js';
import { realHeight, realWidth } from '../ui/screen.js';
import { promptSelect, promptAnyKey, type Choice } from '../ui/menu.js';
import { statusLine } from '../ui/status.js';
import { OperationalError, EXIT_OK, EXIT_INTERRUPTED } from '../../core/errors.js';
import { readPackageJson } from '../../utils/package-info.js';
import { loadRuntimeConfig } from '../../config/env.js';
import { runHelp } from './help.js';
import { runVersionPage } from './version.js';
import { runDoctor } from './doctor.js';
import { runTransform, runKnowledge } from './transform.js';

/**
 * `unscript` — the interactive home screen.
 *
 * The terminal is cleared first, then the identity block is pinned to the
 * top-left corner (1 blank line above, 2-column left margin) and stays
 * put while the menu redraws around it. Three height tiers: the full
 * 10-row logo at ≥ 34 rows, the 6-row block wordmark at 28–33 rows, and
 * a compact `UNSCRIPT` brand line below that. The status line under the
 * identity block is real configuration (Context MCP / Gemini), not
 * decoration. Selecting a category clears the terminal again and shows
 * that page on its own — the logo is never duplicated below earlier
 * content.
 */

type LandingChoice = 'humanize' | 'knowledge' | 'doctor' | 'help' | 'version' | 'exit';

const CHOICES: Choice<LandingChoice>[] = [
  {
    id: 'humanize',
    label: 'Humanize text',
    description:
      'Rework your writing against the Sanity knowledge base — pick a content type, tone, and humanization level, then read the result with full provenance.',
  },
  {
    id: 'knowledge',
    label: 'Inspect knowledge',
    description:
      'See the writing rules, patterns, sources, and user decisions the knowledge base holds for your content.',
  },
  {
    id: 'doctor',
    label: 'Inspect environment',
    description:
      'Run real local checks and, when credentials are configured, clearly labeled live checks of the Context MCP and Gemini.',
  },
  {
    id: 'help',
    label: 'Help',
    description: 'List commands, exit codes, and configuration steps for Unscript.',
  },
  {
    id: 'version',
    label: 'Version',
    description: 'Show the installed Unscript version and runtime details.',
  },
  { id: 'exit', label: 'Exit', description: 'Leave the interactive home screen.' },
];

/** The identity block is measured at the real terminal width (the logo is
 * 76 columns and must not be squeezed to the 60-column menu frame); the
 * logo and wordmark degrade gracefully on narrower terminals. */
function identityWidth(): number {
  const columns = process.stdout.columns;
  return Math.max(24, columns && columns > 0 ? columns : 80);
}

/**
 * Static top of the home screen. Three identity tiers by height: the
 * full pinned logo at ≥ 34 rows, the 6-row block wordmark at 28–33
 * rows, and a compact header below that — so the boxed menu below
 * always fits on screen without scrolling (which would break the
 * absolute redraw math and hide the menu). The status line is real
 * configuration state, never decoration.
 */
function landingTop(): string[] {
  const { version } = readPackageJson();
  const config = loadRuntimeConfig();
  const height = realHeight();
  const tall = height >= 34;
  const mid = !tall && height >= 28;
  const status = statusLine(config, version, realWidth());
  const intro = tall
    ? introBlock(identityWidth(), { top: 1, left: 2 })
    : mid
      ? introBlock(identityWidth(), { top: 1, left: 2, compact: true })
      : [`  ${theme.brand('UNSCRIPT')}`];
  return tall || mid
    ? [...intro, '', `  ${status}`, '', '  ' + theme.bright('What would you like to do?')]
    : [...intro, `  ${status}`, '  ' + theme.bright('What would you like to do?')];
}

export async function runLanding(debug: boolean): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new OperationalError('the interactive home screen needs a terminal', {
      hint: 'Run `unscript doctor`, `unscript help`, `unscript version`, or pipe output instead.',
    });
  }

  for (;;) {
    const result = await promptSelect(landingTop, CHOICES, { escLabel: 'exit' });

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
    let selfGated = false;
    switch (result.id) {
      case 'humanize':
        await runTransform(debug);
        selfGated = true; // result page is a scrollable, self-gating read
        break;
      case 'knowledge':
        await runKnowledge(debug);
        selfGated = true; // knowledge page is a scrollable, self-gating read
        break;
      case 'doctor':
        await runDoctor(debug);
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

    if (!selfGated && (await promptAnyKey()).interrupted) {
      clearScreen();
      process.stdout.write(`${theme.muted('Interrupted.')}\n`);
      return EXIT_INTERRUPTED;
    }
  }
}
