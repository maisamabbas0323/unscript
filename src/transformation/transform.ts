import type { AgentContext } from '../agent/context.js';
import type { RuleConflict } from '../knowledge/types.js';
import { TransformationError } from '../agent/errors.js';
import type { GeminiClient } from '../gemini/client.js';
import { debugLog } from '../utils/log.js';
import {
  extractJsonCandidate,
  validateTransformationOutput,
  type TransformationPayload,
} from './validation.js';

/**
 * Transformation prompt assembly and Gemini call orchestration.
 *
 * The system instruction is compiled from the structured AgentContext that
 * was retrieved from Sanity through the Context MCP: content type, level,
 * tone, writing patterns, transformation rules (in documented priority
 * order), preservation rules, user decisions, and conflicts. Gemini is the
 * language engine only — every writing rule it follows comes from these
 * retrieved documents, never invented inline.
 */

export interface PromptOptions {
  /** Correction note appended when a previous JSON attempt was invalid. */
  correction?: string;
}

function provenanceLabel(id: string): string {
  return `[sanity:${id}]`;
}

function heading(title: string): string {
  return `\n## ${title}\n`;
}

function transformRulesSection(ctx: AgentContext): string {
  const lines = [heading('APPLICABLE TRANSFORMATION RULES (in priority order — higher first)')];
  for (const rule of ctx.transformationRules) {
    lines.push(`- ${rule.title} (priority ${rule.priority ?? '?'}) ${provenanceLabel(rule._id)}`);
    if (rule.trigger !== undefined) lines.push(`  Trigger: ${rule.trigger}`);
    if (rule.instruction !== undefined) lines.push(`  Instruction: ${rule.instruction}`);
    if (rule.relatedPatterns !== undefined && rule.relatedPatterns.length > 0) {
      lines.push(`  Responds to patterns: ${rule.relatedPatterns.join(', ')}`);
    }
  }
  if (ctx.transformationRules.length === 0) {
    lines.push('- (none retrieved for this request)');
  }
  return lines.join('\n');
}

function preservationSection(ctx: AgentContext): string {
  const lines = [heading('PRESERVATION RULES (these always stay in force)')];
  for (const rule of ctx.preservationRules) {
    lines.push(`- ${rule.title} (weight ${rule.priority ?? '?'}) ${provenanceLabel(rule._id)}`);
    if (rule.whatToPreserve !== undefined) lines.push(`  Preserve: ${rule.whatToPreserve}`);
    if (rule.whatMustNotChange !== undefined) {
      lines.push(`  Must not change: ${rule.whatMustNotChange}`);
    }
    if (rule.whatCanChange !== undefined) lines.push(`  May change: ${rule.whatCanChange}`);
  }
  if (ctx.preservationRules.length === 0) {
    lines.push('- (none retrieved for this request)');
  }
  return lines.join('\n');
}

function conflictsSection(conflicts: RuleConflict[]): string {
  const lines = [heading('DOCUMENTED RULE CONFLICTS')];
  for (const conflict of conflicts) {
    lines.push(
      `- ${conflict.ruleTitle} (priority ${conflict.rulePriority ?? '?'}) conflicts with ` +
        `${conflict.conflictsWithTitle} (priority ${conflict.conflictsWithPriority ?? '?'}): ` +
        conflict.detail,
    );
  }
  if (conflicts.length === 0) lines.push('- (no conflicts among the applicable rules)');
  return lines.join('\n');
}

