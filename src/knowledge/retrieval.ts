import { KnowledgeRetrievalError } from './errors.js';
import { mergeByPriority } from './ranking.js';
import type { ContextMcp } from '../mcp/contextMcp.js';
import type {
  ContentTypeDoc,
  HumanizationLevelDoc,
  PreservationRuleDoc,
  RawDoc,
  SourceDoc,
  SourceRef,
  ToneRuleDoc,
  TransformationRuleDoc,
  UserDecisionDoc,
  WritingPatternDoc,
} from './types.js';

/**
 * Knowledge retrieval through the Sanity Context MCP.
 *
 * Sanity stays the source of truth: every query goes through the real
 * `groq_query` tool against the endpoint's dataset source. Only documents
 * relevant to the request are fetched — never the whole dataset — and each
 * row keeps its `_id` and source provenance so the transformation can be
 * traced back to the knowledge that influenced it.
 *
 * Slugs are inlined into queries; they are validated `[a-z0-9-]+` by the
 * Sanity schema, so this is safe and avoids dependency on query parameters.
 */

export interface RetrievalRequest {
  contentTypeSlug: string;
  toneSlug: string;
  levelSlug: string;
}

export interface RetrievalResult {
  contentType: ContentTypeDoc | null;
  humanizationLevel: HumanizationLevelDoc | null;
  tone: ToneRuleDoc | null;
  patterns: WritingPatternDoc[];
  transformationRules: TransformationRuleDoc[];
  preservationRules: PreservationRuleDoc[];
  sources: SourceDoc[];
  userDecisions: UserDecisionDoc[];
}

/** Light choice row used by the interactive UI selectors. */
export interface TypeChoice {
  _id: string;
  title: string;
  slug: string;
  description?: string;
}

const SOURCE_PROJECTION = `_id, title, "slug": slug.current, name, url, description, publisher, author, scope`;

const PRESERVATION_RULE_PROJECTION = `{
  _id, _type, title, "slug": slug.current, description, whatToPreserve,
  whatCanChange, whatMustNotChange, priority,
  "source": source->{${SOURCE_PROJECTION}}
}`;

const TRANSFORMATION_RULE_PROJECTION = `{
  _id, _type, title, "slug": slug.current, description, trigger, instruction, priority,
  "appliesTo": appliesTo[]->slug.current,
  "appliesToTones": appliesToTones[]->slug.current,
  "relatedPatterns": relatedPatterns[]->slug.current,
  "conflictsWith": conflictsWith[]->{_id, title, "slug": slug.current, priority},
  "preservationRules": preservationRules[]->{_id, _type, title, "slug": slug.current,
    description, whatToPreserve, whatCanChange, whatMustNotChange, priority,
    "source": source->{${SOURCE_PROJECTION}}},
  "source": source->{${SOURCE_PROJECTION}}
}`;

const SOURCE_REF_PROJECTION = `"source": source->{${SOURCE_PROJECTION}}`;

function contentBySlugQuery(slug: string): string {
  return `*[_type == "contentType" && slug.current == "${slug}"]{
    _id, _type, title, "slug": slug.current, description, audience, typicalStructure,
    toneConsiderations, preservationConsiderations, ${SOURCE_REF_PROJECTION}
  }[0]`;
}

function levelBySlugQuery(slug: string): string {
  return `*[_type == "humanizationLevel" && slug.current == "${slug}"]{
    _id, _type, title, "slug": slug.current, description, intensity, sentenceChange,
    vocabularyChange, structureChange, toneChange,
    "preservationRules": preservationRules[]->${PRESERVATION_RULE_PROJECTION},
    "transformationRules": transformationRules[]->${TRANSFORMATION_RULE_PROJECTION},
    ${SOURCE_REF_PROJECTION}
  }[0]`;
}

function toneBySlugQuery(slug: string): string {
  return `*[_type == "toneRule" && slug.current == "${slug}"]{
    _id, _type, title, "slug": slug.current, description, toneCharacteristics,
    preferredLanguage, avoidLanguage, sentenceRhythm, vocabularyGuidance,
    "contentTypes": contentTypes[]->slug.current,
    "transformationRules": transformationRules[]->${TRANSFORMATION_RULE_PROJECTION},
    "preservationRules": preservationRules[]->${PRESERVATION_RULE_PROJECTION},
    ${SOURCE_REF_PROJECTION}
  }[0]`;
}

