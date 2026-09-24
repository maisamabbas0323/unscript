/**
 * Secret handling helpers.
 *
 * Secrets (organization tokens, Gemini API keys) must never appear in
 * output, logs, errors, or commits. These helpers keep values out of the
 * terminal while still letting the UI confirm that something is set.
 */

/** True when a value is a non-empty string. */
export function isConfigured(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Redact a secret for display: keep a short head and tail, mask the rest.
 * Short values are fully masked. Never pass a secret here expecting to
 * recover it.
 */
export function redactSecret(value: string): string {
  const clean = value.trim();
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

/**
 * Remove known secret strings from a message, so a surfaced error can
 * never echo a token or key that happened to be embedded in it.
 */
export function stripSecrets(message: string, secrets: Array<string | null | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (isConfigured(secret)) {
      out = out.split(secret as string).join('[redacted]');
    }
  }
  return out;
}