/** Compile the system instruction from retrieved Sanity knowledge. */
export function buildSystemInstruction(ctx: AgentContext): string {
  const parts: string[] = [];

  parts.push(
    'You are the transformation engine of a writing tool. You rewrite text to be natural, ' +
      'clear, and appropriate for its context. Every writing rule below was retrieved from a ' +
      'structured knowledge base; apply exactly what is listed, nothing more. Never invent rules, ' +
      'facts, or sources.',
  );

  parts.push(
    [
      '',
      '## HARD CONSTRAINTS',
      '- Preserve the original meaning, intent, and information content.',
      '- Do not invent facts, and do not remove important uncertainty (may, might, likely, approximately, etc.).',
      '- Do not change numbers, dates, names, URLs, identifiers, requirements, or quotations unless the user explicitly asks.',
      '- Preserve appropriate technical terminology.',
      '- Do not fabricate sources or claim a source supports something not present in the retrieved data.',
      '- Do not claim the text is "100% human", that human input was used to avoid detection, or that AI detectors were bypassed.',
      '- Do not mention internal implementation details in the rewritten writing.',
      '- Do not add information that is not in the source text, unless the user explicitly requests expansion.',
      '- Avoid repetitive sentence structures and unnatural vocabulary substitution.',
      '- If two retrieved rules conflict, apply the rule with the higher documented priority and do not silently mix them.',
    ].join('\n'),
  );

  if (ctx.contentType !== null) {
    parts.push(heading('CONTENT TYPE'));
    parts.push(
      `Type: ${ctx.contentType.title}${ctx.contentType.slug ? ` (${ctx.contentType.slug})` : ''}`,
    );
    if (ctx.contentType.description !== undefined)
      parts.push(`Description: ${ctx.contentType.description}`);
    if (ctx.contentType.audience !== undefined) parts.push(`Audience: ${ctx.contentType.audience}`);
    if (ctx.contentType.typicalStructure !== undefined)
      parts.push(`Typical structure: ${ctx.contentType.typicalStructure}`);
    if (ctx.contentType.toneConsiderations !== undefined)
      parts.push(`Tone considerations: ${ctx.contentType.toneConsiderations}`);
    if (ctx.contentType.preservationConsiderations !== undefined) {
      parts.push(`Preservation considerations: ${ctx.contentType.preservationConsiderations}`);
    }
  }

  if (ctx.humanizationLevel !== null) {
    const level = ctx.humanizationLevel;
    parts.push(heading('HUMANIZATION LEVEL'));
    parts.push(`Level: ${level.title} (intensity ${level.intensity ?? '?'}/10)`);
    if (level.description !== undefined) parts.push(`Description: ${level.description}`);
    if (level.sentenceChange !== undefined) parts.push(`Sentence change: ${level.sentenceChange}`);
    if (level.vocabularyChange !== undefined)
      parts.push(`Vocabulary change: ${level.vocabularyChange}`);
    if (level.structureChange !== undefined)
      parts.push(`Structure change: ${level.structureChange}`);
    if (level.toneChange !== undefined) parts.push(`Tone change: ${level.toneChange}`);
  }

  if (ctx.tone !== null) {
    const tone = ctx.tone;
    parts.push(heading('TONE'));
    parts.push(`Tone: ${tone.title}${tone.slug ? ` (${tone.slug})` : ''}`);
    if (tone.description !== undefined) parts.push(`Description: ${tone.description}`);
    if (tone.toneCharacteristics !== undefined)
      parts.push(`Characteristics: ${tone.toneCharacteristics}`);
    if (tone.preferredLanguage !== undefined)
      parts.push(`Preferred language: ${tone.preferredLanguage}`);
    if (tone.avoidLanguage !== undefined) parts.push(`Avoid language: ${tone.avoidLanguage}`);
    if (tone.sentenceRhythm !== undefined) parts.push(`Sentence rhythm: ${tone.sentenceRhythm}`);
    if (tone.vocabularyGuidance !== undefined)
      parts.push(`Vocabulary guidance: ${tone.vocabularyGuidance}`);
  }

  if (ctx.patterns.length > 0) {
    parts.push(heading('WRITING PATTERNS TO DETECT AND CONSIDER CHANGING'));
    for (const pattern of ctx.patterns) {
      parts.push(
        `- ${pattern.title} (severity: ${pattern.severity ?? '?'}) ${provenanceLabel(pattern._id)}`,
      );
      if (pattern.pattern !== undefined) parts.push(`  Pattern: ${pattern.pattern}`);
      if (pattern.whenToChange !== undefined)
        parts.push(`  When to change: ${pattern.whenToChange}`);
      if (pattern.preferredTransformation !== undefined) {
        parts.push(`  Preferred transformation: ${pattern.preferredTransformation}`);
      }
    }
  }

  parts.push(transformRulesSection(ctx));
  parts.push(preservationSection(ctx));
  parts.push(conflictsSection(ctx.conflicts));

  if (ctx.userDecisions.length > 0) {
    parts.push(heading('USER DECISIONS'));
    for (const decision of ctx.userDecisions) {
      parts.push(`- ${decision.title}: ${decision.decision ?? ''}`);
      if (decision.reason !== undefined) parts.push(`  Reason: ${decision.reason}`);
    }
  }

  return parts.join('\n');
}

