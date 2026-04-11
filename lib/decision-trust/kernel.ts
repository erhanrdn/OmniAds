import type {
  DecisionEntityState,
  DecisionEvidenceCompleteness,
  DecisionEvidenceEnvelope,
  DecisionFreshnessMetadata,
  DecisionFreshnessState,
  DecisionMaterialityState,
  DecisionOperatorDisposition,
  DecisionSurfaceLane,
  DecisionTrustMetadata,
  DecisionTruthState,
} from "@/src/types/decision-trust";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeDecisionReasons(
  reasons: Array<string | null | undefined>,
) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawReason of reasons) {
    const reason = rawReason?.trim();
    if (!reason || seen.has(reason)) continue;
    seen.add(reason);
    normalized.push(reason);
  }

  return normalized;
}

export function buildDecisionFreshness(input?: {
  status?: DecisionFreshnessState;
  updatedAt?: string | null;
  reason?: string | null;
}): DecisionFreshnessMetadata {
  return {
    status: input?.status ?? "fresh",
    updatedAt: input?.updatedAt ?? null,
    reason: input?.reason ?? null,
  };
}

export function classifyDecisionEntityState(input: {
  status?: string | null;
  explicitRetired?: boolean;
  stale?: boolean;
  spend?: number | null;
}) {
  if (input.explicitRetired) return "retired" satisfies DecisionEntityState;
  if (input.stale) return "stale" satisfies DecisionEntityState;

  const normalizedStatus = normalizeText(input.status);
  if (
    normalizedStatus.includes("retired") ||
    normalizedStatus.includes("archived") ||
    normalizedStatus.includes("deleted") ||
    normalizedStatus.includes("removed")
  ) {
    return "retired" satisfies DecisionEntityState;
  }
  if (
    normalizedStatus.length > 0 &&
    normalizedStatus !== "active" &&
    normalizedStatus !== "enabled"
  ) {
    return "paused" satisfies DecisionEntityState;
  }
  if ((input.spend ?? 0) <= 0 && normalizedStatus.length === 0) {
    return "inactive" satisfies DecisionEntityState;
  }
  return "active" satisfies DecisionEntityState;
}

export function classifyDecisionMateriality(input: {
  spend: number;
  purchases: number;
  impressions: number;
  archiveSpendThreshold: number;
  archiveImpressionThreshold: number;
  thinSignalSpendThreshold: number;
  thinSignalPurchaseThreshold: number;
}) {
  if (
    input.spend <= 0 ||
    (input.spend < input.archiveSpendThreshold &&
      input.purchases === 0 &&
      input.impressions < input.archiveImpressionThreshold)
  ) {
    return "immaterial" satisfies DecisionMaterialityState;
  }
  if (
    input.spend < input.thinSignalSpendThreshold ||
    input.purchases < input.thinSignalPurchaseThreshold
  ) {
    return "thin_signal" satisfies DecisionMaterialityState;
  }
  return "material" satisfies DecisionMaterialityState;
}

export function deriveDecisionEvidenceCompleteness(input: {
  missingInputs?: string[];
  explicit?: DecisionEvidenceCompleteness;
}) {
  if (input.explicit) return input.explicit;
  const missingCount = input.missingInputs?.length ?? 0;
  if (missingCount === 0) return "complete" satisfies DecisionEvidenceCompleteness;
  if (missingCount >= 3) return "missing" satisfies DecisionEvidenceCompleteness;
  return "partial" satisfies DecisionEvidenceCompleteness;
}

export function buildDecisionEvidenceEnvelope(input?: {
  entityState?: DecisionEntityState;
  materiality?: DecisionMaterialityState;
  completeness?: DecisionEvidenceCompleteness;
  freshness?: DecisionFreshnessMetadata;
  suppressed?: boolean;
  suppressionReasons?: Array<string | null | undefined>;
  aggressiveActionBlocked?: boolean;
  aggressiveActionBlockReasons?: Array<string | null | undefined>;
}): DecisionEvidenceEnvelope {
  return {
    entityState: input?.entityState ?? "active",
    materiality: input?.materiality ?? "material",
    completeness: input?.completeness ?? "complete",
    freshness: input?.freshness ?? buildDecisionFreshness(),
    suppressed: input?.suppressed ?? false,
    suppressionReasons: normalizeDecisionReasons(input?.suppressionReasons ?? []),
    aggressiveActionBlocked: input?.aggressiveActionBlocked ?? false,
    aggressiveActionBlockReasons: normalizeDecisionReasons(
      input?.aggressiveActionBlockReasons ?? [],
    ),
  };
}

export function buildDecisionTrust(input: {
  surfaceLane: DecisionSurfaceLane;
  truthState: DecisionTruthState;
  operatorDisposition: DecisionOperatorDisposition;
  reasons: Array<string | null | undefined>;
  evidence?: DecisionEvidenceEnvelope | null;
}): DecisionTrustMetadata {
  return {
    surfaceLane: input.surfaceLane,
    truthState: input.truthState,
    operatorDisposition: input.operatorDisposition,
    reasons: normalizeDecisionReasons(input.reasons),
    evidence: input.evidence ?? undefined,
  };
}
