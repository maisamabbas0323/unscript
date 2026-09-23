import { colors, type StreamLike } from '../../utils/colors.js';

/**
 * Unscript's visual identity — a restrained semantic palette.
 *
 * Every color has a purpose; nothing is colored for decoration alone.
 * All helpers inherit the base color policy (auto-off when output is
 * not a TTY or when NO_COLOR is set).
 */

export interface Theme {
  /** Brand identity — headings, the wordmark. */
  brand(text: string): string;
  /** Interactive focus / selection accent. */
  accent(text: string): string;
  /** Secondary information. */
  muted(text: string): string;
  /** Emphasis without color (bold). */
  bright(text: string): string;
  /** Completed / healthy state. */
  success(text: string): string;
  /** Attention required. */
  warning(text: string): string;
  /** Action required. */
  error(text: string): string;
  /** Informational detail. */
  info(text: string): string;
}

export function makeTheme(stream: StreamLike = process.stdout): Theme {
  return {
    brand: (text) => colors.cyan(colors.bold(text, stream), stream),
    accent: (text) => colors.magenta(text, stream),
    muted: (text) => colors.gray(text, stream),
    bright: (text) => colors.bold(text, stream),
    success: (text) => colors.green(text, stream),
    warning: (text) => colors.yellow(text, stream),
    error: (text) => colors.red(text, stream),
    info: (text) => colors.cyan(text, stream),
  };
}

export const theme = makeTheme();

/** Typographic symbols used across the UI (symbols, not emoji). */
export const sym = {
  /** Menu selection pointer. */
  pointer: '›',
  /** Pass state. */
  check: '✓',
  /** Warn state. */
  warn: '!',
  /** Fail state. */
  fail: '✗',
  /** Divider / rule character. */
  rule: '─',
  /** Inline separator. */
  dot: '·',
} as const;
