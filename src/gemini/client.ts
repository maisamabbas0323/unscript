import { GeminiApiError, GeminiConfigurationError } from './errors.js';
import {
  GEMINI_BASE_URL,
  GEMINI_MODEL,
  type GeminiGenerationConfig,
  type GeminiRequest,
  type GeminiResponse,
  type GeminiUsage,
} from './types.js';
import { debugLog } from '../utils/log.js';
import { stripSecrets } from '../utils/secrets.js';

/**
 * Real Gemini REST client (Google AI `generativelanguage` API).
 *
 * Sends `generateContent` requests to a single, configured model — no
 * silent fallback to other models, no fabricated responses. The API key
 * travels only in the `x-goog-api-key` header and is never logged or
 * echoed in errors. Transient failures (429, 5xx, network, timeout) are
 * retried a bounded number of times; auth and invalid-request failures
 * fail immediately.
 */

export interface GeminiClientOptions {
  apiKey: string;
  /** Model id; defaults to gemini-3.1-flash-lite. */
  model?: string;
  /** Override the API base URL (tests/proxies). */
  baseUrl?: string;
  /** Per-request timeout in milliseconds (default 60s). */
  timeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Max retries for transient failures (default 2). */
  maxRetries?: number;
  /** Injectable sleep for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface GenerateOptions {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  text: string;
  finishReason: string | undefined;
  usage: GeminiUsage;
}

export interface GeminiClient {
  readonly model: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
  /** Lightweight connectivity check (used by doctor). Throws GeminiApiError. */
  ping(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ApiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

function extractText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export function createGeminiClient(options: GeminiClientOptions): GeminiClient {
  if (!options.apiKey || options.apiKey.trim() === '') {
    throw new GeminiConfigurationError(
      'Gemini is not configured.',
      'Set GEMINI_API_KEY in your environment or .env file.',
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const model = options.model ?? GEMINI_MODEL;
  const baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const secrets = [options.apiKey];

  function buildRequest(options_: GenerateOptions): GeminiRequest {
    const generationConfig: GeminiGenerationConfig = {};
    if (options_.temperature !== undefined) generationConfig.temperature = options_.temperature;
    if (options_.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = options_.maxOutputTokens;
    }

    return {
      systemInstruction: { parts: [{ text: options_.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: options_.prompt }] }],
      generationConfig,
    };
  }

  /** Map a failed HTTP response to a typed error. */
  async function toApiError(response: Response): Promise<GeminiApiError> {
    const status = response.status;
    let message = `Gemini request failed with HTTP ${status}.`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (typeof body.error?.message === 'string' && body.error.message !== '') {
        message = stripSecrets(body.error.message, secrets);
      }
      code = body.error?.status;
    } catch {
      // Non-JSON error body; keep the generic message.
    }

    if (status === 401 || status === 403) {
      return new GeminiApiError(`Gemini rejected the API key: ${message}`, {
        status,
        code,
        hint: 'Check GEMINI_API_KEY in your environment or .env file.',
      });
    }
    if (status === 429) {
      return new GeminiApiError(`Gemini rate limit: ${message}`, {
        status,
        code,
        retryable: true,
        hint: 'Wait a moment and retry.',
      });
    }
    if (status === 404) {
      return new GeminiApiError(`Gemini model unavailable: ${message}`, {
        status,
        code,
        hint: `Model "${model}" is not available to this API key.`,
      });
    }
    if (status >= 500) {
      return new GeminiApiError(`Gemini service error: ${message}`, {
        status,
        code,
        retryable: true,
      });
    }
    return new GeminiApiError(message, { status, code });
  }

  /** Perform one HTTP round trip and parse the JSON body. */
  async function send(request: GeminiRequest): Promise<GeminiResponse> {
    const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': options.apiKey,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (cause.name === 'AbortError') {
        throw new GeminiApiError(`Gemini request timed out after ${timeoutMs}ms.`, {
          retryable: true,
          hint: 'Check your network connection and retry.',
        });
      }
      throw new GeminiApiError(`Gemini request failed: ${cause.message}`, {
        retryable: true,
        hint: 'Check your network connection and retry.',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw await toApiError(response);

    let body: GeminiResponse;
    try {
      body = (await response.json()) as GeminiResponse;
    } catch {
      throw new GeminiApiError('Gemini returned a malformed (non-JSON) response.', {
        status: response.status,
        retryable: false,
      });
    }
    return body;
  }

  /** Validate a parsed response and extract text, or throw a typed error. */
  function validate(body: GeminiResponse): GenerateResult {
    const blockReason = body.promptFeedback?.blockReason;
    if (typeof blockReason === 'string' && blockReason !== '' && blockReason !== 'NONE') {
      throw new GeminiApiError(`Gemini blocked the request (${blockReason}).`, {
        code: blockReason,
        retryable: false,
        hint: 'Adjust the input text or safety settings and retry.',
      });
    }

    const text = extractText(body);
    if (text.trim() === '') {
      if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
        throw new GeminiApiError('Gemini returned no candidates.', {
          retryable: true,
          hint: 'The model produced no output for this request; retry.',
        });
      }
      throw new GeminiApiError('Gemini returned an empty response.', {
        retryable: true,
        hint: 'The model produced empty text; retry.',
      });
    }

    const usage: GeminiUsage = {};
    if (typeof body.usageMetadata?.promptTokenCount === 'number') {
      usage.promptTokens = body.usageMetadata.promptTokenCount;
    }
    if (typeof body.usageMetadata?.candidatesTokenCount === 'number') {
      usage.completionTokens = body.usageMetadata.candidatesTokenCount;
    }
    if (typeof body.usageMetadata?.totalTokenCount === 'number') {
      usage.totalTokens = body.usageMetadata.totalTokenCount;
    }

    return {
      text,
      finishReason: body.candidates?.[0]?.finishReason,
      usage,
    };
  }

  async function generate(options_: GenerateOptions): Promise<GenerateResult> {
    const request = buildRequest(options_);
    let lastError: GeminiApiError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        const backoffMs = 500 * 2 ** (attempt - 1);
        debugLog(`gemini retry ${attempt}/${maxRetries} in ${backoffMs}ms`);
        await sleep(backoffMs);
      }
      try {
        const body = await send(request);
        return validate(body);
      } catch (error) {
        if (error instanceof GeminiApiError && error.retryable) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw (
      lastError ?? new GeminiApiError('Gemini request failed after retries.', { retryable: false })
    );
  }

  /** Connectivity check: models list with the key; throws on auth/HTTP errors. */
  async function ping(): Promise<void> {
    const url = `${baseUrl}/v1beta/models?pageSize=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': options.apiKey },
        signal: controller.signal,
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (cause.name === 'AbortError') {
        throw new GeminiApiError(`Gemini ping timed out after ${timeoutMs}ms.`, {
          retryable: true,
          hint: 'Check your network connection and retry.',
        });
      }
      throw new GeminiApiError(`Gemini ping failed: ${cause.message}`, {
        retryable: true,
        hint: 'Check your network connection and retry.',
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new GeminiApiError('Gemini rejected the API key (HTTP ' + response.status + ').', {
        status: response.status,
        hint: 'Check GEMINI_API_KEY in your environment or .env file.',
      });
    }
    if (!response.ok) {
      throw new GeminiApiError(`Gemini API responded with HTTP ${response.status}.`, {
        status: response.status,
      });
    }
  }

  return { model, generate, ping };
}
