import type { RuleConflict } from '../knowledge/types.js';
import type { PreservationReport } from '../transformation/preservation.js';

/** A transformation request submitted by the CLI. */
export interface TransformRequest {
  text: string;
  contentTypeSlug: string;
  toneSlug: string;
  levelSlug: string;
}

/** Compact summary of which knowledge influenced the transformation. */
export interface AppliedKnowledge {
  contentTypeTitle: string | null;
  toneTitle: string | null;
  levelTitle: string | null;
  ruleIds: string[];
  preservationRuleIds: string[];
  patternIds: string[];
  sourceCount: number;
  conflictCount: number;
}

/** Provenance for one knowledge item that influenced the result. */
export interface ProvenanceEntry {
  id: string;
  slug?: string;
  title: string;
  kind: string;
  source?: { id: string; name?: string; url?: string };
}

export interface TransformationResult {
  /** The original text as submitted, echoed back for display. */
  requestText: string;
  transformedText: string;
  notes: string[];
  applied: AppliedKnowledge;
  preservation: PreservationReport;
  conflicts: RuleConflict[];
  provenance: ProvenanceEntry[];
  elapsedMs: number;
}
