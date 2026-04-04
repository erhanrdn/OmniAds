import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleAdsLaneAdmissionPolicy,
  buildGoogleAdsPrimaryLeasePlan,
  buildGoogleAdsMaintenanceLeasePlan,
  buildGoogleAdsFallbackExtendedLeasePlan,
  buildGoogleAdsLaneProgressEvidence,
  decideGoogleAdsHistoricalFrontier,
  getGoogleAdsExtendedRecoveryBlockReason,
  getGoogleAdsHistoricalFairnessLeaseLimit,
  getGoogleAdsGapPlannerBlockingStatuses,
  buildGoogleAdsWarehouseFetchPlan,
  evaluateGoogleAdsWorkerSchedulingState,
  getGoogleAdsScopeCheckpointChunkSize,
  logGoogleAdsPhaseTelemetry,
  shouldBlockGoogleAdsHistoricalExtendedWork,
  shouldLeaseGoogleAdsRecentRepair,
} from "@/lib/sync/google-ads-sync";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildGoogleAdsLaneAdmissionPolicy", () => {
  it("suspends extended lanes when safe mode is enabled", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: true,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
    });

    expect(policy.lanePolicy.core).toBe("admit");
    expect(policy.lanePolicy.maintenance).toBe("admit");
    expect(policy.lanePolicy.extended).toBe("suspended");
    expect(policy.suspendExtended).toBe(true);
  });

  it("suspends extended lanes when the global breaker is open", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: true,
      queueDepth: 10,
      extendedQueueDepth: 10,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
    expect(policy.suspendExtended).toBe(true);
  });

  it("suspends extended lanes when worker health is missing", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: false,
      workerCapacityAvailable: false,
      breakerOpen: false,
      queueDepth: 5,
      extendedQueueDepth: 2,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
    expect(policy.lanePolicy.core).toBe("admit");
  });

  it("suspends extended lanes when backlog exceeds the hard limit", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 3000,
      extendedQueueDepth: 1500,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
  });

  it("keeps extended suspended when canary reopen is not allowed", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: false,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
  });

  it("allows only recent extended recovery while breaker is half-open", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "half_open",
      quotaPressure: 0.2,
    });

    expect(policy.lanePolicy.extendedRecent).toBe("admit");
    expect(policy.lanePolicy.extendedHistorical).toBe("suspended");
    expect(policy.executionMode).toBe("extended_recovery");
  });

  it("admits historical extended replay only after recovery closes", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
      quotaPressure: 0.2,
    });

    expect(policy.lanePolicy.extendedRecent).toBe("admit");
    expect(policy.lanePolicy.extendedHistorical).toBe("admit");
    expect(policy.executionMode).toBe("extended_normal");
  });

  it("suspends maintenance when quota budget is exhausted", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      quotaPressure: 1.05,
      maintenanceBudgetAllowed: false,
      extendedBudgetAllowed: false,
      extendedCanaryEligible: true,
    });

    expect(policy.lanePolicy.core).toBe("admit");
    expect(policy.lanePolicy.maintenance).toBe("suspended");
  });
});

describe("buildGoogleAdsWarehouseFetchPlan", () => {
  it("does not require campaign fetches for search-term-only partitions", () => {
    const plan = buildGoogleAdsWarehouseFetchPlan(["search_term_daily"]);

    expect(plan.searchIntelligence).toBe(true);
    expect(plan.campaigns).toBe(false);
    expect(plan.products).toBe(false);
    expect(plan.assets).toBe(false);
  });

  it("keeps product and asset partitions isolated to their own report families", () => {
    const productPlan = buildGoogleAdsWarehouseFetchPlan(["product_daily"]);
    const assetPlan = buildGoogleAdsWarehouseFetchPlan(["asset_daily"]);

    expect(productPlan.products).toBe(true);
    expect(productPlan.campaigns).toBe(false);
    expect(productPlan.assets).toBe(false);
    expect(assetPlan.assets).toBe(true);
    expect(assetPlan.campaigns).toBe(false);
    expect(assetPlan.products).toBe(false);
  });

  it("does not require account or campaign as the primary sync scope for product and asset repairs", () => {
    const productPlan = buildGoogleAdsWarehouseFetchPlan(["product_daily"]);
    const assetPlan = buildGoogleAdsWarehouseFetchPlan(["asset_daily"]);

    expect(productPlan.products).toBe(true);
    expect(productPlan.campaigns).toBe(false);
    expect(assetPlan.assets).toBe(true);
    expect(assetPlan.campaigns).toBe(false);
  });
});

