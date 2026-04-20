import { describe, expect, it } from "vitest";
import {
  buildSyncIncidentDescriptor,
  deriveOperationalSyncState,
  type SyncIncidentSummary,
} from "@/lib/sync/incidents";
import type { SyncRepairRecommendation } from "@/lib/sync/repair-planner";

function buildRecommendation(
  overrides: Partial<SyncRepairRecommendation> = {},
): SyncRepairRecommendation {
  return {
    businessId: "biz-1",
    businessName: "TheSwaf",
    blockerClass: "queue_blocked",
    recommendedAction: "reschedule",
    reason: "Queued work exists without an active lease.",
    beforeEvidence: {
      queueDepth: 12,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
      staleLeasePartitions: 0,
      truthReady: false,
      stallFingerprints: ["checkpoint_not_advancing"],
    },
    expectedOutcome: "Queued work is re-admitted.",
    safetyClassification: "safe_idempotent",
    ...overrides,
  };
}

function buildIncidentSummary(
  overrides: Partial<SyncIncidentSummary> = {},
): SyncIncidentSummary {
  return {
    openCount: 0,
    openCircuitCount: 0,
    latestSeenAt: null,
    degradedServing: false,
    counts: {
      detected: 0,
      eligible: 0,
      repairing: 0,
      cooldown: 0,
      half_open: 0,
      cleared: 0,
      quarantined: 0,
      exhausted: 0,
      manual_required: 0,
    },
    ...overrides,
  };
}

describe("sync incidents helpers", () => {
  it("maps replay_dead_letter to a global dead-letter fault class", () => {
    const descriptor = buildSyncIncidentDescriptor(
      buildRecommendation({
        recommendedAction: "replay_dead_letter",
        safetyClassification: "safe_guarded",
        beforeEvidence: {
          deadLetterPartitions: 2,
          queueDepth: 4,
          truthReady: false,
        },
      }),
    );

    expect(descriptor.resourceScope).toBe("business");
    expect(descriptor.faultClass).toBe("dead_letter_backlog");
    expect(descriptor.repairClass).toBe("queue_repair");
    expect(descriptor.faultSignature).toContain("\"recommendedAction\":\"replay_dead_letter\"");
  });

  it("derives exhausted as the top operational state", () => {
    const state = deriveOperationalSyncState({
      releaseGateVerdict: "blocked",
      recommendationCount: 2,
      incidentSummary: buildIncidentSummary({
        openCount: 3,
        openCircuitCount: 1,
        degradedServing: true,
        counts: {
          detected: 0,
          eligible: 1,
          repairing: 0,
          cooldown: 0,
          half_open: 0,
          cleared: 0,
          quarantined: 0,
          exhausted: 1,
          manual_required: 0,
        },
      }),
    });

    expect(state).toBe("exhausted");
  });

  it("falls back to healthy when there are no open incidents", () => {
    const state = deriveOperationalSyncState({
      releaseGateVerdict: "pass",
      recommendationCount: 0,
      incidentSummary: buildIncidentSummary(),
    });

    expect(state).toBe("healthy");
  });
});
