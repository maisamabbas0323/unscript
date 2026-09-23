import { colors } from '../../utils/colors.js';
import { centerLine, terminalWidth } from '../../utils/text.js';
import { theme, sym } from './theme.js';

/**
 * Unscript's terminal identity.
 *
 * The wordmark is a hand-set block-letter "UNSCRIPT" that scrolls through
 * a letter-by-letter color cycle. A compact treatment replaces it on
 * narrow terminals so nothing overflows.
 */

const WORD = 'UNSCRIPT';
const LETTER_HEIGHT = 6;

/** Cycle used for the wordmark letters (cyan → blue → magenta → red → yellow → green). */
const WORD_COLORS: Array<(text: string) => string> = [
  colors.cyan,
  colors.blue,
  colors.magenta,
  colors.red,
  colors.yellow,
  colors.green,
];

/** Hand-set 6x6 block letters (rows are exactly 6 columns each). */
const LETTERS: Record<string, string[]> = {
  U: ['█    █', '█    █', '█    █', '█    █', '█    █', ' ████ '],
  N: ['█    █', '██   █', '█ █  █', '█  █ █', '█   ██', '█    █'],
  S: [' ████ ', '█     ', '█     ', ' ████ ', '     █', ' ████ '],
  C: [' ████ ', '█     ', '█     ', '█     ', '█     ', ' ████ '],
  R: ['█████ ', '█    █', '█    █', '█████ ', '█ █   ', '█  █  '],
  I: ['██████', '  ██  ', '  ██  ', '  ██  ', '  ██  ', '██████'],
  P: ['█████ ', '█    █', '█    █', '█████ ', '█     ', '█     '],
  T: ['██████', '  ██  ', '  ██  ', '  ██  ', '  ██  ', '  ██  '],
};

/** Width of the full 6-row wordmark, one space between letters. */
function fullWordmarkWidth(): number {
  return WORD.length * 6 + (WORD.length - 1);
}

/** Wordmark rows, each letter painted in its own color from the cycle. */
function buildRows(): string[] {
  const rows: string[] = new Array<string>(LETTER_HEIGHT).fill('');
  let letter = 0;
  for (const char of WORD) {
    const glyph = LETTERS[char]!;
    const paint = WORD_COLORS[letter % WORD_COLORS.length]!;
    for (let i = 0; i < LETTER_HEIGHT; i++) {
      rows[i] = `${rows[i]}${rows[i] === '' ? '' : ' '}${paint(glyph[i]!)}`;
    }
    letter += 1;
  }
  return rows;
}

/** Colored wordmark lines sized for the terminal; compact fallback on narrow widths. */
export function wordmarkLines(width: number = terminalWidth()): string[] {
  if (width < fullWordmarkWidth()) {
    return [theme.brand(WORD)];
  }
  return buildRows();
}

/** One-line tagline: "writing, reworked." with a single accent pop. */
export function tagline(width: number = terminalWidth()): string {
  const line = `${theme.bright('writing, ')}${theme.accent('reworked.')}`;
  return centerLine(line, width);
}

/** A dim rule that spans (and adapts to) the terminal width. */
export function rule(width: number = terminalWidth()): string {
  return theme.muted(sym.rule.repeat(Math.max(8, Math.min(width, 80))));
}

/** Page header such as "UNSCRIPT / DOCTOR", with a rule under it. */
export function pageHeader(title: string, width: number = terminalWidth()): string[] {
  const head = `${theme.brand('UNSCRIPT')}${theme.muted(' / ')}${theme.bright(title.toUpperCase())}`;
  return [head, rule(width)];
}

export interface IntroOptions {
  /** Blank lines to leave above the wordmark (top margin). */
  top?: number;
  /** Columns to indent the wordmark and tagline from the left edge. */
  left?: number;
}

/**
 * The home-screen identity block: colorful wordmark, tagline, and rule.
 * Anchored top-left with optional margins, so it pins to the top-left
 * corner of the cleared screen instead of floating centered.
 */
export function introBlock(width: number = terminalWidth(), opts: IntroOptions = {}): string[] {
  const { top = 0, left = 0 } = opts;
  const pad = (line: string): string => `${' '.repeat(left)}${line}`;
  const lines: string[] = [];
  for (let i = 0; i < top; i++) lines.push('');
  lines.push(...wordmarkLines(width).map(pad));
  lines.push('');
  lines.push(pad(tagline(width)));
  lines.push(rule(width));
  return lines;
}