describe("Google Ads throughput telemetry", () => {
  it("uses smaller checkpoint chunks for campaign and geo scopes", () => {
    expect(getGoogleAdsScopeCheckpointChunkSize("campaign_daily")).toBeLessThan(
      getGoogleAdsScopeCheckpointChunkSize("account_daily"),
    );
    expect(getGoogleAdsScopeCheckpointChunkSize("geo_daily")).toBeLessThan(
      getGoogleAdsScopeCheckpointChunkSize("account_daily"),
    );
  });

  it("emits structured phase telemetry with campaign batch metrics", () => {
    const infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    logGoogleAdsPhaseTelemetry({
      businessId: "business-1",
      providerAccountId: "acct-1",
      date: "2026-04-04",
      primaryScope: "campaign_daily",
      fetchMs: 100,
      transformMs: 20,
      persistMs: 30,
      finalizeMs: 10,
      totalMs: 160,
      scopeMetrics: [
        {
          scope: "campaign_daily",
          rowCount: 120,
          batchCount: 1,
          chunkSize: getGoogleAdsScopeCheckpointChunkSize("campaign_daily"),
          persistedRowCount: 120,
          durationMs: 30,
        },
      ],
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "[google-ads-sync] google_ads_scope_phase_metrics",
      expect.objectContaining({
        businessId: "business-1",
        primaryScope: "campaign_daily",
        scopeMetrics: [
          expect.objectContaining({
            scope: "campaign_daily",
            rowCount: 120,
          }),
        ],
      }),
    );
  });
});

describe("decideGoogleAdsHistoricalFrontier", () => {
  it("holds older-than-90 daily history until the recent frontier is complete", () => {
    expect(
      decideGoogleAdsHistoricalFrontier({
        historicalStart: "2024-01-01",
        recent90Start: "2025-12-02",
        recent90Complete: false,
      }),
    ).toBe("2025-12-02");

    expect(
      decideGoogleAdsHistoricalFrontier({
        historicalStart: "2024-01-01",
        recent90Start: "2025-12-02",
        recent90Complete: true,
      }),
    ).toBe("2024-01-01");
  });
});

describe("shouldBlockGoogleAdsHistoricalExtendedWork", () => {
  it("blocks historical extended work until the recent 90-day frontier is complete", () => {
    expect(
      shouldBlockGoogleAdsHistoricalExtendedWork({
        recent90Complete: false,
      }),
    ).toBe(true);

    expect(
      shouldBlockGoogleAdsHistoricalExtendedWork({
        recent90Complete: true,
      }),
    ).toBe(false);
  });
});

describe("getGoogleAdsExtendedRecoveryBlockReason", () => {
  it("does not blame queued maintenance when maintenance is not actively leased", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 20,
      extendedQueueDepth: 12,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    const reason = getGoogleAdsExtendedRecoveryBlockReason({
      policy,
      queueHealth: {
        queueDepth: 20,
        leasedPartitions: 0,
        coreQueueDepth: 0,
        coreLeasedPartitions: 0,
        extendedQueueDepth: 12,
        extendedLeasedPartitions: 0,
        extendedRecentQueueDepth: 12,
        extendedRecentLeasedPartitions: 0,
        extendedHistoricalQueueDepth: 0,
        extendedHistoricalLeasedPartitions: 0,
        maintenanceQueueDepth: 4,
        maintenanceLeasedPartitions: 0,
        deadLetterPartitions: 0,
        oldestQueuedPartition: "2026-03-20",
        latestCoreActivityAt: null,
        latestExtendedActivityAt: null,
        latestMaintenanceActivityAt: null,
      },
    });

    expect(reason).toBe("queue_exists_without_eligible_lease");
  });

  it("explains when recent extended queue exists but is not leasing", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 20,
      extendedQueueDepth: 12,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    const reason = getGoogleAdsExtendedRecoveryBlockReason({
      policy,
      queueHealth: {
        queueDepth: 20,
        leasedPartitions: 0,
        coreQueueDepth: 0,
        coreLeasedPartitions: 0,
        extendedQueueDepth: 12,
        extendedLeasedPartitions: 0,
        extendedRecentQueueDepth: 12,
        extendedRecentLeasedPartitions: 0,
        extendedHistoricalQueueDepth: 0,
        extendedHistoricalLeasedPartitions: 0,
        maintenanceQueueDepth: 0,
        maintenanceLeasedPartitions: 0,
        deadLetterPartitions: 0,
        oldestQueuedPartition: "2026-03-20",
        latestCoreActivityAt: null,
        latestExtendedActivityAt: null,
        latestMaintenanceActivityAt: null,
      },
    });

    expect(reason).toBe("queue_exists_without_eligible_lease");
  });

  it("surfaces core starvation when recent extended work is queued behind core leases", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 20,
      extendedQueueDepth: 12,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    const reason = getGoogleAdsExtendedRecoveryBlockReason({
      policy,
      queueHealth: {
        queueDepth: 20,
        leasedPartitions: 1,
        coreQueueDepth: 2,
        coreLeasedPartitions: 1,
        extendedQueueDepth: 12,
        extendedLeasedPartitions: 0,
        extendedRecentQueueDepth: 12,
        extendedRecentLeasedPartitions: 0,
        extendedHistoricalQueueDepth: 0,
        extendedHistoricalLeasedPartitions: 0,
        maintenanceQueueDepth: 0,
        maintenanceLeasedPartitions: 0,
        deadLetterPartitions: 0,
        oldestQueuedPartition: "2026-03-20",
        latestCoreActivityAt: null,
        latestExtendedActivityAt: null,
        latestMaintenanceActivityAt: null,
      },
    });

    expect(reason).toBe("core_starvation");
  });

  it("surfaces maintenance replay pressure when recent extended work is queued behind maintenance leases", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 20,
      extendedQueueDepth: 12,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    const reason = getGoogleAdsExtendedRecoveryBlockReason({
      policy,
      queueHealth: {
        queueDepth: 20,
        leasedPartitions: 1,
        coreQueueDepth: 0,
        coreLeasedPartitions: 0,
        extendedQueueDepth: 12,
        extendedLeasedPartitions: 0,
        extendedRecentQueueDepth: 12,
        extendedRecentLeasedPartitions: 0,
        extendedHistoricalQueueDepth: 0,
        extendedHistoricalLeasedPartitions: 0,
        maintenanceQueueDepth: 4,
        maintenanceLeasedPartitions: 1,
        deadLetterPartitions: 0,
        oldestQueuedPartition: "2026-03-20",
        latestCoreActivityAt: null,
        latestExtendedActivityAt: null,
        latestMaintenanceActivityAt: null,
      },
    });

    expect(reason).toBe("maintenance_replay_pressure");
  });
});

