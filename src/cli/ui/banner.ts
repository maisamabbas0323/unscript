import { colors } from '../../utils/colors.js';
import { centerLine, terminalWidth } from '../../utils/text.js';
import { theme, sym } from './theme.js';

/**
 * Unscript's terminal identity.
 *
 * The home screen carries a hand-set "UNSCRIPT" logo — a shadow-style
 * block face in red ink with white highlights (10 rows, 76 columns),
 * auto-disabled with NO_COLOR. `wordmarkLines` keeps the earlier
 * rainbow block wordmark as a fallback on narrow terminals.
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

/*
 * The Unscript logo — a hand-set "UNSCRIPT" in a shadow-style block face
 * (red ink with white highlights and dim fill), 10 rows and 76 columns.
 * Each row is a list of [role, text] runs; roles map to themed paints
 * below so the whole mark respects NO_COLOR and non-TTY output.
 */

type LogoRole = 'ink' | 'light' | 'dim' | 'block';

const LOGO_ROWS: Array<Array<[LogoRole, string]>> = [
  [
    ['ink', ' █ '],
    ['light', '   '],
    ['ink', '██'],
    ['dim', '  '],
    ['light', ' '],
    ['ink', '█'],
    ['block', '▄ '],
    ['ink', '▄'],
    ['dim', '       '],
    ['light', '  '],
    ['block', ' ▄▄'],
    ['ink', '██'],
    ['dim', '   '],
    ['light', ' '],
    ['ink', '▄█'],
    ['block', '▄  '],
    ['ink', '▄'],
    ['dim', '   '],
    ['light', ' '],
    ['ink', '██'],
    ['light', ' '],
    ['ink', '███'],
    ['dim', '   '],
    ['light', ' '],
    ['ink', '██▓'],
    ['dim', ' '],
    ['light', ' '],
    ['ink', '██▒███'],
    ['dim', '   '],
    ['ink', '▄▄▄█'],
    ['block', '▄'],
    ['ink', '███▓'],
  ],
  [
    ['light', ' '],
    ['ink', '██'],
    ['light', '  '],
    ['ink', '▓'],
    ['block', '▀'],
    ['ink', '█▒'],
    ['dim', ' '],
    ['light', ' '],
    ['block', '█'],
    ['ink', '█'],
    ['light', ' '],
    ['ink', '▀█ '],
    ['light', ' '],
    ['ink', ' █'],
    ['dim', '  '],
    ['ink', '▒'],
    ['block', ' ▀'],
    ['light', '   '],
    ['ink', '▒'],
    ['dim', '   '],
    ['ink', '▓'],
    ['block', ' █'],
    ['ink', '▀'],
    ['light', ' '],
    ['ink', '▀█'],
    ['dim', '   '],
    ['ink', '▓'],
    ['block', '█'],
    ['ink', '█'],
    ['light', ' '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '██▓'],
    ['dim', ' '],
    ['ink', '▓'],
    ['block', '▐'],
    ['ink', '█▒'],
    ['dim', ' '],
    ['ink', '▓'],
    ['block', '█'],
    ['ink', '█░'],
    ['light', ' '],
    ['ink', ' ██▓'],
    ['dim', ' '],
    ['ink', '▓'],
    ['light', '  '],
    ['block', '█'],
    ['ink', '█▒'],
    ['light', ' '],
    ['ink', '▓▒'],
  ],
  [
    ['ink', '▓██'],
    ['light', '  '],
    ['ink', '▒'],
    ['block', '█'],
    ['ink', '█░'],
    ['dim', ' '],
    ['ink', '▓'],
    ['block', '█'],
    ['ink', '█'],
    ['light', '  '],
    ['ink', '▀█'],
    ['light', ' '],
    ['ink', '██▒'],
    ['dim', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '▓██▄'],
    ['dim', '    '],
    ['ink', '▒▓█'],
    ['light', '   '],
    ['ink', ' ▄'],
    ['dim', '  '],
    ['ink', '▓'],
    ['block', '█'],
    ['ink', '█'],
    ['light', ' '],
    ['ink', '░▄█'],
    ['light', ' '],
    ['ink', '▒'],
    ['dim', ' '],
    ['ink', '▒'],
    ['block', ' '],
    ['ink', '█▒'],
    ['dim', ' '],
    ['ink', '▓'],
    ['block', '█'],
    ['ink', '█░ ██▓▒'],
    ['dim', ' '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '▓'],
    ['block', '█'],
    ['ink', '█░'],
    ['light', ' '],
    ['ink', '▒░'],
  ],
  [
    ['ink', '▓▓█'],
    ['light', '  '],
    ['ink', '░'],
    ['block', '█'],
    ['ink', '█░'],
    ['dim', ' '],
    ['ink', '▓██▒'],
    ['light', '  '],
    ['ink', '▐ ██▒'],
    ['dim', ' '],
    ['light', '  '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '  '],
    ['block', '▄'],
    ['ink', '█▓'],
    ['dim', ' '],
    ['ink', '▒▒▒▄'],
    ['light', ' '],
    ['ink', '▄'],
    ['block', '  '],
    ['ink', '▒'],
    ['dim', ' '],
    ['ink', '▒'],
    ['block', '▄'],
    ['ink', '█▀▀█▄'],
    ['dim', '   '],
    ['ink', '░'],
    ['block', '▐ '],
    ['ink', '░'],
    ['dim', ' '],
    ['ink', '▒'],
    ['block', '▄ '],
    ['ink', '▄█▒▓'],
    ['light', ' '],
    ['ink', '▒'],
    ['dim', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '▓'],
    ['block', '▄'],
    ['ink', '█▓'],
    ['light', ' '],
    ['ink', '░'],
  ],
  [
    ['ink', '▒▒███'],
    ['block', '▄▀'],
    ['ink', '▓'],
    ['dim', '  '],
    ['ink', '▒██░'],
    ['light', '   '],
    ['ink', '▓██░'],
    ['dim', ' '],
    ['ink', '▓███'],
    ['block', '▄▄▀'],
    ['ink', '▒▒'],
    ['dim', ' '],
    ['ink', '▒ ▒'],
    ['block', '   '],
    ['ink', '▀'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', ' '],
    ['ink', '░██▓'],
    ['light', ' '],
    ['ink', '▒██▒'],
    ['dim', ' '],
    ['ink', '░'],
    ['block', '▐'],
    ['ink', '█░'],
    ['dim', ' '],
    ['ink', '▒██▒'],
    ['light', ' '],
    ['ink', '░'],
    ['light', '  '],
    ['ink', '░'],
    ['dim', ' '],
    ['light', '  '],
    ['ink', '▒██▒'],
    ['light', ' '],
    ['ink', '░'],
  ],
  [
    ['ink', '░▒▓▒'],
    ['light', ' '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '▒'],
    ['dim', '  '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '▒░'],
    ['light', '   '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '▓'],
    ['dim', '  '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '▒▓▒'],
    ['light', ' '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░▒'],
    ['light', ' '],
    ['ink', '▓'],
    ['light', '  '],
    ['ink', '░'],
    ['dim', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '▒▓'],
    ['light', ' '],
    ['ink', '░▒▓░'],
    ['dim', ' '],
    ['ink', '░▓'],
    ['dim', '   '],
    ['ink', '▒▓▒░'],
    ['light', ' '],
    ['ink', '░'],
    ['light', '  '],
    ['ink', '░'],
    ['dim', ' '],
    ['light', '  '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '░░'],
  ],
  [
    ['ink', '░░▒░'],
    ['light', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', '  '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░░'],
    ['light', '   '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '▒░'],
    ['dim', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░▒'],
    ['light', '  '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', ' '],
    ['light', ' '],
    ['ink', '░'],
    ['light', '  '],
    ['ink', '▒'],
    ['dim', '    '],
    ['light', '  '],
    ['ink', '░▒'],
    ['light', ' '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '▒░'],
    ['dim', ' '],
    ['light', ' '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', ' '],
    ['ink', '░▒'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', '      '],
    ['light', '    '],
    ['ink', '░'],
  ],
  [
    ['light', ' '],
    ['ink', '░░░'],
    ['light', ' '],
    ['ink', '░░'],
    ['dim', '  '],
    ['light', '   '],
    ['ink', '░'],
    ['light', '   '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', '  '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', ' ░'],
    ['light', '  '],
    ['ink', '░'],
    ['dim', '   '],
    ['ink', '░'],
    ['dim', '         '],
    ['light', '  '],
    ['ink', '░░'],
    ['light', '   '],
    ['ink', '░'],
    ['dim', '  '],
    ['light', ' '],
    ['ink', '▒'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', ' '],
    ['ink', '░░'],
    ['dim', '        '],
    ['light', '  '],
    ['ink', '░'],
  ],
  [
    ['light', '   '],
    ['ink', '░'],
    ['dim', '      '],
    ['light', '         '],
    ['ink', '░'],
    ['dim', '  '],
    ['light', '      '],
    ['ink', '░'],
    ['dim', '   '],
    ['ink', '░'],
    ['light', ' '],
    ['ink', '░'],
    ['dim', '       '],
    ['light', '   '],
    ['ink', '░'],
    ['dim', '      '],
    ['light', ' '],
    ['ink', '░'],
  ],
  [
    ['dim', '                                '],
    ['ink', '░'],
  ],
];

/** Width of the widest logo row. */
const LOGO_WIDTH = LOGO_ROWS.reduce(
  (max, runs) =>
    Math.max(
      max,
      runs.reduce((w, [, t]) => w + t.length, 0),
    ),
  0,
);

/** Role → themed paint. `block` is white ink on red, matching the design. */
const LOGO_PAINT: Record<LogoRole, (text: string) => string> = {
  ink: (text) => colors.red(text),
  light: (text) => colors.white(text),
  dim: (text) => colors.gray(text),
  block: (text) => colors.bgRed(colors.white(text)),
};

/** The 10-row logo, painted; falls back to the block wordmark on narrow widths. */
export function logoLines(width: number = terminalWidth()): string[] {
  if (width < LOGO_WIDTH) return wordmarkLines(width);
  return LOGO_ROWS.map((runs) => runs.map(([role, text]) => LOGO_PAINT[role](text)).join(''));
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

/** Interactive-screen chrome: sentence-case title under the brand + rule. */
export function screenHeader(title: string, width: number = terminalWidth()): string[] {
  const head = `${theme.brand('UNSCRIPT')}${theme.muted(' / ')}${theme.bright(title)}`;
  return [head, rule(width)];
}

export interface IntroOptions {
  /** Blank lines to leave above the wordmark (top margin). */
  top?: number;
  /** Columns to indent the wordmark and tagline from the left edge. */
  left?: number;
}

/**
 * The home-screen identity block: the logo, tagline, and rule.
 * Anchored top-left with optional margins, so it pins to the top-left
 * corner of the cleared screen instead of floating centered.
 */
export function introBlock(width: number = terminalWidth(), opts: IntroOptions = {}): string[] {
  const { top = 0, left = 0 } = opts;
  const pad = (line: string): string => `${' '.repeat(left)}${line}`;
  const lines: string[] = [];
  for (let i = 0; i < top; i++) lines.push('');
  lines.push(...logoLines(width).map(pad));
  lines.push('');
  lines.push(pad(tagline(width)));
  lines.push(rule(width));
  return lines;
}
