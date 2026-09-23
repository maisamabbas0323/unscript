import { colors } from '../utils/colors.js';
import { wrap } from '../utils/text.js';

/**
 * Small, consistent presentation helpers for stdout.
 * Success/warning/error states have a fixed shape so the CLI reads
 * the same everywhere. Decorative output is avoided on purpose.
 */

export function line(text = ''): void {
  process.stdout.write(`${text}\n`);
}

export function blank(): void {
  process.stdout.write('\n');
}

export function section(title: string): void {
  blank();
  line(colors.bold(title));
}

/** Wrap and print a paragraph of prose. */
export function prose(text: string): void {
  line(wrap(text));
}

export function dim(text: string): void {
  line(colors.dim(text));
}

export function success(text: string): void {
  line(`${colors.green('✓')} ${text}`);
}

export function warning(text: string): void {
  line(`${colors.yellow('!')} ${text}`);
}

export function failure(text: string): void {
  line(`${colors.red('✗')} ${text}`);
}
