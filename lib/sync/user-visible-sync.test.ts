import { describe, expect, it } from "vitest";
import {
  deriveGoogleUserVisibleSyncState,
  deriveMetaUserVisibleSyncState,
} from "@/lib/sync/user-visible-sync";

describe("user-visible sync state", () => {
  it("keeps Meta on latest available data for recoverable repair plans", () => {
    const state = deriveMetaUserVisibleSyncState({
      connected: true,
      assignedAccountIds: ["act_1"],
      controlPlanePersistence: {
        exactRowsPresent: true,
      },
      coreReadiness: {
        usable: true,
      },
      releaseGate: {
        verdict: "blocked",
      },
      syncTruthState: "blocked",
      repairPlan: {
        recommendations: [
          {
            safetyClassification: "safe_guarded",
          },
        ],
      },
    } as never);

    expect(state).toMatchObject({
      kind: "refreshing_in_background",
      suppressRecoverableAttention: true,
      degradedServing: true,
    });
  });

  it("does not mark Meta healthy when exact control-plane rows are missing", () => {
    const state = deriveMetaUserVisibleSyncState({
      connected: true,
      assignedAccountIds: ["act_1"],
      controlPlanePersistence: {
        exactRowsPresent: false,
      },
      coreReadiness: {
        usable: true,
      },
      releaseGate: {
        verdict: "pass",
      },
      syncTruthState: "ready",
      blockerClass: "none",
      repairPlan: {
        recommendations: [],
      },
    } as never);

    expect(state).toMatchObject({
      kind: "using_latest_available_data",
      suppressRecoverableAttention: false,
      degradedServing: true,
    });
  });

  it("treats Google as healthy when the scoped control plane is closed", () => {
    const state = deriveGoogleUserVisibleSyncState({
      connected: true,
      assignedAccountIds: ["acc_1"],
      controlPlanePersistence: {
        exactRowsPresent: true,
      },
      releaseGate: {
        verdict: "pass",
      },
      repairPlan: {
        recommendations: [],
      },
      blockerClass: "none",
      syncTruthState: "ready",
      panel: {
        coreUsable: true,
      },
      domains: {
        core: {
          state: "ready",
        },
      },
    } as never);

    expect(state).toMatchObject({
      kind: "healthy",
      label: "Active",
      degradedServing: false,
    });
  });

  it("suppresses Google release-gate attention when only background backfill is incomplete", () => {
    const state = deriveGoogleUserVisibleSyncState({
      connected: true,
      assignedAccountIds: ["acc_1"],
      controlPlanePersistence: {
        exactRowsPresent: true,
      },
      releaseGate: {
        verdict: "blocked",
        blockerClass: "not_release_ready",
      },
      repairPlan: {
        recommendations: [],
      },
      blockerClass: "not_release_ready",
      syncTruthState: "partial",
      panel: {
        coreUsable: true,
      },
      domains: {
        core: {
          state: "ready",
        },
      },
      backgroundBackfill: {
        incomplete: true,
        percent: 18,
      },
    } as never);

    expect(state).toMatchObject({
      kind: "refreshing_in_background",
      label: "Refreshing in background",
      suppressRecoverableAttention: true,
      degradedServing: true,
    });
  });

  it("suppresses Google recoverable stalled backfill attention when core data is usable", () => {
    const state = deriveGoogleUserVisibleSyncState({
      connected: true,
      assignedAccountIds: ["acc_1"],
      controlPlanePersistence: {
        exactRowsPresent: true,
      },
      releaseGate: {
        verdict: "blocked",
        blockerClass: "stalled",
      },
      repairPlan: {
        recommendations: [
          {
            safetyClassification: "safe_idempotent",
          },
        ],
      },
      blockerClass: "stalled",
      syncTruthState: "stalled",
      panel: {
        coreUsable: true,
      },
      backgroundBackfill: {
        incomplete: true,
        percent: 36,
      },
    } as never);

    expect(state).toMatchObject({
      kind: "refreshing_in_background",
      suppressRecoverableAttention: true,
      degradedServing: true,
    });
  });

  it("does not suppress Google queue blockers as background backfill", () => {
    const state = deriveGoogleUserVisibleSyncState({
      connected: true,
      assignedAccountIds: ["acc_1"],
      controlPlanePersistence: {
        exactRowsPresent: true,
      },
      releaseGate: {
        verdict: "blocked",
        blockerClass: "queue_blocked",
      },
      repairPlan: {
        recommendations: [],
      },
      blockerClass: "queue_blocked",
      panel: {
        coreUsable: true,
      },
      backgroundBackfill: {
        incomplete: true,
        percent: 18,
      },
    } as never);

    expect(state).toMatchObject({
      kind: "using_latest_available_data",
      suppressRecoverableAttention: false,
    });
  });

  it("marks disconnected providers as reconnect required", () => {
    const state = deriveGoogleUserVisibleSyncState({
      connected: false,
      assignedAccountIds: [],
    } as never);

    expect(state.kind).toBe("reconnect_required");
  });
});
