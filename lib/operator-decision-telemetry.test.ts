import { describe, expect, it, vi } from "vitest";
import {
  buildOperatorDecisionTelemetryAggregate,
  buildOperatorDecisionTelemetryEvent,
  emitOperatorDecisionTelemetryEvent,
  OPERATOR_DECISION_TELEMETRY_STDOUT_ENV,
} from "@/lib/operator-decision-telemetry";
import { buildOperatorInstruction } from "@/lib/operator-prescription";
import type { OperatorPolicyAssessment } from "@/src/types/operator-decision";

function policy(
  overrides: Partial<OperatorPolicyAssessment> = {},
): OperatorPolicyAssessment {
  return {
    contractVersion: "operator-policy.v1",
    state: "blocked",
    actionClass: "scale",
    pushReadiness: "blocked_from_push",
    queueEligible: false,
    canApply: false,
    reasons: ["Evidence is blocked."],
    blockers: ["Commercial truth is missing for business biz_sensitive_123."],
    missingEvidence: ["target CPA", "margin profile"],
    requiredEvidence: ["commercial_truth"],
    explanation: "Do not act until commercial truth is configured.",
    ...overrides,
  };
}

describe("operator decision telemetry staging", () => {
  it("builds an allowlisted event with policy version, fingerprint, and safe missing evidence", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({ state: "blocked" }),
      policyVersion: "creative-operator-policy.v1",
      targetScope: "creative",
      targetEntity: "Sensitive Hook Winner",
      parentEntity: "Sensitive Family",
      actionLabel: "Scale",
      reason: "Do not act until commercial truth is configured.",
      confidenceScore: 0.9,
      evidenceSource: "live",
      evidenceHash: "ev_safehash",
      actionFingerprint: "od_safefingerprint",
    });

    const event = buildOperatorDecisionTelemetryEvent({
      instruction,
      emittedAt: "2026-04-22T00:00:00.000Z",
    });

    expect(event).toMatchObject({
      contractVersion: "operator-decision-telemetry-event.v1",
      telemetryContractVersion: "operator-decision-telemetry.v1",
      eventName: "instruction_rendered",
      policyVersion: "creative-operator-policy.v1",
      sourceSystem: "creative",
      sourceSurface: "creative_decision_os",
      instructionKind: "blocked",
      pushReadiness: "blocked_from_push",
      blockedReason: "policy_blocker",
      actionFingerprint: "od_safefingerprint",
      evidenceHash: "ev_safehash",
    });
    expect(event.missingEvidence).toEqual(["target_cpa", "margin_profile"]);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("Sensitive Hook Winner");
    expect(serialized).not.toContain("Sensitive Family");
    expect(serialized).not.toContain("biz_sensitive_123");
  });

  it("builds aggregate rollout counts without exposing pseudonymous action keys", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "meta",
      sourceLabel: "Meta Decision OS",
      policy: policy({
        state: "do_now",
        actionClass: "budget",
        pushReadiness: "safe_to_queue",
        queueEligible: true,
        blockers: [],
        missingEvidence: [],
      }),
      policyVersion: "meta-operator-policy.v1",
      targetScope: "adset",
      targetEntity: "Sensitive Ad Set",
      actionLabel: "Increase budget",
      reason: "Evidence is strong.",
      confidenceScore: 0.91,
      evidenceSource: "live",
      evidenceHash: "ev_meta",
      actionFingerprint: "od_meta",
    });
    const event = buildOperatorDecisionTelemetryEvent({ instruction });
    const aggregate = buildOperatorDecisionTelemetryAggregate([event]);

    expect(aggregate).toMatchObject({
      contractVersion: "operator-decision-telemetry-aggregate.v1",
      eventCount: 1,
      sourceSystemCounts: { meta: 1 },
      instructionKindCounts: { do_now: 1 },
      pushReadinessCounts: { safe_to_queue: 1 },
      amountGuidanceCounts: { unavailable: 1 },
    });
    expect(JSON.stringify(aggregate)).not.toContain("od_meta");
    expect(JSON.stringify(aggregate)).not.toContain("ev_meta");
    expect(JSON.stringify(aggregate)).not.toContain("Sensitive Ad Set");
  });

  it("does not emit runtime logs unless the stdout sink is explicitly enabled", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy(),
      targetScope: "creative",
      targetEntity: "Quiet Creative",
      actionLabel: "Context only",
      reason: "Blocked.",
      confidenceScore: 0.5,
      evidenceSource: "snapshot",
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    emitOperatorDecisionTelemetryEvent({
      instruction,
      env: { [OPERATOR_DECISION_TELEMETRY_STDOUT_ENV]: "0" },
    });
    expect(infoSpy).not.toHaveBeenCalled();

    emitOperatorDecisionTelemetryEvent({
      instruction,
      env: { [OPERATOR_DECISION_TELEMETRY_STDOUT_ENV]: "1" },
    });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    infoSpy.mockRestore();
  });

  it("normalizes unknown evidence source strings before export", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy(),
      targetScope: "creative",
      targetEntity: "Opaque Creative",
      actionLabel: "Context only",
      reason: "Blocked.",
      confidenceScore: 0.5,
      evidenceSource: "provider-account-123" as "live",
    });

    const event = buildOperatorDecisionTelemetryEvent({ instruction });

    expect(event.evidenceSource).toBe("unknown");
    expect(JSON.stringify(event)).not.toContain("provider-account-123");
  });
});
