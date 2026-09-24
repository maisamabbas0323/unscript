/**
 * Minimal structured debug logging.
 *
 * Normal operation stays quiet. Debug mode (UNSCRIPT_DEBUG or --debug)
 * writes `[debug]` lines to stderr. Callers are responsible for never
 * passing secrets or full user documents here.
 */

function enabled(): boolean {
  return process.argv.includes('--debug') || process.env.UNSCRIPT_DEBUG !== undefined;
}

export function debugLog(...parts: unknown[]): void {
  if (!enabled()) return;
  const formatted = parts
    .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
    .join(' ');
  process.stderr.write(`[debug] ${formatted}\n`);
}
