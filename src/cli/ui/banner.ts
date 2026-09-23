import { theme, sym } from './theme.js';
import { centerLine, terminalWidth } from '../../utils/text.js';

/**
 * Unscript's terminal identity.
 *
 * The wordmark is a hand-set block-letter "UNSCRIPT". A compact
 * treatment replaces it on narrow terminals so nothing overflows.
 */

const WORD = 'UNSCRIPT';
const LETTER_HEIGHT = 6;

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

function buildRows(): string[] {
  const rows: string[] = new Array<string>(LETTER_HEIGHT).fill('');
  for (const char of WORD) {
    const glyph = LETTERS[char]!;
    for (let i = 0; i < LETTER_HEIGHT; i++) {
      rows[i] = `${rows[i]}${rows[i] === '' ? '' : ' '}${glyph[i]}`;
    }
  }
  return rows;
}

/** Colored wordmark lines sized for the terminal; compact fallback on narrow widths. */
export function wordmarkLines(width: number = terminalWidth()): string[] {
  if (width < fullWordmarkWidth() + 4) {
    return [theme.brand(WORD)];
  }
  return buildRows().map((row) => theme.brand(row));
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

/** The logo block plus tagline, centered when the terminal has room. */
export function introBlock(width: number = terminalWidth()): string[] {
  const mark = wordmarkLines(width);
  const gap = 1;
  const line = tagline(width);
  return [...mark, '', line, rule(width)];
}
