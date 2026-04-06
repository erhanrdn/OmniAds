import { describe, expect, it } from "vitest";
import {
  buildAdminAuthHealth,
  buildAdminRevenueRisk,
  buildAdminSyncHealth,
} from "@/lib/admin-operations-health";

describe("buildAdminAuthHealth", () => {
  it("classifies only confirmed auth failures as issues", () => {
    const payload = buildAdminAuthHealth([
      {
        business_id: "biz-1",
        business_name: "Acme",
        provider: "google",
        status: "connected",
        refresh_token: null,
        token_expires_at: "2026-03-20T10:00:00.000Z",
        scopes: "openid profile",
        error_message: null,
        updated_at: "2026-03-21T10:00:00.000Z",
      },
    ]);

    expect(payload.summary.affectedBusinesses).toBe(1);
    expect(payload.summary.expiredTokens).toBe(1);
    expect(payload.summary.missingRefreshTokens).toBe(1);
    expect(payload.summary.missingScopes).toBe(1);
    expect(payload.summary.topIssue).toBeTruthy();
    expect(payload.summary.expiringSoon).toBe(0);
    expect(payload.issues).toHaveLength(2);
  });

  it("does not flag Google-family expired access tokens when refresh is available", () => {
    const payload = buildAdminAuthHealth([
      {
        business_id: "biz-2",
        business_name: "Beta",
        provider: "google",
        status: "connected",
        refresh_token: "refresh-token",
        token_expires_at: "2026-03-20T10:00:00.000Z",
        scopes: "https://www.googleapis.com/auth/adwords",
        error_message: null,
        updated_at: "2026-03-21T10:00:00.000Z",
      },
    ]);

    expect(payload.summary.expiredTokens).toBe(0);
    expect(payload.summary.affectedBusinesses).toBe(0);
    expect(payload.issues).toHaveLength(0);
  });
});

