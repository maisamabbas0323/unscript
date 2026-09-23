import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import type { ConfigProblem, UnscriptConfig } from '../types/config.js';

/**
 * Configuration layer for the foundation.
 *
 * Step 1 only needs local settings (debug mode). Future steps will add
 * Gemini, Sanity, and MCP configuration here — nothing external is
 * read or validated yet. Environment variables are never logged and
 * never included in error messages.
 */

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export interface LoadedConfig {
  config: UnscriptConfig;
  problems: ConfigProblem[];
}

/** Where a `.env` file was found, or the problem preventing it loading. */
export interface EnvFileStatus {
  found: boolean;
  filename?: string;
  error?: string;
}

/** Load `./.env` from the working directory if present. Never overrides real env. */
export function loadEnvFile(): EnvFileStatus {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) {
    return { found: false };
  }
  const result = loadDotEnv({ path });
  if (result.error) {
    return { found: true, filename: '.env', error: result.error.message };
  }
  return { found: true, filename: '.env' };
}

/**
 * Parse and validate an environment. Returns a typed config plus any
 * problems; invalid values fall back to defaults and are reported
 * rather than crashing. External-service credentials are out of scope
 * for Step 1 and are deliberately not read here.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoadedConfig {
  const problems: ConfigProblem[] = [];

  let debug = false;
  const raw = env.UNSCRIPT_DEBUG;
  if (raw !== undefined && raw !== '') {
    const parsed = parseBool(raw);
    if (parsed === null) {
      problems.push({
        key: 'UNSCRIPT_DEBUG',
        severity: 'warn',
        message: 'Not a recognized boolean (expected true/false/1/0); using the default "false".',
      });
    } else {
      debug = parsed;
    }
  }

  return { config: { debug }, problems };
}

/** Parse a boolean-ish string, or return null when unrecognized. */
export function parseBool(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}