const OUTPUT_CONTRACT = `Respond with ONLY a single JSON object with exactly these fields:
{
  "transformedText": "the fully rewritten text, no surrounding markers",
  "appliedRules": ["slug of each transformation rule you applied"],
  "preservedElements": ["a short label for each protected element you kept intact"],
  "notes": ["optional short notes to the user"]
}
Do not include prose before or after the JSON object. Do not wrap it in markdown fences.`;

/** Build the user prompt: original text + strict output contract. */
export function buildUserPrompt(original: string, options: PromptOptions = {}): string {
  const correction =
    options.correction !== undefined
      ? `\n\nYour previous response was rejected because: ${options.correction}. Respond again with ONLY the JSON object described below.`
      : '';
  return `Transform the following original text according to the instructions above.

ORIGINAL TEXT (between the markers):
<begin original>
${original}
<end original>

${OUTPUT_CONTRACT}${correction}`;
}

/** One decode pass over Gemini output. */
function decode(
  text: string,
): { payload: TransformationPayload } | { plain: string } | { invalid: string } {
  const cleaned = text.trim();
  if (cleaned === '') return { invalid: 'response was empty' };
  const json = extractJsonCandidate(cleaned);
  if (json === null) {
    // Not JSON at all: a plain rewrite is a legitimate, honest result.
    return { plain: cleaned };
  }
  const validation = validateTransformationOutput(json);
  if (validation.ok) return { payload: validation.payload };
  return { invalid: validation.reason };
}

/**
 * Call Gemini and turn its output into a validated payload. A single safe
 * retry is allowed for invalid JSON (a fresh, full replacement — never an
 * append), while plain-text rewrites are accepted with a note.
 */
export async function callTransformation(
  client: GeminiClient,
  systemInstruction: string,
  original: string,
): Promise<TransformationPayload> {
  let lastInvalid: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const correction =
      attempt === 0 || lastInvalid === undefined
        ? undefined
        : `transformedText was not a valid JSON string (${lastInvalid})`;
    const userPrompt = buildUserPrompt(original, correction ? { correction } : {});
    debugLog(`gemini call ${attempt + 1}, prompt bytes=${userPrompt.length}`);

    const response = await client.generate({
      systemInstruction,
      prompt: userPrompt,
      temperature: 0.45,
      maxOutputTokens: 2048,
    });
    debugLog(
      `gemini finishReason=${response.finishReason ?? 'none'}, chars=${response.text.length}`,
    );

    const decoded = decode(response.text);
    if ('payload' in decoded) return decoded.payload;
    if ('plain' in decoded) {
      return {
        transformedText: decoded.plain,
        notes: [
          'The model returned plain text; applied rules were not reported in a structured form.',
        ],
      };
    }
    lastInvalid = decoded.invalid;
  }

  throw new TransformationError(
    `Gemini returned malformed output after a retry (${lastInvalid ?? 'unknown reason'}).`,
    'Re-run the transformation; if this repeats, the model may be overloaded.',
  );
}
