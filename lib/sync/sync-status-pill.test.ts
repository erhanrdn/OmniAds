import { describe, expect, it } from "vitest";
import {
  resolveGoogleAdsSyncStatusPill,
  resolveMetaSyncStatusPill,
} from "@/lib/sync/sync-status-pill";

describe("sync status pill resolver", () => {
  it("renders a syncing pill for Meta when progress is visible", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "syncing",
        pageReadiness: {
          state: "syncing",
          usable: false,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Campaign warehouse data is still being prepared for the selected range.",
          missingRequiredSurfaces: ["campaigns"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
        warehouse: {
          coverage: {
            selectedRange: {
              completedDays: 82,
              totalDays: 100,
            },
          },
        },
        latestSync: { progressPercent: 82 },
      } as never)
    ).toMatchObject({
      label: "82% Preparing range",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders an active pill for ready Meta", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "ready",
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("renders a syncing pill for partial Meta page readiness when selected-range progress exists", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "ready",
        pageReadiness: {
          state: "partial",
          usable: true,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Breakdowns are still preparing.",
          missingRequiredSurfaces: ["breakdowns.age"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
        warehouse: {
          coverage: {
            selectedRange: {
              completedDays: 72,
              totalDays: 100,
            },
          },
        },
        latestSync: { progressPercent: 72 },
      } as never)
    ).toMatchObject({
      label: "72% Preparing range",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders an attention pill when page readiness is blocked", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "ready",
        pageReadiness: {
          state: "blocked",
          usable: false,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Breakdown data is only supported from 2026-01-01 onward for the selected range.",
          missingRequiredSurfaces: ["breakdowns.age"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("renders an attention pill for Meta blockers without reliable progress", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "paused",
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("prefers Meta attention state over 100 percent progress", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "stale",
        latestSync: { progressPercent: 100 },
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("renders an active pill for Meta when page readiness is ready despite background backlog", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "syncing",
        pageReadiness: {
          state: "ready",
          usable: true,
          complete: true,
          selectedRangeMode: "historical_warehouse",
          reason: null,
          missingRequiredSurfaces: [],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
        latestSync: { progressPercent: 95 },
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("renders a core-ready pill for Meta when summary and campaigns are ready but breakdowns still lag", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "syncing",
        coreReadiness: {
          state: "ready",
          usable: true,
          complete: true,
          percent: 100,
          reason: null,
          summary: "Summary and campaign data are ready.",
          missingSurfaces: [],
          blockedSurfaces: [],
          surfaces: {
            summary: {
              state: "ready",
              blocking: false,
              countsForPageCompleteness: true,
              truthClass: "historical_warehouse",
              reason: null,
            },
            campaigns: {
              state: "ready",
              blocking: false,
              countsForPageCompleteness: true,
              truthClass: "historical_warehouse",
              reason: null,
            },
          },
        },
        extendedCompleteness: {
          state: "syncing",
          complete: false,
          percent: 33,
          reason: "Breakdowns are still preparing.",
          summary: "Breakdowns are still preparing.",
          missingSurfaces: [
            "breakdowns.age",
            "breakdowns.location",
            "breakdowns.placement",
          ],
          blockedSurfaces: [],
          surfaces: {
            "breakdowns.age": {
              state: "syncing",
              blocking: true,
              countsForPageCompleteness: true,
              truthClass: "historical_warehouse",
              reason: "Breakdowns are still preparing.",
            },
            "breakdowns.location": {
              state: "syncing",
              blocking: true,
              countsForPageCompleteness: true,
              truthClass: "historical_warehouse",
              reason: "Breakdowns are still preparing.",
            },
            "breakdowns.placement": {
              state: "syncing",
              blocking: true,
              countsForPageCompleteness: true,
              truthClass: "historical_warehouse",
              reason: "Breakdowns are still preparing.",
            },
          },
        },
        pageReadiness: {
          state: "partial",
          usable: true,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Breakdowns are still preparing.",
          missingRequiredSurfaces: ["breakdowns.age"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
        latestSync: { progressPercent: 100 },
      } as never)
    ).toMatchObject({
      label: "Core ready",
      tone: "success",
      state: "active",
    });
  });

  it("renders a syncing pill for Google Ads when advisor progress is visible", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "syncing",
        advisorProgress: {
          visible: true,
          percent: 64,
          summary: "Preparing",
        },
      } as never)
    ).toMatchObject({
      label: "64% Syncing",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders a core-live pill for Google Ads when core data is usable despite advisor backlog", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "advisor_not_ready",
        panel: {
          coreUsable: true,
          extendedLimited: true,
          headline: "Core metrics are live.",
          detail: "Extended sync continues.",
          surfaceStates: [],
        },
        advisorProgress: {
          visible: true,
          percent: 33,
          summary: "Preparing",
        },
      } as never)
    ).toMatchObject({
      label: "33% Preparing 90-day support",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders an active pill for ready Google Ads", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "ready",
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("prefers shared control-plane closure for Google Ads even when provider-local state lags", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "action_required",
        blockerClass: "none",
        operations: {
          progressState: "blocked",
        },
        controlPlanePersistence: {
          identity: {
            buildId: "build-1",
            environment: "production",
            providerScope: "google_ads",
          },
          exact: {
            deployGate: null,
            releaseGate: null,
            repairPlan: null,
          },
          fallbackByBuild: {
            deployGate: null,
            releaseGate: null,
            repairPlan: null,
          },
          latest: {
            deployGate: null,
            releaseGate: null,
            repairPlan: null,
          },
          missingExact: [],
          exactRowsPresent: true,
        },
        releaseGate: {
          id: "gate-1",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "pass",
          verdict: "pass",
          blockerClass: null,
          summary: "passed",
          breakGlass: false,
          overrideReason: null,
          evidence: {},
          emittedAt: "2026-04-20T07:22:20.362Z",
        },
        repairPlan: {
          id: "plan-1",
          buildId: "build-1",
          environment: "production",
          providerScope: "google_ads",
          planMode: "dry_run",
          eligible: true,
          blockedReason: null,
          breakGlass: false,
          summary: "no recommendations",
          recommendations: [],
          emittedAt: "2026-04-20T07:22:20.672Z",
        },
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("renders an attention pill for stale Google Ads status", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "stale",
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("does not present advisor_not_ready as a blocking attention state", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "advisor_not_ready",
        advisorProgress: {
          visible: true,
          percent: 100,
          summary: "Preparing",
        },
      } as never)
    ).toMatchObject({
      label: "99% Preparing 90-day support",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders a partially ready pill for Google Ads when extended selected-range surfaces lag", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "partial",
        advisorProgress: {
          visible: true,
          percent: 72,
          summary: "Preparing",
        },
      } as never)
    ).toMatchObject({
      label: "72% Partially ready",
      tone: "info",
      state: "syncing",
    });
  });

  it("prefers historical Google coverage over selected-range coverage for generic sync percent", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "syncing",
        warehouse: {
          coverage: {
            selectedRange: {
              completedDays: 7,
              totalDays: 7,
            },
            historical: {
              completedDays: 42,
              totalDays: 84,
            },
          },
        },
      } as never)
    ).toMatchObject({
      label: "50% Syncing",
      tone: "info",
      state: "syncing",
    });
  });
});