function patternsForTypeQuery(contentTypeSlug: string): string {
  return `*[_type == "writingPattern" && references(*[_type == "contentType" && slug.current == "${contentTypeSlug}"]._id)]{
    _id, _type, title, "slug": slug.current, pattern, description, whenToChange,
    preferredTransformation, severity,
    "contentTypes": contentTypes[]->slug.current, ${SOURCE_REF_PROJECTION}
  }`;
}

function rulesForPatternsQuery(patternIds: string[]): string {
  return `*[_type == "transformationRule" && references(*[_id in ${JSON.stringify(patternIds)}]._id)]${TRANSFORMATION_RULE_PROJECTION}`;
}

function rulesForTypeQuery(contentTypeSlug: string): string {
  return `*[_type == "transformationRule" && references(*[_type == "contentType" && slug.current == "${contentTypeSlug}"]._id)]${TRANSFORMATION_RULE_PROJECTION}`;
}

function preservationForTypeQuery(contentTypeSlug: string): string {
  return `*[_type == "preservationRule" && references(*[_type == "contentType" && slug.current == "${contentTypeSlug}"]._id)]${PRESERVATION_RULE_PROJECTION}`;
}

function userDecisionsQuery(): string {
  return `*[_type == "userDecision"]{
    _id, _type, title, "slug": slug.current, context, decision, reason, priority,
    ${SOURCE_REF_PROJECTION}
  }`;
}

function typeChoicesQuery(type: string): string {
  return `*[_type == "${type}"]{_id, title, "slug": slug.current, description}`;
}

/* ---- normalization helpers -------------------------------------------------- */

function isRecord(value: unknown): value is RawDoc {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeSourceRef(value: unknown): SourceRef | undefined {
  if (!isRecord(value)) return undefined;
  const ref: SourceRef = {};
  const id = str(value._id);
  if (id !== undefined) ref._id = id;
  const title = str(value.title);
  if (title !== undefined) ref.title = title;
  const name = str(value.name);
  if (name !== undefined) ref.name = name;
  const url = str(value.url);
  if (url !== undefined) ref.url = url;
  const slug = str(value.slug);
  if (slug !== undefined) ref.slug = slug;
  const publisher = str(value.publisher);
  if (publisher !== undefined) ref.publisher = publisher;
  const author = str(value.author);
  if (author !== undefined) ref.author = author;
  return Object.keys(ref).length > 0 ? ref : undefined;
}

function asSlugStrings(value: unknown): string[] {
  return strArray(value) ?? [];
}

/** Base identity shared by every knowledge doc type. */
function base(raw: RawDoc): { _id: string; title: string; slug?: string } | null {
  const id = str(raw._id);
  const title = str(raw.title);
  if (id === undefined || title === undefined) return null;
  return { _id: id, title, slug: str(raw.slug) };
}

/** Extract source provenance from a row and record it in the source set. */
function recordSource(raw: RawDoc, sources: SourceDoc[]): void {
  const value = raw.source;
  if (!isRecord(value)) return;
  const id = str(value._id);
  if (id === undefined) return;
  if (sources.some((source) => source._id === id)) return;
  sources.push({
    _id: id,
    _type: 'source',
    title: str(value.title) ?? id,
    slug: str(value.slug),
    name: str(value.name),
    url: str(value.url),
    description: str(value.description),
    publisher: str(value.publisher),
    author: str(value.author),
    scope: str(value.scope),
  });
}

function normalizeContentType(raw: RawDoc, sources: SourceDoc[]): ContentTypeDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  return {
    _type: 'contentType',
    ...b,
    description: str(raw.description),
    audience: str(raw.audience),
    typicalStructure: str(raw.typicalStructure),
    toneConsiderations: str(raw.toneConsiderations),
    preservationConsiderations: str(raw.preservationConsiderations),
    source: normalizeSourceRef(raw.source),
  };
}

