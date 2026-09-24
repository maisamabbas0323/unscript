import type { RetrievalRequest, RetrievalResult } from '../knowledge/retrieval.js';
import type {
  ContentTypeDoc,
  HumanizationLevelDoc,
  RuleConflict,
  SourceDoc,
  ToneRuleDoc,
  TransformationRuleDoc,
  UserDecisionDoc,
  WritingPatternDoc,
  PreservationRuleDoc,
} from '../knowledge/types.js';

/**
 * Agent context assembly.
 *
 * Turns raw retrieval results into a normalized, traceable context for the
 * transformation pipeline: rules sorted by their documented priorities,
 * conflicts detected from the retrieved rules' own `conflictsWith`
 * references (never invented), and provenance kept on every item.
 */

export interface AgentContext {
  request: RetrievalRequest;
  contentType: ContentTypeDoc | null;
  humanizationLevel: HumanizationLevelDoc | null;
  tone: ToneRuleDoc | null;
  patterns: WritingPatternDoc[];
  /** Sorted by priority descending (documented: higher runs first). */
  transformationRules: TransformationRuleDoc[];
  /** Sorted by priority descending (documented: higher weight wins). */
  preservationRules: PreservationRuleDoc[];
  sources: SourceDoc[];
  userDecisions: UserDecisionDoc[];
  conflicts: RuleConflict[];
}

/**
 * Detect conflicts between applicable transformation rules using the
 * rules' own `conflictsWith` references. A conflict is relevant only when
 * BOTH rules are applicable; the pair is then reported once.
 */
export function detectRuleConflicts(rules: TransformationRuleDoc[]): RuleConflict[] {
  const byId = new Map<string, TransformationRuleDoc>();
  for (const rule of rules) byId.set(rule._id, rule);

  const reported = new Set<string>();
  const conflicts: RuleConflict[] = [];

  for (const rule of rules) {
    for (const other of rule.conflictsWith ?? []) {
      const otherDoc = byId.get(other._id);
      if (otherDoc === undefined) continue;
      const key = [rule._id, other._id].sort().join('|');
      if (reported.has(key)) continue;
      reported.add(key);

      const priorityA = rule.priority ?? 0;
      const priorityB = otherDoc.priority ?? 0;
      const resolved = priorityA !== priorityB;

      conflicts.push({
        ruleId: rule._id,
        ruleSlug: rule.slug,
        ruleTitle: rule.title,
        rulePriority: rule.priority,
        conflictsWithId: otherDoc._id,
        conflictsWithSlug: otherDoc.slug,
        conflictsWithTitle: otherDoc.title,
        conflictsWithPriority: otherDoc.priority,
        resolution: resolved ? 'priority' : 'unresolved',
        detail: resolved
          ? `Rule "${rule.title}" (priority ${priorityA}) and rule "${otherDoc.title}" (priority ${priorityB}) conflict; the higher priority runs first.`
          : `Rules "${rule.title}" and "${otherDoc.title}" both have priority ${priorityA}; the knowledge base does not resolve this conflict automatically.`,
      });
    }
  }

  return conflicts.sort(
    (a, b) =>
      Math.max(b.rulePriority ?? 0, b.conflictsWithPriority ?? 0) -
      Math.max(a.rulePriority ?? 0, a.conflictsWithPriority ?? 0),
  );
}

/** Assemble the normalized agent context from retrieval results. */
export function assembleAgentContext(
  request: RetrievalRequest,
  retrieval: RetrievalResult,
): AgentContext {
  return {
    request,
    contentType: retrieval.contentType,
    humanizationLevel: retrieval.humanizationLevel,
    tone: retrieval.tone,
    patterns: retrieval.patterns,
    transformationRules: retrieval.transformationRules,
    preservationRules: retrieval.preservationRules,
    sources: retrieval.sources,
    userDecisions: retrieval.userDecisions,
    conflicts: detectRuleConflicts(retrieval.transformationRules),
  };
}