describe("shouldLeaseGoogleAdsRecentRepair", () => {
  it("allows bounded recent repair leasing even when core work still exists", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 25,
      extendedQueueDepth: 8,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    expect(
      shouldLeaseGoogleAdsRecentRepair({
        policy,
        queueHealth: {
          queueDepth: 25,
          leasedPartitions: 2,
          coreQueueDepth: 4,
          coreLeasedPartitions: 2,
          extendedQueueDepth: 8,
          extendedLeasedPartitions: 0,
          extendedRecentQueueDepth: 8,
          extendedRecentLeasedPartitions: 0,
          extendedHistoricalQueueDepth: 0,
          extendedHistoricalLeasedPartitions: 0,
          maintenanceQueueDepth: 3,
          maintenanceLeasedPartitions: 0,
          deadLetterPartitions: 0,
          oldestQueuedPartition: "2026-03-25",
          latestCoreActivityAt: null,
          latestExtendedActivityAt: null,
          latestMaintenanceActivityAt: null,
        },
      }),
    ).toBe(true);
  });

  it("keeps recent repair blocked when extended recent is suspended", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 25,
      extendedQueueDepth: 8,
      extendedBudgetAllowed: false,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    expect(
      shouldLeaseGoogleAdsRecentRepair({
        policy,
        queueHealth: {
          queueDepth: 25,
          leasedPartitions: 0,
          coreQueueDepth: 0,
          coreLeasedPartitions: 0,
          extendedQueueDepth: 8,
          extendedLeasedPartitions: 0,
          extendedRecentQueueDepth: 8,
          extendedRecentLeasedPartitions: 0,
          extendedHistoricalQueueDepth: 0,
          extendedHistoricalLeasedPartitions: 0,
          maintenanceQueueDepth: 0,
          maintenanceLeasedPartitions: 0,
          deadLetterPartitions: 0,
          oldestQueuedPartition: "2026-03-25",
          latestCoreActivityAt: null,
          latestExtendedActivityAt: null,
          latestMaintenanceActivityAt: null,
        },
      }),
    ).toBe(false);
  });
});

