import { EXIT_ERROR, UnscriptError } from '../core/errors.js';

/** The transformation pipeline failed (Malformed model output, missing knowledge). */
export class TransformationError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'TransformationError';
  }
}

/** Deterministic preservation checks failed. */
export class PreservationValidationError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'PreservationValidationError';
  }
}