describe("buildAdminSyncHealth", () => {
  it("tracks failed jobs, stuck jobs, and active cooldowns", () => {
    const payload = buildAdminSyncHealth({
      jobs: [
        {
          business_id: "biz-1",
          business_name: "Acme",
          provider: "google_ads",
          report_type: "overview",
          status: "failed",
          error_message: "quota",
          triggered_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
        {
          business_id: "biz-2",
          business_name: "Beta",
          provider: "ga4",
          report_type: "ga4_overview",
          status: "running",
          error_message: null,
          triggered_at: "2026-03-21T10:00:00.000Z",
          started_at: "2026-03-21T10:00:00.000Z",
          completed_at: null,
        },
      ],
      cooldowns: [
        {
          business_id: "biz-3",
          business_name: "Gamma",
          provider: "search_console",
          request_type: "seo_overview",
          error_message: "cooldown",
          cooldown_until: new Date(Date.now() + 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    expect(payload.summary.failedJobs24h).toBe(1);
    expect(payload.summary.activeCooldowns).toBe(1);
    expect(payload.summary.impactedBusinesses).toBe(3);
    expect(payload.issues.some((issue) => issue.status === "cooldown")).toBe(true);
  });

  it("surfaces google ads breaker and compacted partition signals", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      googleAdsHealth: [
        {
          business_id: "biz-g",
          business_name: "Grandmix",
          queue_depth: 12,
          leased_partitions: 0,
          dead_letter_partitions: 0,
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: new Date().toISOString(),
          campaign_completed_days: 10,
          campaign_dead_letter_count: 0,
          search_term_completed_days: 2,
          product_completed_days: 1,
          active_circuit_breakers: 1,
          compacted_partitions: 44,
        },
      ],
      workerHealth: {
        onlineWorkers: 0,
        workerInstances: 0,
        lastHeartbeatAt: null,
        lastProgressHeartbeatAt: null,
        workers: [],
      },
    });

    expect(payload.summary.googleAdsCircuitBreakerBusinesses).toBe(1);
    expect(payload.summary.googleAdsCompactedPartitions).toBe(44);
    expect(payload.summary.googleAdsBudgetPressureMax).toBe(0);
    expect(payload.googleAdsBusinesses?.[0]?.circuitBreakerOpen).toBe(true);
    expect(payload.googleAdsBusinesses?.[0]?.compactedPartitions).toBe(44);
  });

  it("surfaces quota pressure and half-open recovery signals", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      googleAdsHealth: [
        {
          business_id: "biz-half",
          business_name: "Half Open Co",
          queue_depth: 2,
          leased_partitions: 0,
          dead_letter_partitions: 0,
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: new Date().toISOString(),
          campaign_completed_days: 10,
          campaign_dead_letter_count: 0,
          search_term_completed_days: 2,
          product_completed_days: 1,
          asset_completed_days: 3,
          active_circuit_breakers: 0,
          compacted_partitions: 4,
          quota_call_count: 3000,
          quota_error_count: 12,
          quota_budget: 5000,
          quota_pressure: 0.6,
          recovery_half_open: 1,
          recent_search_term_completed_days: 14,
          recent_product_completed_days: 14,
          recent_asset_completed_days: 14,
          recent_range_total_days: 14,
        },
      ],
      workerHealth: {
        onlineWorkers: 1,
        workerInstances: 1,
        lastHeartbeatAt: new Date().toISOString(),
        lastProgressHeartbeatAt: null,
        workers: [],
      },
    });

    expect(payload.summary.googleAdsRecoveryBusinesses).toBe(1);
    expect(payload.summary.googleAdsBudgetPressureMax).toBe(0.6);
    expect(payload.googleAdsBusinesses?.[0]?.recoveryMode).toBe("half_open");
    expect(payload.googleAdsBusinesses?.[0]?.quotaPressure).toBe(0.6);
    expect(payload.googleAdsBusinesses?.[0]?.recentExtendedReady).toBe(true);
    expect(payload.googleAdsBusinesses?.[0]?.historicalExtendedReady).toBe(false);
    expect(payload.googleAdsBusinesses?.[0]?.effectiveMode).toBe("canary_reopen");
  });

  it("classifies google ads businesses as partial_stuck when backlog is idle without leases", () => {
    const staleActivity = new Date(Date.now() - 30 * 60_000).toISOString();
    const staleCheckpoint = new Date(Date.now() - 25 * 60_000).toISOString();
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      googleAdsHealth: [
        {
          business_id: "biz-stuck",
          business_name: "Stuck Co",
          queue_depth: 9,
          leased_partitions: 0,
          dead_letter_partitions: 0,
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: staleActivity,
          latest_checkpoint_updated_at: staleCheckpoint,
          campaign_completed_days: 10,
          campaign_dead_letter_count: 0,
          search_term_completed_days: 2,
          product_completed_days: 1,
          asset_completed_days: 1,
          recent_range_total_days: 14,
          recent_search_term_completed_days: 3,
          recent_product_completed_days: 2,
          recent_asset_completed_days: 1,
        },
      ],
    });

    expect(payload.googleAdsBusinesses?.[0]?.progressState).toBe("partial_stuck");
  });

  it("classifies google ads businesses as partial_progressing when backlog is moving", () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      googleAdsHealth: [
        {
          business_id: "biz-progressing",
          business_name: "Moving Co",
          queue_depth: 6,
          leased_partitions: 0,
          dead_letter_partitions: 0,
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: recent,
          latest_checkpoint_updated_at: recent,
          campaign_completed_days: 40,
          campaign_dead_letter_count: 0,
          search_term_completed_days: 10,
          product_completed_days: 10,
          asset_completed_days: 10,
          recent_range_total_days: 14,
          recent_search_term_completed_days: 12,
          recent_product_completed_days: 12,
          recent_asset_completed_days: 12,
        },
      ],
    });

    expect(payload.googleAdsBusinesses?.[0]?.progressState).toBe("partial_progressing");
  });

  it("surfaces lease-conflict and skipped-active-lease counters as actionable issues", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      googleAdsHealth: [
        {
          business_id: "biz-g",
          business_name: "Grandmix",
          queue_depth: 1,
          leased_partitions: 0,
          dead_letter_partitions: 0,
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: new Date().toISOString(),
          latest_checkpoint_updated_at: new Date().toISOString(),
          campaign_completed_days: 10,
          campaign_dead_letter_count: 0,
          search_term_completed_days: 2,
          product_completed_days: 1,
          skipped_active_lease_recoveries: 3,
          lease_conflict_runs_24h: 2,
        },
      ],
    });

    expect(payload.summary.googleAdsSkippedActiveLeaseRecoveries).toBe(3);
    expect(payload.summary.googleAdsLeaseConflictRuns24h).toBe(2);
    expect(payload.issues.some((issue) => issue.reportType === "skipped_active_lease")).toBe(true);
    expect(payload.issues.some((issue) => issue.reportType === "lease_conflict_runs")).toBe(true);
    expect(
      payload.issues.find((issue) => issue.reportType === "lease_conflict_runs")?.severity
    ).toBe("critical");
    expect(
      payload.issues.find((issue) => issue.reportType === "lease_conflict_runs")?.runbookKey
    ).toBe("google_ads:lease_conflict");
  });

  it("surfaces meta recent frontier readiness separately from historical coverage", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      metaHealth: [
        {
          business_id: "biz-meta",
          business_name: "IwaStore",
          queue_depth: 18,
          leased_partitions: 2,
          retryable_failed_partitions: 0,
          stale_lease_partitions: 0,
          dead_letter_partitions: 0,
          state_row_count: 4,
          current_day_reference: "2026-03-28",
          oldest_queued_partition: "2025-01-01",
          latest_partition_activity_at: new Date().toISOString(),
          latest_checkpoint_scope: "creative_daily",
          latest_checkpoint_phase: "transform",
          latest_checkpoint_updated_at: new Date().toISOString(),
          latest_progress_heartbeat_at: new Date().toISOString(),
          last_successful_page_index: 3,
          checkpoint_failures: 0,
          reclaim_candidate_count: 0,
          last_reclaim_reason: null,
          today_account_rows: 12,
          today_adset_rows: 21,
          account_completed_days: 400,
          adset_completed_days: 400,
          creative_completed_days: 120,
          ad_completed_days: 90,
          recent_account_completed_days: 14,
          recent_adset_completed_days: 14,
          recent_creative_completed_days: 14,
          recent_ad_completed_days: 14,
          recent_range_total_days: 14,
        },
      ],
      workerHealth: {
        onlineWorkers: 1,
        workerInstances: 1,
        lastHeartbeatAt: new Date().toISOString(),
        lastProgressHeartbeatAt: null,
        workers: [],
      },
    });

    expect(payload.metaBusinesses?.[0]?.recentExtendedReady).toBe(true);
    expect(payload.metaBusinesses?.[0]?.historicalExtendedReady).toBe(false);
    expect(payload.metaBusinesses?.[0]?.effectiveMode).toBe("extended_recovery");
  });

  it("surfaces meta stale-run and skipped-active-lease counters as actionable issues", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      metaHealth: [
        {
          business_id: "biz-meta",
          business_name: "IwaStore",
          queue_depth: 3,
          leased_partitions: 0,
          retryable_failed_partitions: 0,
          stale_lease_partitions: 0,
          dead_letter_partitions: 0,
          state_row_count: 2,
          current_day_reference: "2026-03-28",
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: new Date().toISOString(),
          latest_checkpoint_scope: null,
          latest_checkpoint_phase: null,
          latest_checkpoint_updated_at: new Date().toISOString(),
          latest_progress_heartbeat_at: null,
          last_successful_page_index: null,
          checkpoint_failures: 0,
          today_account_rows: 12,
          today_adset_rows: 21,
          account_completed_days: 30,
          adset_completed_days: 30,
          creative_completed_days: 10,
          ad_completed_days: 8,
          skipped_active_lease_recoveries: 4,
          stale_run_count_24h: 2,
        },
      ],
    });

    expect(payload.summary.metaSkippedActiveLeaseRecoveries).toBe(4);
    expect(payload.summary.metaStaleRunCount24h).toBe(2);
    expect(payload.issues.some((issue) => issue.reportType === "skipped_active_lease")).toBe(true);
    expect(payload.issues.some((issue) => issue.reportType === "stale_runs")).toBe(true);
    expect(payload.issues.find((issue) => issue.reportType === "stale_runs")?.severity).toBe(
      "critical"
    );
    expect(payload.issues.find((issue) => issue.reportType === "stale_runs")?.runbookKey).toBe(
      "meta:stale_run"
    );
  });

  it("classifies meta businesses as partial_stuck when backlog is idle without leases", () => {
    const staleActivity = new Date(Date.now() - 30 * 60_000).toISOString();
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      metaHealth: [
        {
          business_id: "biz-meta-stuck",
          business_name: "Meta Stuck",
          queue_depth: 5,
          leased_partitions: 0,
          retryable_failed_partitions: 0,
          stale_lease_partitions: 0,
          dead_letter_partitions: 0,
          state_row_count: 2,
          current_day_reference: "2026-03-28",
          oldest_queued_partition: "2026-03-20",
          latest_partition_activity_at: staleActivity,
          latest_checkpoint_scope: null,
          latest_checkpoint_phase: null,
          latest_checkpoint_updated_at: staleActivity,
          latest_progress_heartbeat_at: null,
          last_successful_page_index: null,
          checkpoint_failures: 0,
          today_account_rows: 12,
          today_adset_rows: 12,
          account_completed_days: 50,
          adset_completed_days: 50,
          creative_completed_days: 10,
          ad_completed_days: 10,
          recent_account_completed_days: 10,
          recent_adset_completed_days: 10,
          recent_creative_completed_days: 10,
          recent_ad_completed_days: 10,
          recent_range_total_days: 14,
        },
      ],
    });

    expect(payload.metaBusinesses?.[0]?.progressState).toBe("partial_stuck");
  });

  it("keeps lightweight google ads summary when detailed health is degraded", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      googleAdsHealth: [],
      googleAdsHealthStatus: "degraded",
      googleAdsHealthError: "Database query timed out",
      googleAdsHealthSummary: {
        queueDepth: 12,
        leasedPartitions: 3,
        deadLetterPartitions: 8,
        oldestQueuedPartition: "2026-03-20",
      },
      workerHealth: {
        onlineWorkers: 1,
        workerInstances: 1,
        lastHeartbeatAt: new Date().toISOString(),
        lastProgressHeartbeatAt: null,
        workers: [],
      },
    });

    expect(payload.googleAdsHealthStatus).toBe("degraded");
    expect(payload.googleAdsHealthError).toBe("Database query timed out");
    expect(payload.summary.googleAdsQueueDepth).toBe(12);
    expect(payload.summary.googleAdsLeasedPartitions).toBe(3);
    expect(payload.summary.googleAdsDeadLetterPartitions).toBe(8);
    expect(payload.summary.googleAdsOldestQueuedPartition).toBe("2026-03-20");
    expect(payload.summary.topIssue).toBe("Google Ads health unavailable");
  });

  it("surfaces authoritative meta publish, sla, and failure provenance", () => {
    const payload = buildAdminSyncHealth({
      jobs: [],
      cooldowns: [],
      metaHealth: [
        {
          business_id: "biz-meta",
          business_name: "IwaStore",
          queue_depth: 4,
          leased_partitions: 1,
          retryable_failed_partitions: 1,
          stale_lease_partitions: 1,
          dead_letter_partitions: 1,
          state_row_count: 3,
          current_day_reference: "2026-04-05",
          oldest_queued_partition: "2026-04-04",
          latest_partition_activity_at: "2026-04-05T09:00:00.000Z",
          latest_checkpoint_scope: "account_daily",
          latest_checkpoint_phase: "finalize",
          latest_checkpoint_updated_at: "2026-04-05T09:05:00.000Z",
          latest_progress_heartbeat_at: "2026-04-05T09:05:00.000Z",
          last_successful_page_index: 3,
          checkpoint_failures: 1,
          today_account_rows: 2,
          today_adset_rows: 2,
          account_completed_days: 100,
          adset_completed_days: 100,
          creative_completed_days: 80,
          ad_completed_days: 80,
        },
      ],
      metaAuthoritativeSnapshots: [
        {
          businessId: "biz-meta",
          capturedAt: "2026-04-05T10:00:00.000Z",
          manifestCounts: {
            pending: 1,
            running: 0,
            completed: 3,
            failed: 1,
            superseded: 0,
            total: 5,
          },
          progression: {
            queued: 4,
            leased: 1,
            published: 7,
            retryableFailed: 1,
            deadLetter: 1,
            staleLeases: 1,
            repairBacklog: 3,
          },
          latestPublishes: [
            {
              providerAccountId: "act_1",
              day: "2026-04-04",
              surface: "account_daily",
              publishedAt: "2026-04-05T08:59:00.000Z",
              verificationState: "finalized_verified",
              sourceKind: "finalize_day",
              manifestFetchStatus: "completed",
            },
          ],
          d1FinalizeSla: {
            totalAccounts: 2,
            breachedAccounts: 1,
            accounts: [
              {
                providerAccountId: "act_1",
                accountTimezone: "UTC",
                expectedDay: "2026-04-04",
                verificationState: "finalized_verified",
                publishedAt: "2026-04-05T08:59:00.000Z",
                breached: false,
              },
              {
                providerAccountId: "act_2",
                accountTimezone: "UTC",
                expectedDay: "2026-04-04",
                verificationState: "repair_required",
                publishedAt: null,
                breached: true,
              },
            ],
          },
          validationFailures24h: 2,
          recentFailures: [
            {
              providerAccountId: "act_2",
              day: "2026-04-04",
              surface: "campaign_daily",
              result: "repair_required",
              eventKind: "totals_mismatch",
              severity: "error",
              reason: "campaign spend drift",
              createdAt: "2026-04-05T09:01:00.000Z",
            },
          ],
          lastSuccessfulPublishAt: "2026-04-05T08:59:00.000Z",
        },
      ],
    });

    expect(payload.summary.metaSourceManifestCount).toBe(5);
    expect(payload.summary.metaPublishedProgression).toBe(7);
    expect(payload.summary.metaValidationFailures24h).toBe(2);
    expect(payload.summary.metaRepairBacklog).toBe(3);
    expect(payload.summary.metaStaleLeasePartitions).toBe(1);
    expect(payload.summary.metaD1FinalizeSlaBreaches).toBe(1);
    expect(payload.summary.metaLastSuccessfulPublishAt).toBe("2026-04-05T08:59:00.000Z");
    expect(payload.metaBusinesses?.[0]?.sourceManifestCounts?.failed).toBe(1);
    expect(payload.metaBusinesses?.[0]?.latestAuthoritativePublishes?.[0]?.providerAccountId).toBe("act_1");
    expect(payload.metaBusinesses?.[0]?.d1FinalizeSla?.breachedAccounts).toBe(1);
    expect(payload.metaBusinesses?.[0]?.validationFailures24h).toBe(2);
    expect(payload.metaBusinesses?.[0]?.repairBacklog).toBe(3);
    expect(payload.metaBusinesses?.[0]?.lastSuccessfulPublishAt).toBe("2026-04-05T08:59:00.000Z");
  });
});

describe("buildAdminRevenueRisk", () => {
  it("surfaces unsubscribed businesses and non-active subscriptions", () => {
    const payload = buildAdminRevenueRisk({
      workspaces: [
        {
          business_id: "biz-1",
          business_name: "Acme",
          owner_name: "Owner",
          owner_email: "owner@example.com",
          created_at: "2026-03-01T10:00:00.000Z",
          connected_integrations: 2,
          has_active_subscription: false,
        },
      ],
      subscriptions: [
        {
          business_id: "biz-2",
          business_name: "Beta",
          owner_name: "Owner 2",
          owner_email: "owner2@example.com",
          plan_id: "growth",
          status: "cancelled",
          updated_at: new Date().toISOString(),
        },
        {
          business_id: "biz-3",
          business_name: "Gamma",
          owner_name: "Owner 3",
          owner_email: "owner3@example.com",
          plan_id: "pro",
          status: "active",
          updated_at: new Date().toISOString(),
        },
      ],
    });

    expect(payload.summary.unsubscribedBusinesses).toBe(1);
    expect(payload.summary.nonActiveSubscriptions).toBe(1);
    expect(payload.summary.activeSubscriptions).toBe(1);
    expect(payload.summary.atRiskBusinesses).toBe(2);
  });
});
