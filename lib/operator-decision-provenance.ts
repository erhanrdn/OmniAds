import { createHash } from "crypto";
import type {
  OperatorAnalyticsWindow,
  OperatorDecisionProvenance,
  OperatorDecisionPushEligibility,
  OperatorDecisionSourceRowScope,
  OperatorDecisionWindow,
  OperatorDecisionWindowKey,
} from "@/src/types/operator-decision";

export type {
  OperatorDecisionProvenance,
  OperatorDecisionPushEligibility,
} from "@/src/types/operator-decision";

export const OPERATOR_DECISION_PROVENANCE_CONTRACT_VERSION =
  "operator-decision-provenance.v1" as const;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(value)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashJson(prefix: string, value: unknown) {
  return `${prefix}_${createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 24)}`;
}

export function buildOperatorEvidenceHash(value: unknown) {
  return hashJson("ev", value);
}

export function buildOperatorActionFingerprint(value: unknown) {
  return hashJson("od", value);
}

export function buildOperatorDecisionProvenance(input: {
  businessId: string;
  decisionAsOf: string;
  analyticsWindow: OperatorAnalyticsWindow;
  reportingRange?: {
    startDate: string;
    endDate: string;
  };
  sourceWindow: Pick<OperatorDecisionWindow, "key" | "startDate" | "endDate" | "role">;
  sourceRowScope: OperatorDecisionSourceRowScope;
  sourceDecisionId: string;
  recommendedAction: string;
  evidence: unknown;
  hashEvidence?: unknown;
}): OperatorDecisionProvenance {
  const evidenceInput = {
    businessId: input.businessId,
    decisionAsOf: input.decisionAsOf,
    sourceWindow: input.sourceWindow,
    sourceRowScope: input.sourceRowScope,
    sourceDecisionId: input.sourceDecisionId,
    recommendedAction: input.recommendedAction,
    evidence: input.hashEvidence ?? input.evidence,
  };
  const actionFingerprintInput = {
    businessId: input.businessId,
    decisionAsOf: input.decisionAsOf,
    sourceWindow: input.sourceWindow,
    sourceRowScope: input.sourceRowScope,
    sourceDecisionId: input.sourceDecisionId,
    recommendedAction: input.recommendedAction,
    evidenceHash: buildOperatorEvidenceHash(evidenceInput),
  };
  const evidenceHash = buildOperatorEvidenceHash(evidenceInput);
  const actionFingerprint = buildOperatorActionFingerprint(actionFingerprintInput);

  return {
    contractVersion: OPERATOR_DECISION_PROVENANCE_CONTRACT_VERSION,
    businessId: input.businessId,
    decisionAsOf: input.decisionAsOf,
    analyticsWindow: input.analyticsWindow,
    reportingRange: {
      startDate: input.reportingRange?.startDate ?? input.analyticsWindow.startDate,
      endDate: input.reportingRange?.endDate ?? input.analyticsWindow.endDate,
      role: "reporting_context",
    },
    sourceWindow: {
      key: input.sourceWindow.key as OperatorDecisionWindowKey,
      startDate: input.sourceWindow.startDate,
      endDate: input.sourceWindow.endDate,
      role: input.sourceWindow.role,
    },
    sourceRowScope: input.sourceRowScope,
    sourceDecisionId: input.sourceDecisionId,
    evidenceHash,
    actionFingerprint,
  };
}

export function buildOperatorDecisionPushEligibility(input: {
  provenance: OperatorDecisionProvenance | null | undefined;
  queueEligible: boolean;
  canApply?: boolean;
  canRollback?: boolean;
  blockedReason?: string | null;
}): OperatorDecisionPushEligibility {
  if (!input.provenance) {
    return {
      queueEligible: false,
      canApply: false,
      canRollback: false,
      level: "blocked_from_push",
      blockedReason: input.blockedReason ?? "Missing decision provenance.",
    };
  }

  if (!input.queueEligible) {
    return {
      queueEligible: false,
      canApply: false,
      canRollback: false,
      level: "operator_review_required",
      blockedReason: input.blockedReason ?? "Decision is contextual only.",
    };
  }

  return {
    queueEligible: true,
    canApply: input.canApply ?? false,
    canRollback: input.canRollback ?? false,
    level: input.canApply ? "eligible_for_push_when_enabled" : "safe_to_queue",
    blockedReason: input.blockedReason ?? null,
  };
}
