import { assembleAgentContext } from './context.js';
import { TransformationError } from './errors.js';
import type {
  AppliedKnowledge,
  ProvenanceEntry,
  TransformationResult,
  TransformRequest,
} from './types.js';
import type { ContextMcp } from '../mcp/contextMcp.js';
import type { GeminiClient } from '../gemini/client.js';
import { retrieveKnowledge } from '../knowledge/retrieval.js';
import type { RetrievalRequest } from '../knowledge/retrieval.js';
import type { SourceRef, TransformationRuleDoc, WritingPatternDoc } from '../knowledge/types.js';
import { validatePreservation } from '../transformation/preservation.js';
import { buildSystemInstruction, callTransformation } from '../transformation/transform.js';
import { debugLog } from '../utils/log.js';

/**
 * Agent orchestrator: the real runtime flow.
 *
 *   CLI → parse request → Context MCP → retrieve knowledge → assemble
 *   context → detect conflicts → Gemini (language engine) → deterministic
 *   preservation validation → result
 *
 * Sanity is the policy layer; Gemini transforms language. The agent never
 * lets Gemini invent writing rules and never bypasses Sanity.
 */

export interface AgentDeps {
  mcp: ContextMcp;
  gemini: GeminiClient;
}

function sourceEntry(source: SourceRef | undefined): ProvenanceEntry['source'] | undefined {
  if (source?._id === undefined) return undefined;
  return { id: source._id, name: source.name ?? source.title, url: source.url };
}

function ruleProvenance(rules: TransformationRuleDoc[]): ProvenanceEntry[] {
  return rules.map((rule) => ({
    id: rule._id,
    slug: rule.slug,
    title: rule.title,
    kind: 'transformationRule',
    source: sourceEntry(rule.source),
  }));
}

function patternProvenance(patterns: WritingPatternDoc[]): ProvenanceEntry[] {
  return patterns.map((pattern) => ({
    id: pattern._id,
    slug: pattern.slug,
    title: pattern.title,
    kind: 'writingPattern',
    source: sourceEntry(pattern.source),
  }));
}

function typeProvenance(
  label: string,
  doc: { _id: string; slug?: string; title: string; source?: SourceRef } | null,
): ProvenanceEntry[] {
  if (doc === null) return [];
  return [
    { id: doc._id, slug: doc.slug, title: doc.title, kind: label, source: sourceEntry(doc.source) },
  ];
}

function appliedSummary(
  retrieval: Awaited<ReturnType<typeof retrieveKnowledge>>,
  context: Awaited<ReturnType<typeof assembleAgentContext>>,
): AppliedKnowledge {
  return {
    contentTypeTitle: context.contentType?.title ?? null,
    toneTitle: context.tone?.title ?? null,
    levelTitle: context.humanizationLevel?.title ?? null,
    ruleIds: context.transformationRules.map((rule) => rule._id),
    preservationRuleIds: context.preservationRules.map((rule) => rule._id),
    patternIds: context.patterns.map((pattern) => pattern._id),
    sourceCount: retrieval.sources.length,
    conflictCount: context.conflicts.length,
  };
}

/**
 * Run a full transformation against real services. Throws typed errors
 * with actionable hints; never returns fabricated data. The optional
 * `onStage` callback fires at each real phase boundary so callers can
 * render live progress that maps to actual work.
 */
export type TransformationStage = 'retrieving' | 'reworking' | 'checking';

export async function runTransformation(
  deps: AgentDeps,
  request: TransformRequest,
  onStage?: (stage: TransformationStage) => void,
): Promise<TransformationResult> {
  const startedAt = Date.now();
  const retrievalRequest: RetrievalRequest = {
    contentTypeSlug: request.contentTypeSlug,
    toneSlug: request.toneSlug,
    levelSlug: request.levelSlug,
  };

  debugLog('retrieving knowledge from Context MCP', retrievalRequest);
  onStage?.('retrieving');
  const retrieval = await retrieveKnowledge(deps.mcp, retrievalRequest);
  const context = assembleAgentContext(retrievalRequest, retrieval);

  const sliders = [context.contentType, context.humanizationLevel, context.tone];
  const missingLabels = ['content type', 'humanization level', 'tone'].filter(
    (_, index) => sliders[index] === null,
  );
  if (missingLabels.length > 0) {
    throw new TransformationError(
      `Knowledge for this request is incomplete: ${missingLabels.join(', ')} not found in the dataset.`,
      `Check that slugs "${request.contentTypeSlug}", "${request.levelSlug}", "${request.toneSlug}" exist in Sanity.`,
    );
  }

  debugLog(
    `context assembled: rules=${context.transformationRules.length} conflicts=${context.conflicts.length}`,
  );

  const systemInstruction = buildSystemInstruction(context);
  onStage?.('reworking');
  const payload = await callTransformation(deps.gemini, systemInstruction, request.text);

  onStage?.('checking');
  const preservation = validatePreservation(request.text, payload.transformedText);
  debugLog(
    `preservation: checked=${preservation.checked} changed=${preservation.changedProtectedItems.length}`,
  );

  const provenance: ProvenanceEntry[] = [
    ...typeProvenance('contentType', context.contentType),
    ...typeProvenance('humanizationLevel', context.humanizationLevel),
    ...typeProvenance('toneRule', context.tone),
    ...ruleProvenance(context.transformationRules),
    ...patternProvenance(context.patterns),
  ];

  const notes = [...(payload.notes ?? [])];
  if (preservation.changedProtectedItems.length > 0) {
    notes.push(
      `Preservation check found ${preservation.changedProtectedItems.length} item(s) that appear changed: ` +
        preservation.changedProtectedItems.map((item) => `${item.value} (${item.kind})`).join(', '),
    );
  }
  if (context.conflicts.length > 0) {
    notes.push(
      `${context.conflicts.length} documented rule conflict(s) exist among the applied rules; ` +
        'the higher documented priority was followed.',
    );
  }

  return {
    requestText: request.text,
    transformedText: payload.transformedText,
    notes,
    applied: appliedSummary(retrieval, context),
    preservation,
    conflicts: context.conflicts,
    provenance,
    elapsedMs: Date.now() - startedAt,
  };
}
