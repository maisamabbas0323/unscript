import { sym, theme } from './theme.js';
import { fitWidth } from './screen.js';
import type { RuntimeConfig } from '../../config/env.js';

export type StatusTone = 'ok' | 'warn';

export interface StatusChip {
  label: string;
  tone: StatusTone;
}

/**
 * Real configuration chips for the home screen — nothing invented.
 *
 * Every chip maps to a concrete runtime variable: the Context MCP
 * endpoint + org token (`SANITY_CONTEXT_MCP_URL` /
 * `SANITY_ORGANIZATION_TOKEN`) and the Gemini key (`GEMINI_API_KEY`).
 * When a credential is missing the chip is a warn and names exactly what
 * is unset, so the user has an actionable next step.
 */
export function statusChips(config: RuntimeConfig): StatusChip[] {
  const chips: StatusChip[] = [];
  chips.push(
    config.contextMcp.configured
      ? { label: 'Context MCP', tone: 'ok' }
      : { label: 'Context MCP unset', tone: 'warn' },
  );
  chips.push(
    config.gemini.configured
      ? { label: 'Gemini', tone: 'ok' }
      : { label: 'Gemini unset', tone: 'warn' },
  );
  return chips;
}

function paintChip(chip: StatusChip): string {
  return chip.tone === 'ok'
    ? `${theme.success(sym.check)} ${chip.label}`
    : `${theme.warning(sym.warn)} ${chip.label}`;
}

/** One bounded status line: chips joined by dots, version muted at the end. */
export function statusLine(config: RuntimeConfig, version: string, width: number): string {
  const body = statusChips(config)
    .map(paintChip)
    .join(` ${theme.muted(sym.dot)} `);
  const line = `${body}${theme.muted(` · v${version}`)}`;
  return fitWidth(line, width);
}
