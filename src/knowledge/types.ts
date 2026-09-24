/**
 * Typed views of Unscript Knowledge Base documents.
 *
 * These mirror the Sanity schemas in `unscript-knowledge/schemaTypes/`.
 * Values come from the live dataset through the Context MCP `groq_query`
 * tool; projections in the retrieval layer normalize `slug` to a plain
 * string and resolve `source` references to light provenance objects.
 */

export interface SlugRef {
  _id: string;
  title?: string;
  slug?: string;
}

/** Lightweight provenance for a knowledge item's origin source. */
export interface SourceRef {
  _id?: string;
  title?: string;
  name?: string;
  url?: string;
  slug?: string;
  publisher?: string;
  author?: string;
}

export interface KnowledgeDocBase {
  _id: string;
  _type: string;
  title: string;
  slug?: string;
}

export interface ContentTypeDoc extends KnowledgeDocBase {
  _type: 'contentType';
  description?: string;
  audience?: string;
  typicalStructure?: string;
  toneConsiderations?: string;
  preservationConsiderations?: string;
  source?: SourceRef;
}

export interface HumanizationLevelDoc extends KnowledgeDocBase {
  _type: 'humanizationLevel';
  description?: string;
  intensity?: number;
  sentenceChange?: string;
  vocabularyChange?: string;
  structureChange?: string;
  toneChange?: string;
  preservationRules?: PreservationRuleDoc[];
  transformationRules?: TransformationRuleDoc[];
  source?: SourceRef;
}

export interface ToneRuleDoc extends KnowledgeDocBase {
  _type: 'toneRule';
  description?: string;
  toneCharacteristics?: string;
  preferredLanguage?: string;
  avoidLanguage?: string;
  sentenceRhythm?: string;
  vocabularyGuidance?: string;
  transformationRules?: TransformationRuleDoc[];
  preservationRules?: PreservationRuleDoc[];
  contentTypes?: string[];
  source?: SourceRef;
}

export interface WritingPatternDoc extends KnowledgeDocBase {
  _type: 'writingPattern';
  pattern?: string;
  description?: string;
  whenToChange?: string;
  preferredTransformation?: string;
  severity?: 'low' | 'medium' | 'high';
  contentTypes?: string[];
  source?: SourceRef;
}

export interface ConflictRef extends SlugRef {
  priority?: number;
}

export interface TransformationRuleDoc extends KnowledgeDocBase {
  _type: 'transformationRule';
  description?: string;
  trigger?: string;
  instruction?: string;
  /** Documentation order semantics: higher runs first (1–100). */
  priority?: number;
  appliesTo?: string[];
  appliesToTones?: string[];
  relatedPatterns?: string[];
  conflictsWith?: ConflictRef[];
  preservationRules?: PreservationRuleDoc[];
  source?: SourceRef;
}

export interface PreservationRuleDoc extends KnowledgeDocBase {
  _type: 'preservationRule';
  description?: string;
  whatToPreserve?: string;
  whatCanChange?: string;
  whatMustNotChange?: string;
  /** Documentation semantics: higher weight wins on conflict (1–100). */
  priority?: number;
  appliesTo?: string[];
  relatedTransformationRules?: string[];
  source?: SourceRef;
}

export interface SourceDoc extends KnowledgeDocBase {
  _type: 'source';
  name?: string;
  url?: string;
  description?: string;
  publisher?: string;
  author?: string;
  scope?: string;
}

export interface UserDecisionDoc extends KnowledgeDocBase {
  _type: 'userDecision';
  context?: string;
  decision?: string;
  reason?: string;
  priority?: number;
  source?: SourceRef;
}

/** Raw document rows as returned by GROQ before normalization. */
export type RawDoc = Record<string, unknown>;

/**
 * A documented conflict between two applicable transformation rules.
 * Priorities come from the Knowledge Base (higher runs first); when both
 * sides share a priority the conflict is unresolved by the data.
 */
export interface RuleConflict {
  ruleId: string;
  ruleSlug?: string;
  ruleTitle: string;
  rulePriority?: number;
  conflictsWithId: string;
  conflictsWithSlug?: string;
  conflictsWithTitle: string;
  conflictsWithPriority?: number;
  resolution: 'priority' | 'unresolved';
  detail: string;
}