function normalizePreservation(raw: RawDoc, sources: SourceDoc[]): PreservationRuleDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  return {
    _type: 'preservationRule',
    ...b,
    description: str(raw.description),
    whatToPreserve: str(raw.whatToPreserve),
    whatCanChange: str(raw.whatCanChange),
    whatMustNotChange: str(raw.whatMustNotChange),
    priority: num(raw.priority),
    appliesTo: asSlugStrings(raw.appliesTo),
    relatedTransformationRules: asSlugStrings(raw.relatedTransformationRules),
    source: normalizeSourceRef(raw.source),
  };
}

function normalizeTransformation(raw: RawDoc, sources: SourceDoc[]): TransformationRuleDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  const preservationRules: PreservationRuleDoc[] = [];
  if (Array.isArray(raw.preservationRules)) {
    for (const entry of raw.preservationRules) {
      if (isRecord(entry)) {
        const doc = normalizePreservation(entry, sources);
        if (doc !== null) preservationRules.push(doc);
      }
    }
  }
  const conflictsWith: TransformationRuleDoc['conflictsWith'] | undefined = Array.isArray(
    raw.conflictsWith,
  )
    ? raw.conflictsWith
        .filter((entry): entry is RawDoc => isRecord(entry))
        .map((entry) => ({
          _id: str(entry._id) ?? '',
          title: str(entry.title),
          slug: str(entry.slug),
          priority: num(entry.priority),
        }))
        .filter((entry) => entry._id !== '')
    : undefined;

  return {
    _type: 'transformationRule',
    ...b,
    description: str(raw.description),
    trigger: str(raw.trigger),
    instruction: str(raw.instruction),
    priority: num(raw.priority),
    appliesTo: asSlugStrings(raw.appliesTo),
    appliesToTones: asSlugStrings(raw.appliesToTones),
    relatedPatterns: asSlugStrings(raw.relatedPatterns),
    conflictsWith,
    preservationRules,
    source: normalizeSourceRef(raw.source),
  };
}

function normalizeLevel(raw: RawDoc, sources: SourceDoc[]): HumanizationLevelDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  return {
    _type: 'humanizationLevel',
    ...b,
    description: str(raw.description),
    intensity: num(raw.intensity),
    sentenceChange: str(raw.sentenceChange),
    vocabularyChange: str(raw.vocabularyChange),
    structureChange: str(raw.structureChange),
    toneChange: str(raw.toneChange),
    preservationRules: docList(raw.preservationRules, normalizePreservation, sources),
    transformationRules: docList(raw.transformationRules, normalizeTransformation, sources),
    source: normalizeSourceRef(raw.source),
  };
}

function normalizeTone(raw: RawDoc, sources: SourceDoc[]): ToneRuleDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  return {
    _type: 'toneRule',
    ...b,
    description: str(raw.description),
    toneCharacteristics: str(raw.toneCharacteristics),
    preferredLanguage: str(raw.preferredLanguage),
    avoidLanguage: str(raw.avoidLanguage),
    sentenceRhythm: str(raw.sentenceRhythm),
    vocabularyGuidance: str(raw.vocabularyGuidance),
    transformationRules: docList(raw.transformationRules, normalizeTransformation, sources),
    preservationRules: docList(raw.preservationRules, normalizePreservation, sources),
    contentTypes: asSlugStrings(raw.contentTypes),
    source: normalizeSourceRef(raw.source),
  };
}

function normalizePattern(raw: RawDoc, sources: SourceDoc[]): WritingPatternDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  const severity = str(raw.severity);
  return {
    _type: 'writingPattern',
    ...b,
    pattern: str(raw.pattern),
    description: str(raw.description),
    whenToChange: str(raw.whenToChange),
    preferredTransformation: str(raw.preferredTransformation),
    severity:
      severity === 'low' || severity === 'medium' || severity === 'high' ? severity : undefined,
    contentTypes: asSlugStrings(raw.contentTypes),
    source: normalizeSourceRef(raw.source),
  };
}

function normalizeUserDecision(raw: RawDoc, sources: SourceDoc[]): UserDecisionDoc | null {
  const b = base(raw);
  if (b === null) return null;
  recordSource(raw, sources);
  return {
    _type: 'userDecision',
    ...b,
    context: str(raw.context),
    decision: str(raw.decision),
    reason: str(raw.reason),
    priority: num(raw.priority),
    source: normalizeSourceRef(raw.source),
  };
}

