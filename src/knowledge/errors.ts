import { EXIT_ERROR, UnscriptError } from '../core/errors.js';

/** Knowledge could not be retrieved or normalized from the dataset. */
export class KnowledgeRetrievalError extends UnscriptError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: EXIT_ERROR });
    this.name = 'KnowledgeRetrievalError';
  }
}
