import type {
  DecisionEvidenceCompleteness,
  DecisionFreshnessMetadata,
  DecisionSurfaceAuthority,
  DecisionTruthState,
} from "@/src/types/decision-trust";
import {
  buildDecisionFreshness,
  normalizeDecisionReasons,
} from "@/lib/decision-trust/kernel";

export function buildDecisionSurfaceAuthority(input: {
  scope: string;
  truthState: DecisionTruthState;
  completeness: DecisionEvidenceCompleteness;
  freshness?: DecisionFreshnessMetadata;
  missingInputs?: string[];
  reasons?: string[];
  actionCoreCount: number;
  watchlistCount: number;
  archiveCount: number;
  suppressedCount?: number;
  note: string;
}): DecisionSurfaceAuthority {
  return {
    scope: input.scope,
    truthState: input.truthState,
    completeness: input.completeness,
    freshness: input.freshness ?? buildDecisionFreshness(),
    missingInputs: normalizeDecisionReasons(input.missingInputs ?? []),
    reasons: normalizeDecisionReasons(input.reasons ?? []),
    actionCoreCount: input.actionCoreCount,
    watchlistCount: input.watchlistCount,
    archiveCount: input.archiveCount,
    suppressedCount: input.suppressedCount ?? input.watchlistCount + input.archiveCount,
    note: input.note,
  };
}
