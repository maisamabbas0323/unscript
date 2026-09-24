/**
 * Strict validation of Gemini transformation output.
 *
 * The pipeline asks Gemini for a small JSON object; this module accepts
 * only well-formed objects with a non-empty `transformedText` string and
 * validates optional fields before anything reaches the CLI. Malformed
 * output is rejected — never silently repaired or filled in.
 *
 * Note: rule conflicts are knowledge-side facts assembled by the agent
 * from Sanity; any `conflicts` field in model output is informational
 * only and is dropped during validation.
 */

export interface TransformationPayload {
  transformedText: string;
  appliedRules?: string[];
  preservedElements?: string[];
  notes?: string[];
}

export type ValidationResult =
  { ok: true; payload: TransformationPayload } | { ok: false; reason: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Validate a raw response body as a transformation payload. */
export function validateTransformationOutput(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'response is not a JSON object' };
  }
  const candidate = raw as Record<string, unknown>;
  const text = candidate.transformedText;
  if (typeof text !== 'string') {
    return { ok: false, reason: 'transformedText is missing or not a string' };
  }
  if (text.trim() === '') {
    return { ok: false, reason: 'transformedText is empty' };
  }

  const payload: TransformationPayload = { transformedText: text };

  if (candidate.appliedRules !== undefined) {
    if (!isStringArray(candidate.appliedRules)) {
      return { ok: false, reason: 'appliedRules is not an array of strings' };
    }
    payload.appliedRules = candidate.appliedRules;
  }
  if (candidate.preservedElements !== undefined) {
    if (!isStringArray(candidate.preservedElements)) {
      return { ok: false, reason: 'preservedElements is not an array of strings' };
    }
    payload.preservedElements = candidate.preservedElements;
  }
  if (candidate.notes !== undefined) {
    if (!isStringArray(candidate.notes)) {
      return { ok: false, reason: 'notes is not an array of strings' };
    }
    payload.notes = candidate.notes;
  }
  if (candidate.conflicts !== undefined && !Array.isArray(candidate.conflicts)) {
    return { ok: false, reason: 'conflicts is not an array' };
  }

  return { ok: true, payload };
}

/** Strip code fences / chatter around a JSON body before validation. */
export function extractJsonCandidate(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  // Direct parse first.
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // fall through
  }

  // Model may wrap the object in a fenced code block.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1] !== undefined) {
    try {
      return JSON.parse(fence[1].trim()) as unknown;
    } catch {
      // fall through
    }
  }

  // Last resort: first balanced {...} span.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      // fall through
    }
  }
  return null;
}
