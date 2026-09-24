/**
 * Types for the Gemini REST API (Google AI generativelanguage).
 * Only the fields Unscript uses are modeled; unknown fields from the API
 * are tolerated by the client.
 */

/** The transformation model used by Unscript. */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** Base URL of the public Gemini REST API. */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiSystemInstruction {
  parts: GeminiPart[];
}

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiRequest {
  systemInstruction?: GeminiSystemInstruction;
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiCandidate {
  content?: { parts?: GeminiPart[]; role?: string };
  finishReason?: string;
  index?: number;
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string; safetyRatings?: unknown[] };
  usageMetadata?: GeminiUsageMetadata;
}

export interface GeminiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
