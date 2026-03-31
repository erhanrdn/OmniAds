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
        lastProgressHeartbeatAt: new Date().toISOString(),
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
        lastProgressHeartbeatAt: new Date().toISOString(),
        workers: [],
      },
    });

    expect(payload.metaBusinesses?.[0]?.recentExtendedReady).toBe(true);
    expect(payload.metaBusinesses?.[0]?.historicalExtendedReady).toBe(false);
    expect(payload.metaBusinesses?.[0]?.effectiveMode).toBe("extended_recovery");
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
        lastProgressHeartbeatAt: new Date().toISOString(),
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
