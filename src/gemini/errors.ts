import { EXIT_ERROR, UnscriptError } from '../core/errors.js';

/** Gemini API key missing or the client is not configured. */
export class GeminiConfigurationError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'GeminiConfigurationError';
  }
}

/** The Gemini API answered with a failure (auth, rate limit, model, payload). */
export class GeminiApiError extends UnscriptError {
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly code: string | undefined;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean; hint?: string; code?: string } = {},
  ) {
    super(message, { hint: options.hint, exitCode: EXIT_ERROR });
    this.name = 'GeminiApiError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.code = options.code;
  }
}
