/**
 * Shared types for the Unscript foundation.
 *
 * Future steps (agent, MCP, Sanity, Gemini, transformation, validation)
 * will extend these types. Nothing in this file references external
 * services because none are implemented yet.
 */

/** A single local environment check result, e.g. from `unscript doctor`. */
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  /** Short human label, e.g. "Node.js". */
  name: string;
  /** Human-readable detail shown after the label. */
  detail: string;
  status: CheckStatus;
  /** Optional actionable hint, shown dimmed on the next line. */
  hint?: string;
}

/** Configuration needed by the foundation. */
export interface UnscriptConfig {
  /** True when verbose error details and stack traces are wanted. */
  debug: boolean;
}

/** A configuration problem discovered while loading. */
export interface ConfigProblem {
  key: string;
  severity: 'warn' | 'fail';
  message: string;
}
