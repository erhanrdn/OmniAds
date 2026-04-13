import { beforeEach, describe, expect, it, vi } from "vitest";

const getIntegrationMetadata = vi.fn();
const getProviderAccountAssignments = vi.fn();
const getGoogleAdsCheckpointHealth = vi.fn();
const getGoogleAdsQueueHealth = vi.fn();
const getGoogleAdsSyncState = vi.fn();
const getLatestGoogleAdsSyncHealth = vi.fn();
const getLatestGoogleAdsAdvisorSnapshot = vi.fn();
const getGoogleAdsDecisionEngineConfig = vi.fn();
const getGoogleAdsAutomationConfig = vi.fn();
const getGoogleAdsAdvisorAiStructuredAssistBoundaryState = vi.fn();
const getGoogleAdsAutonomyBoundaryState = vi.fn();
const getGoogleAdsWritebackCapabilityGate = vi.fn();
const getGoogleAdsRetentionRuntimeStatus = vi.fn();
const getLatestGoogleAdsRetentionRun = vi.fn();
const getAdminOperationsHealth = vi.fn();

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata,
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments,
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  getGoogleAdsCheckpointHealth,
  getGoogleAdsQueueHealth,
  getGoogleAdsSyncState,
  getLatestGoogleAdsSyncHealth,
}));

vi.mock("@/lib/google-ads/advisor-snapshots", () => ({
  getLatestGoogleAdsAdvisorSnapshot,
  isGoogleAdsAdvisorSnapshotFresh: vi.fn(() => true),
}));

vi.mock("@/lib/google-ads/decision-engine-config", () => ({
  getGoogleAdsAutomationConfig,
  getGoogleAdsAdvisorAiStructuredAssistBoundaryState,
  getGoogleAdsAutonomyBoundaryState,
  getGoogleAdsDecisionEngineConfig,
  getGoogleAdsWritebackCapabilityGate,
}));

vi.mock("@/lib/google-ads/warehouse-retention", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-ads/warehouse-retention")>(
    "@/lib/google-ads/warehouse-retention"
  );
  return {
    ...actual,
    getGoogleAdsRetentionRuntimeStatus,
    getLatestGoogleAdsRetentionRun,
  };
});

vi.mock("@/lib/admin-operations-health", () => ({
  getAdminOperationsHealth,
}));

const productGate = await import("@/lib/google-ads/product-gate");