describe("getGoogleAdsGapPlannerBlockingStatuses", () => {
  it("keeps only actively in-flight partitions as gap blockers", () => {
    expect(getGoogleAdsGapPlannerBlockingStatuses()).toEqual([
      "queued",
      "leased",
      "running",
    ]);
  });
});

describe("buildGoogleAdsLaneProgressEvidence", () => {
  it("tracks historical extended evidence on the slowest extended scope", () => {
    const evidence = buildGoogleAdsLaneProgressEvidence({
      statesByScope: {
        search_term_daily: [
          {
            completedDays: 20,
            readyThroughDate: "2026-03-25",
            latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
            updatedAt: "2026-04-02T10:00:00.000Z",
          },
        ],
        product_daily: [
          {
            completedDays: 18,
            readyThroughDate: "2026-03-22",
            latestSuccessfulSyncAt: "2026-04-02T09:40:00.000Z",
            updatedAt: "2026-04-02T09:40:00.000Z",
          },
        ],
      },
      queueHealth: {
        latestExtendedActivityAt: "2026-04-02T10:05:00.000Z",
        latestCoreActivityAt: null,
        latestMaintenanceActivityAt: null,
      } as never,
    });

    expect(evidence.extended_historical.lastCompletedAt).toBe(
      "2026-04-02T09:40:00.000Z",
    );
  });
});

