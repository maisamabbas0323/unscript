/**
 * Deterministic preservation validation.
 *
 * Compares a transformation against the ORIGINAL text and flags any
 * preservation-sensitive item that changed or disappeared: numbers,
 * dates, URLs, technical identifiers, quoted text, explicit requirements,
 * and uncertainty markers. Proper nouns are checked best-effort and only
 * produce warnings (single-word detection is too noisy to fail on).
 *
 * This is a heuristic check, not semantic verification. It never rewrites
 * output to hide a failure — changes are surfaced as-is.
 */

export type ProtectedKind =
  'number' | 'date' | 'url' | 'identifier' | 'quotation' | 'requirement' | 'uncertainty' | 'name';

export interface ProtectedItem {
  kind: ProtectedKind;
  value: string;
}

export interface PreservationChange {
  kind: ProtectedKind;
  value: string;
}

export interface PreservationReport {
  passed: boolean;
  checked: number;
  changedProtectedItems: PreservationChange[];
  warnings: string[];
}

/**
 * Combined token scanner. Alternation order matters: URLs, versions, and
 * dates are recognized before generic numbers so they are not double-counted.
 */
const PROTECTED_TOKEN = new RegExp(
  [
    '(?<url>https?:\\/\\/[^\\s<>"\']+)',
    '|(?<version>\\bv\\d+(?:\\.\\d+)+\\b|\\b\\d+(?:\\.\\d+){2,}\\b)',
    '|(?<date>\\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|(?:19|20)\\d{2})\\b)',
    '|(?<quotation>["\'\u201c\u2018][^"\'\u201c\u201d\u2018\u2019\\n]{2,300}["\'\u201d\u2019])',
    '|(?<identifier>\\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\\b|\\b[A-Za-z0-9-]+\\.[A-Za-z]{2,}\\b|\\b[A-Z]{2,}-\\d{2,}[A-Za-z0-9-]*\\b)',
    '|(?<number>(?<![\\w.,])[$\u20ac\u00a3\u00a5]?\\d[\\d,]*(?:\\.\\d+)?%?)',
  ].join(''),
  'g',
);

const REQUIREMENT_WORDS = /\b(must|shall|required|requirements?|need(?:s)? to|mandatory|never)\b/gi;

const UNCERTAINTY_WORDS =
  /\b(may|might|could|likely|probably|possibly|perhaps|approximately|roughly|seems?|appears?|uncertain|unclear|presumably| tentative)\b/gi;

/** Extract preservation-sensitive items from text. Deduped by kind+value. */
export function extractProtectedItems(original: string): ProtectedItem[] {
  const items: ProtectedItem[] = [];
  const seen = new Set<string>();
  const push = (kind: ProtectedKind, value: string): void => {
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ kind, value });
  };

  PROTECTED_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROTECTED_TOKEN.exec(original)) !== null) {
    const groups = match.groups ?? {};
    const url = groups.url;
    const version = groups.version;
    const date = groups.date;
    const quotation = groups.quotation;
    const identifier = groups.identifier;
    const number = groups.number;

    if (url !== undefined) push('url', url.replace(/[.,;:!?)]+$/, ''));
    else if (version !== undefined) push('identifier', version);
    else if (date !== undefined) push('date', date);
    else if (quotation !== undefined) push('quotation', stripQuotes(quotation));
    else if (identifier !== undefined) push('identifier', identifier);
    else if (number !== undefined) push('number', number);
  }

  collectWords(original, REQUIREMENT_WORDS, 'requirement', push);
  collectWords(original, UNCERTAINTY_WORDS, 'uncertainty', push);
  for (const name of extractNames(original)) push('name', name);

  return items;
}

function collectWords(
  text: string,
  pattern: RegExp,
  kind: ProtectedKind,
  push: (kind: ProtectedKind, value: string) => void,
): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1] !== undefined) push(kind, match[1].toLowerCase());
  }
}

function stripQuotes(value: string): string {
  return value.slice(1, -1).trim();
}

/**
 * Proper-noun candidates: capitalized word sequences that do not start a
 * sentence. Best-effort — used for warnings only.
 */
function extractNames(text: string): string[] {
  const names: string[] = [];
  const pattern = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const index = match.index;
    if (index === 0) continue;
    const before = text.slice(Math.max(0, index - 4), index);
    if (/[.!?\n]\s*$/.test(before)) continue;
    names.push(match[0]);
  }
  return names;
}

interface NumericToken {
  raw: string;
  value: number;
  percent: boolean;
}

function collectNumbers(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];
  const pattern = /[$\u20ac\u00a3\u00a5]?\d[\d,]*(?:\.\d+)?%?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const percent = raw.endsWith('%');
    const cleaned = raw.replace(/[$\u20ac\u00a3\u00a5%,]/g, '');
    const value = Number.parseFloat(cleaned);
    if (!Number.isNaN(value)) tokens.push({ raw, value, percent });
  }
  return tokens;
}

function hasNumber(tokens: NumericToken[], original: string): boolean {
  const percent = original.endsWith('%');
  const cleaned = original.replace(/[$\u20ac\u00a3\u00a5%,]/g, '');
  const want = Number.parseFloat(cleaned);
  if (Number.isNaN(want)) return false;
  for (const token of tokens) {
    if (Math.abs(token.value - want) < 1e-9 && token.percent === percent) return true;
  }
  // "45%" written as "45 percent" still preserves the figure.
  if (percent) return false;
  return false;
}

function containsPercentWord(text: string, original: string): boolean {
  const cleaned = original.replace(/[$\u20ac\u00a3\u00a5%,]/g, '');
  return new RegExp(`\\b${escapeRegExp(cleaned)}\\s+percent\\b`, 'i').test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate a transformation against the original text. `passed` is false
 * only when a non-heuristic item (number/date/url/identifier/quote/
 * requirement/uncertainty) changed; name mismatches become warnings.
 */
export function validatePreservation(original: string, transformed: string): PreservationReport {
  const items = extractProtectedItems(original);
  const changedProtectedItems: PreservationChange[] = [];
  const warnings: string[] = [];
  const lower = transformed.toLowerCase();
  const numbers = collectNumbers(transformed);

  for (const item of items) {
    switch (item.kind) {
      case 'number': {
        if (hasNumber(numbers, item.value)) break;
        if (containsPercentWord(transformed, item.value)) break;
        changedProtectedItems.push(item);
        break;
      }
      case 'url': {
        if (!transformed.includes(item.value)) changedProtectedItems.push(item);
        break;
      }
      case 'name': {
        if (!lower.includes(item.value.toLowerCase())) {
          warnings.push(
            `Possible name change: "${item.value}" does not appear in the rewritten text (heuristic check).`,
          );
        }
        break;
      }
      default: {
        if (!lower.includes(item.value.toLowerCase())) changedProtectedItems.push(item);
      }
    }
  }

  return {
    passed: changedProtectedItems.length === 0,
    checked: items.length,
    changedProtectedItems,
    warnings,
  };
}