describe("runGoogleAdsProductGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DATABASE_URL;
    getGoogleAdsDecisionEngineConfig.mockReturnValue({
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
      advisorAiStructuredAssistEnabled: false,
    });
    getGoogleAdsAutomationConfig.mockReturnValue({
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
      writebackPilotEnabled: false,
      semiAutonomousBundlesEnabled: false,
      controlledAutonomyEnabled: false,
      autonomyKillSwitchActive: true,
      manualApprovalRequired: true,
      operatorOverrideEnabled: true,
      actionAllowlist: [],
      businessAllowlist: [],
      accountAllowlist: [],
      bundleCooldownHours: 24,
    });
    getGoogleAdsAutonomyBoundaryState.mockReturnValue({
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
      writebackPilotEnabled: false,
      semiAutonomousBundlesEnabled: false,
      controlledAutonomyEnabled: false,
      autonomyKillSwitchActive: true,
      manualApprovalRequired: true,
      operatorOverrideEnabled: true,
      actionAllowlist: [],
      businessAllowlist: [],
      accountAllowlist: [],
      bundleCooldownHours: 24,
      businessAllowed: true,
      accountAllowed: true,
      semiAutonomousEligible: false,
      controlledAutonomyEligible: false,
      blockedReasons: [
        "Autonomy kill switch is active.",
        "Manual approval is still required.",
        "No Google Ads action families are allowlisted for autonomous execution.",
      ],
    });
    getGoogleAdsAdvisorAiStructuredAssistBoundaryState.mockReturnValue({
      enabled: false,
      businessAllowlist: [],
      mode: "snapshot_time",
      scope: "unmapped_only",
      businessScoped: false,
      businessAllowed: false,
      eligible: false,
      blockedReasons: [
        "AI structured assist flag is disabled.",
        "No business allowlist is configured for AI structured assist.",
      ],
    });
    getGoogleAdsWritebackCapabilityGate.mockReturnValue({
      enabled: false,
      mutateEnabled: false,
      rollbackEnabled: false,
      clusterExecutionEnabled: false,
      reason: "Write-back is disabled.",
    });
    getGoogleAdsRetentionRuntimeStatus.mockReturnValue({
      runtimeAvailable: false,
      executionEnabled: false,
      mode: "dry_run",
      gateReason: "Retention execution is disabled.",
    });
    getLatestGoogleAdsRetentionRun.mockResolvedValue(null);
  });

  it("reports NOT VERIFIED sections when runtime inputs are unavailable", async () => {
    const result = await productGate.runGoogleAdsProductGate({
      businessId: "biz_1",
      strict: true,
      skipAdmin: false,
      buildCheck: {
        skipped: false,
        ok: true,
        summary: "npm run build passed.",
      },
    });

    expect(result.sections.find((entry) => entry.key === "feature_flag_posture")?.level).toBe("PASS");
    expect(result.sections.find((entry) => entry.key === "warehouse_sync_health")?.level).toBe(
      "NOT VERIFIED"
    );
    expect(result.sections.find((entry) => entry.key === "advisor_readiness_contract")?.level).toBe(
      "NOT VERIFIED"
    );
    expect(productGate.shouldGoogleAdsProductGateFailStrict(result)).toBe(true);
  });

  it("passes when core runtime posture is healthy and the advisor snapshot is native", async () => {
    process.env.DATABASE_URL = "postgres://example";
    getGoogleAdsRetentionRuntimeStatus.mockReturnValue({
      runtimeAvailable: true,
      executionEnabled: false,
      mode: "dry_run",
      gateReason: "Retention execution is disabled.",
    });
    getIntegrationMetadata.mockResolvedValue({ status: "connected" });
    getProviderAccountAssignments.mockResolvedValue({ account_ids: ["acc_1"] });
    getGoogleAdsQueueHealth.mockResolvedValue({
      queueDepth: 0,
      deadLetterPartitions: 0,
      advisorRelevantFailedPartitions: 0,
    });
    getLatestGoogleAdsSyncHealth.mockResolvedValue({ lastError: null });
    getGoogleAdsSyncState.mockResolvedValue([
      {
        scope: "campaign_daily",
        completedDays: 365,
        readyThroughDate: "2026-04-09",
        deadLetterCount: 0,
      },
    ]);
    getGoogleAdsCheckpointHealth.mockResolvedValue({
      latestCheckpointScope: "campaign_daily",
    });
    getLatestGoogleAdsAdvisorSnapshot.mockResolvedValue({
      asOfDate: "2026-04-10",
      generatedAt: new Date().toISOString(),
      advisorPayload: {
        metadata: {
          actionContract: {
            version: "google_ads_advisor_action_v2",
            source: "native",
          },
          aggregateIntelligence: {
            topQueryWeeklyAvailable: true,
            clusterDailyAvailable: true,
            queryWeeklyRows: 12,
            clusterDailyRows: 44,
            supportWindowStart: "2026-01-15",
            supportWindowEnd: "2026-04-10",
            note: "Persisted weekly top-query and daily cluster aggregates are loaded as supplemental support.",
          },
          aiAssist: {
            enabled: true,
            mode: "snapshot_time",
            scope: "unmapped_only",
            appliedCount: 1,
            rejectedCount: 0,
            failedCount: 0,
            skippedCount: 2,
            eligibleCount: 1,
            promptVersion: "google_ads_ai_structured_assist_v1",
            businessScoped: true,
          },
        },
      },
    });
    getGoogleAdsAdvisorAiStructuredAssistBoundaryState.mockReturnValue({
      enabled: true,
      businessAllowlist: ["biz_1"],
      mode: "snapshot_time",
      scope: "unmapped_only",
      businessScoped: true,
      businessAllowed: true,
      eligible: true,
      blockedReasons: [],
    });
    getLatestGoogleAdsRetentionRun.mockResolvedValue({
      summaryJson: {
        rows: [
          {
            tier: "raw_search_terms_hot",
            label: "Raw search terms daily hot",
            tableName: "google_ads_search_term_daily",
            retentionDays: 120,
            cutoffDate: "2025-12-12",
            executionEnabled: false,
            grain: "daily",
            storageTemperature: "hot",
            mode: "dry_run",
            observed: true,
            eligibleRows: 20,
            oldestEligibleValue: "2025-01-01",
            newestEligibleValue: "2025-12-11",
            retainedRows: 30,
            latestRetainedValue: "2026-04-10",
            deletedRows: 0,
          },
          {
            tier: "raw_search_terms_hot",
            label: "Raw search terms daily hot",
            tableName: "google_ads_search_query_hot_daily",
            retentionDays: 120,
            cutoffDate: "2025-12-12",
            executionEnabled: false,
            grain: "daily",
            storageTemperature: "hot",
            mode: "dry_run",
            observed: true,
            eligibleRows: 12,
            oldestEligibleValue: "2025-01-01",
            newestEligibleValue: "2025-12-11",
            retainedRows: 44,
            latestRetainedValue: "2026-04-10",
            deletedRows: 0,
          },
        ],
      },
      executionMode: "dry_run",
      finishedAt: new Date().toISOString(),
    });
    getAdminOperationsHealth.mockResolvedValue({
      syncHealth: {
        googleAdsBusinesses: [
          {
            businessId: "biz_1",
            queueDepth: 0,
            deadLetterPartitions: 0,
            progressState: "ready",
          },
        ],
      },
    });

    const result = await productGate.runGoogleAdsProductGate({
      businessId: "biz_1",
      strict: true,
      skipAdmin: false,
      buildCheck: {
        skipped: false,
        ok: true,
        summary: "npm run build passed.",
      },
    });

    expect(result.sections.find((entry) => entry.key === "warehouse_sync_health")?.level).toBe(
      "PASS"
    );
    expect(result.sections.find((entry) => entry.key === "advisor_readiness_contract")?.level).toBe(
      "PASS"
    );
    expect(
      result.sections.find((entry) => entry.key === "advisor_readiness_contract")?.details
    ).toContain("Weekly query aggregate support: available (12 rows)");
    expect(
      result.sections.find((entry) => entry.key === "advisor_readiness_contract")?.details
    ).toContain("AI assist applied/rejected/failed/skipped: 1/0/0/2");
    expect(result.sections.find((entry) => entry.key === "admin_visibility_contract")?.level).toBe(
      "PASS"
    );
    expect(
      result.sections.find((entry) => entry.key === "known_limitations")?.details
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Raw hot-table dry-run google_ads_search_term_daily: eligible 20"
        ),
        "Retention canary verification: npm run google:ads:retention-canary -- biz_1",
      ])
    );
    expect(result.sections.find((entry) => entry.key === "product_exit_criteria")?.level).toBe(
      "PASS"
    );
    expect(result.overallLevel).toBe("PASS");
    expect(productGate.shouldGoogleAdsProductGateFailStrict(result)).toBe(false);
  });
});