function docList<T>(
  value: unknown,
  normalize: (row: RawDoc, sources: SourceDoc[]) => T | null,
  sources: SourceDoc[],
): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    if (isRecord(entry)) {
      const doc = normalize(entry, sources);
      if (doc !== null) out.push(doc);
    }
  }
  return out;
}

/* ---- retrieval -------------------------------------------------------------- */

async function queryRows(mcp: ContextMcp, query: string): Promise<RawDoc[]> {
  const rows = await mcp.queryGroq(query);
  return rows.filter(isRecord);
}

async function single<T>(
  mcp: ContextMcp,
  query: string,
  normalize: (row: RawDoc, sources: SourceDoc[]) => T | null,
  sources: SourceDoc[],
): Promise<T | null> {
  const rows = await queryRows(mcp, query);
  for (const row of rows) {
    const doc = normalize(row, sources);
    if (doc !== null) return doc;
  }
  return null;
}

/**
 * Retrieve the structured knowledge relevant to a transformation request.
 * Runs a bounded set of targeted GROQ queries and returns normalized,
 * priority-sorted rules with full source provenance.
 */
export async function retrieveKnowledge(
  mcp: ContextMcp,
  request: RetrievalRequest,
): Promise<RetrievalResult> {
  try {
    const sources: SourceDoc[] = [];

    const [contentType, level, tone, patterns, typePreservation, decisions] = await Promise.all([
      single(mcp, contentBySlugQuery(request.contentTypeSlug), normalizeContentType, sources),
      single(mcp, levelBySlugQuery(request.levelSlug), normalizeLevel, sources),
      single(mcp, toneBySlugQuery(request.toneSlug), normalizeTone, sources),
      queryRows(mcp, patternsForTypeQuery(request.contentTypeSlug)).then((rows) =>
        docList(rows, normalizePattern, sources),
      ),
      queryRows(mcp, preservationForTypeQuery(request.contentTypeSlug)).then((rows) =>
        docList(rows, normalizePreservation, sources),
      ),
      queryRows(mcp, userDecisionsQuery()).then((rows) =>
        docList(rows, normalizeUserDecision, sources),
      ),
    ]);

    const patternIds = patterns.map((pattern) => pattern._id);

    const [patternRules, typeRules] = await Promise.all([
      patternIds.length > 0
        ? queryRows(mcp, rulesForPatternsQuery(patternIds)).then((rows) =>
            docList(rows, normalizeTransformation, sources),
          )
        : Promise.resolve([] as TransformationRuleDoc[]),
      queryRows(mcp, rulesForTypeQuery(request.contentTypeSlug)).then((rows) =>
        docList(rows, normalizeTransformation, sources),
      ),
    ]);

    const transformationRules = mergeByPriority<TransformationRuleDoc>([
      ...(level?.transformationRules ?? []),
      ...(tone?.transformationRules ?? []),
      ...patternRules,
      ...typeRules,
    ]);

    const preservationRules = mergeByPriority<PreservationRuleDoc>([
      ...(level?.preservationRules ?? []),
      ...(tone?.preservationRules ?? []),
      ...typePreservation,
      ...transformationRules.flatMap((rule) => rule.preservationRules ?? []),
    ]);

    return {
      contentType,
      humanizationLevel: level,
      tone,
      patterns,
      transformationRules,
      preservationRules,
      sources,
      userDecisions: decisions,
    };
  } catch (error) {
    if (error instanceof KnowledgeRetrievalError) throw error;
    const cause = error instanceof Error ? error.message : String(error);
    throw new KnowledgeRetrievalError(
      `Could not retrieve knowledge from the Context MCP: ${cause}`,
      'Check the Context MCP configuration with `unscript doctor`.',
    );
  }
}

/** List type rows for the interactive content type / tone / level selectors. */
export async function listTypeChoices(
  mcp: ContextMcp,
  type: 'contentType' | 'toneRule' | 'humanizationLevel',
): Promise<TypeChoice[]> {
  const rows = await queryRows(mcp, typeChoicesQuery(type));
  const choices: TypeChoice[] = [];
  for (const row of rows) {
    const title = str(row.title);
    const slug = str(row.slug);
    const id = str(row._id);
    if (title === undefined || slug === undefined || id === undefined) continue;
    choices.push({ _id: id, title, slug, description: str(row.description) });
  }
  return choices.sort((a, b) => a.title.localeCompare(b.title));
}
