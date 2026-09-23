import { createInterface } from 'node:readline';
import { blank, dim, line, prose, warning } from '../../core/output.js';
import { OperationalError, EXIT_OK, EXIT_INTERRUPTED } from '../../core/errors.js';
import { runVersion } from './version.js';
import { runDoctor } from './doctor.js';
import { runHelp } from './help.js';
import { readPackageJson } from '../../utils/package-info.js';

/**
 * `unscript` — the interactive shell.
 *
 * A deliberately small shell: help, version, doctor, exit, plus clear
 * handling of unknown input. The foundation is real; transformation,
 * Sanity, and model integration are not, so the shell says so instead
 * of pretending.
 */

const PROMPT = 'unscript> ';

function intro(): void {
  blank();
  line('Unscript — a terminal writing transformation agent');
  blank();
  prose(
    'The Step 1 foundation is ready: commands, environment checks, configuration, ' +
      'and this shell all work. Text transformation, Sanity, and model integration ' +
      'are planned for later steps — nothing is wired up yet.',
  );
  blank();
  dim('Try:');
  dim('  help       show available commands');
  dim('  doctor     check your local environment');
  dim('  version    print the installed version');
  dim('  exit       leave the shell (or press Ctrl+C)');
  blank();
}

export function runShell(debug: boolean): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new OperationalError('the interactive shell needs a terminal', {
      hint: 'Run `unscript doctor`, `unscript --help`, or pipe a command instead.',
    });
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
  });
  let finished = false;

  const finish = (code: number): void => {
    if (finished) return;
    finished = true;
    process.exitCode = code;
    rl.close();
  };

  rl.on('SIGINT', () => {
    process.stdout.write('\n');
    dim('Interrupted.');
    finish(EXIT_INTERRUPTED);
  });

  rl.on('line', async (raw) => {
    const input = raw.trim();
    if (input === '') {
      rl.prompt();
      return;
    }
    switch (input) {
      case 'help':
        await runHelp();
        break;
      case 'version':
        await runVersion();
        break;
      case 'doctor':
        await runDoctor(debug);
        break;
      case 'exit':
      case 'quit':
        dim('Bye.');
        finish(EXIT_OK);
        return;
      default:
        warning(`Unknown command '${input}'.`);
        dim('Type "help" to see available commands.');
        break;
    }
    rl.prompt();
  });

  return new Promise<number>((resolve) => {
    rl.on('close', () => {
      if (!finished) {
        const version = readPackageJson().version;
        dim(`Goodbye. unscript v${version}`);
      }
      resolve(typeof process.exitCode === 'number' ? process.exitCode : EXIT_OK);
    });
    intro();
    rl.prompt();
  });
}
