import { describe, expect, it } from 'vitest';
import { createGeminiClient, type GeminiClient } from '../src/gemini/client.js';
import { GeminiConfigurationError } from '../src/gemini/errors.js';
import { GEMINI_MODEL } from '../src/gemini/types.js';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Fake fetch that returns scripted responses for the generateContent endpoint. */
function geminiServe(responses: Array<{ status: number; body: unknown }>): {
  client: GeminiClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key] = value;
      }
    }
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method: init?.method ?? 'GET', headers, body });

    const scripted = responses[calls.length - 1];
    const payload = scripted ?? { status: 500, body: {} };
    return {
      ok: payload.status >= 200 && payload.status < 300,
      status: payload.status,
      headers: { get: () => null },
      text: async () => JSON.stringify(payload.body),
      json: async () => {
        // Mimic real Response.json(): throw on non-JSON bodies.
        if (typeof payload.body === 'string') {
          try {
            return JSON.parse(payload.body) as unknown;
          } catch {
            throw new SyntaxError('Unexpected token');
          }
        }
        return payload.body;
      },
    };
  }) as unknown as typeof fetch;

  const client = createGeminiClient({
    apiKey: 'sk-test-key',
    fetchImpl,
    sleepImpl: async () => {},
    maxRetries: 2,
  });
  return { client, calls };
}

const SUCCESS_BODY = {
  candidates: [
    {
      content: { parts: [{ text: 'Rewritten text' }] },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
};

const OPTIONS = {
  systemInstruction: 'Rewrite naturally.',
  prompt: 'Original here.',
};

describe('createGeminiClient', () => {
  it('throws GeminiConfigurationError without a key', () => {
    expect(() => createGeminiClient({ apiKey: '' })).toThrow(GeminiConfigurationError);
    expect(() => createGeminiClient({ apiKey: '   ' })).toThrow(GeminiConfigurationError);
  });

  it('generates text and usage from a successful response', async () => {
    const { client, calls } = geminiServe([{ status: 200, body: SUCCESS_BODY }]);
    const result = await client.generate(OPTIONS);

    expect(result.text).toBe('Rewritten text');
    expect(result.finishReason).toBe('STOP');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });

    // The model id and key travel correctly.
    expect(calls[0]?.url).toContain(`/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect(calls[0]?.headers['x-goog-api-key']).toBe('sk-test-key');
    // The key must never appear in the URL or the JSON body.
    expect(calls[0]?.url).not.toContain('sk-test-key');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('sk-test-key');
  });

  it('fails immediately on 401 (auth is not retryable)', async () => {
    const { client, calls } = geminiServe([
      { status: 401, body: { error: { message: 'API key not valid', status: 'UNAUTHENTICATED' } } },
    ]);
    await expect(client.generate(OPTIONS)).rejects.toMatchObject({
      name: 'GeminiApiError',
      status: 401,
      retryable: false,
    });
    expect(calls).toHaveLength(1);
  });

  it('retries transient 429 and succeeds on the second attempt', async () => {
    const { client, calls } = geminiServe([
      { status: 429, body: { error: { message: 'rate limited', status: 'RESOURCE_EXHAUSTED' } } },
      { status: 200, body: SUCCESS_BODY },
    ]);
    const result = await client.generate(OPTIONS);
    expect(result.text).toBe('Rewritten text');
    expect(calls).toHaveLength(2);
  });

  it('gives up after retrying transient 5xx errors', async () => {
    const { client, calls } = geminiServe([
      { status: 500, body: { error: { message: 'boom' } } },
      { status: 500, body: { error: { message: 'boom' } } },
      { status: 500, body: { error: { message: 'boom' } } },
    ]);
    await expect(client.generate(OPTIONS)).rejects.toMatchObject({ retryable: true });
    expect(calls).toHaveLength(3); // initial + 2 retries
  });

  it('rejects malformed (non-JSON) 200 responses', async () => {
    const { client } = geminiServe([{ status: 200, body: 'this is not json' }]);
    await expect(client.generate(OPTIONS)).rejects.toMatchObject({
      name: 'GeminiApiError',
      message: expect.stringContaining('non-JSON'),
    });
  });

  it('rejects empty candidates and blocks without retry', async () => {
    const { client } = geminiServe([
      { status: 200, body: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } } },
    ]);
    await expect(client.generate(OPTIONS)).rejects.toMatchObject({
      name: 'GeminiApiError',
      message: expect.stringContaining('SAFETY'),
    });
  });

  it('never retries non-retryable model errors', async () => {
    const { client, calls } = geminiServe([
      { status: 404, body: { error: { message: 'model not found', status: 'NOT_FOUND' } } },
    ]);
    await expect(client.generate(OPTIONS)).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('model unavailable'),
    });
    expect(calls).toHaveLength(1);
  });

  it('reports connectivity failures as retryable errors', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const client = createGeminiClient({
      apiKey: 'sk-test-key',
      fetchImpl,
      maxRetries: 0,
    });
    await expect(client.generate(OPTIONS)).rejects.toMatchObject({
      name: 'GeminiApiError',
      retryable: true,
      hint: expect.stringContaining('network'),
    });
  });

  it('ping succeeds for a reachable key and fails on auth', async () => {
    const { client } = geminiServe([{ status: 200, body: { models: [] } }]);
    await expect(client.ping()).resolves.toBeUndefined();

    const { client: auth } = geminiServe([{ status: 403, body: {} }]);
    await expect(auth.ping()).rejects.toMatchObject({
      name: 'GeminiApiError',
      message: expect.stringContaining('403'),
    });
  });
});
