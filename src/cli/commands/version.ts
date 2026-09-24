import { theme } from '../ui/theme.js';
import { pageHeader } from '../ui/banner.js';
import { readPackageJson } from '../../utils/package-info.js';

/**
 * Version display, read from package.json so it never drifts.
 *
 * Two presentations:
 *  - `unscript version` — a polished page (human-facing).
 *  - `unscript --version` / `-v` — the bare version, machine-friendly
 *    for scripts.
 */

async function printPage(): Promise<number> {
  const { version } = readPackageJson();
  const lines = ['', ...pageHeader('Version'), '', `Version ${theme.bright(version)}`, ''];
  for (const line of lines) process.stdout.write(`${line}\n`);
  process.stdout.write(`${theme.muted('Runtime release — knowledge + transformation build.')}\n`);
  process.stdout.write('\n');
  return 0;
}

/** `unscript version` */
export async function runVersionPage(): Promise<number> {
  return printPage();
}

/** `unscript --version` — bare version for scripts and tooling. */
export async function runVersionShort(): Promise<number> {
  const { version } = readPackageJson();
  process.stdout.write(`${version}\n`);
  return 0;
}