describe("getGoogleAdsHistoricalFairnessLeaseLimit", () => {
  it("boosts historical fairness when historical extended advancement is stale", () => {
    const policy = {
      lanePolicy: {
        core: "admit",
        maintenance: "admit",
        extended: "admit",
        extendedRecent: "admit",
        extendedHistorical: "admit",
      },
      extendedCanaryEligible: false,
    } as ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy>;

    const limit = getGoogleAdsHistoricalFairnessLeaseLimit({
      policy,
      queueHealth: {
        extendedHistoricalQueueDepth: 6,
        extendedHistoricalLeasedPartitions: 0,
        latestExtendedActivityAt: "2026-04-02T09:00:00.000Z",
      } as never,
      progressEvidence: {
        lastCheckpointAdvancedAt: "2026-04-02T09:00:00.000Z",
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: "2026-04-02T09:00:00.000Z",
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
      nowMs: new Date("2026-04-02T09:30:00.000Z").getTime(),
    });

    expect(limit).toBe(2);
  });

  it("keeps a single fairness lease when historical extended is still moving", () => {
    const policy = {
      lanePolicy: {
        core: "admit",
        maintenance: "admit",
        extended: "admit",
        extendedRecent: "admit",
        extendedHistorical: "admit",
      },
      extendedCanaryEligible: false,
    } as ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy>;

    const limit = getGoogleAdsHistoricalFairnessLeaseLimit({
      policy,
      queueHealth: {
        extendedHistoricalQueueDepth: 6,
        extendedHistoricalLeasedPartitions: 0,
        latestExtendedActivityAt: "2026-04-02T09:25:00.000Z",
      } as never,
      progressEvidence: {
        lastCheckpointAdvancedAt: "2026-04-02T09:25:00.000Z",
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: "2026-04-02T09:25:00.000Z",
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
      nowMs: new Date("2026-04-02T09:30:00.000Z").getTime(),
    });

    expect(limit).toBe(1);
  });
});

describe("buildGoogleAdsPrimaryLeasePlan", () => {
  it("produces a deterministic lease plan from policy, priority, and evidence", () => {
    const policy = {
      lanePolicy: {
        core: "admit",
        maintenance: "admit",
        extended: "admit",
        extendedRecent: "admit",
        extendedHistorical: "admit",
      },
      suspendExtended: false,
      extendedCanaryEligible: false,
    } as ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy>;

    const plan = buildGoogleAdsPrimaryLeasePlan({
      policy,
      queueHealth: {
        extendedRecentQueueDepth: 6,
        extendedHistoricalQueueDepth: 4,
        extendedHistoricalLeasedPartitions: 0,
        latestExtendedActivityAt: "2026-04-02T09:00:00.000Z",
      } as never,
      fullSyncPriorityRequired: true,
      fullSyncPriorityTargetScopes: ["search_term_daily", "product_daily"],
      blockHistoricalExtendedWork: false,
      progressEvidence: {
        extended_historical: {
          lastCheckpointAdvancedAt: "2026-04-02T09:00:00.000Z",
          lastReadyThroughAdvancedAt: null,
          lastCompletedAt: "2026-04-02T09:00:00.000Z",
          backlogDelta: null,
          completedPartitionDelta: null,
          lastReplayAt: null,
          lastReclaimAt: null,
          recentActivityWindowMinutes: 20,
        },
      },
      nowMs: new Date("2026-04-02T09:30:00.000Z").getTime(),
    });

    expect(plan.historicalFairnessLimit).toBeGreaterThan(0);
    expect(plan.recentRepairLimit).toBeGreaterThan(0);
    expect(plan.fullSyncPriorityLimit).toBeGreaterThan(0);
  });
});

describe("buildGoogleAdsMaintenanceLeasePlan", () => {
  it("throttles maintenance while full-sync priority is active", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 10,
      extendedQueueDepth: 4,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    const plan = buildGoogleAdsMaintenanceLeasePlan({
      policy,
      fullSyncPriorityRequired: true,
    });

    expect(plan.maintenanceLimit).toBe(1);
  });
});

describe("buildGoogleAdsFallbackExtendedLeasePlan", () => {
  it("switches to recent-only fallback when historical work is blocked", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 10,
      extendedQueueDepth: 4,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
    });

    const plan = buildGoogleAdsFallbackExtendedLeasePlan({
      policy,
      fullSyncPriorityRequired: false,
      fullSyncPriorityTargetScopes: [],
      fullSyncPriorityYesterday: "2026-04-01",
      blockHistoricalExtendedWork: true,
      historicalLeaseStartDate: "2024-04-02",
    });

    expect(plan?.sourceFilter).toBe("recent_only");
    expect(plan?.startDate).toBeNull();
  });
});

describe("evaluateGoogleAdsWorkerSchedulingState", () => {
  it("does not treat a missing google heartbeat as healthy without a runner lease", () => {
    const nowMs = new Date("2026-03-29T12:00:00.000Z").getTime();
    const result = evaluateGoogleAdsWorkerSchedulingState({
      onlineWorkers: 0,
      lastHeartbeatAt: null,
      runnerLeaseActive: false,
      staleThresholdMs: 5 * 60_000,
      nowMs,
    });

    expect(result.healthy).toBe(false);
    expect(result.hasFreshHeartbeat).toBe(false);
  });

  it("treats a fresh runner lease as healthy even before heartbeat catches up", () => {
    const nowMs = new Date("2026-03-29T12:00:00.000Z").getTime();
    const result = evaluateGoogleAdsWorkerSchedulingState({
      onlineWorkers: 0,
      lastHeartbeatAt: null,
      runnerLeaseActive: true,
      staleThresholdMs: 5 * 60_000,
      nowMs,
    });

    expect(result.healthy).toBe(true);
    expect(result.runnerLeaseActive).toBe(true);
  });

  it("keeps worker health true for fresh provider-scoped heartbeats", () => {
    const nowMs = new Date("2026-03-29T12:00:00.000Z").getTime();
    const result = evaluateGoogleAdsWorkerSchedulingState({
      onlineWorkers: 1,
      lastHeartbeatAt: "2026-03-29T11:59:00.000Z",
      runnerLeaseActive: false,
      staleThresholdMs: 5 * 60_000,
      nowMs,
    });

    expect(result.healthy).toBe(true);
    expect(result.hasFreshHeartbeat).toBe(true);
    expect(result.heartbeatAgeMs).toBe(60_000);
  });
});
