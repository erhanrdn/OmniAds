import { describe, expect, it } from "vitest";
import {
  GOOGLE_ADS_RETENTION_POLICY,
  buildGoogleAdsRetentionDryRun,
  executeGoogleAdsRetentionPolicyDryRunOnly,
  isGoogleAdsRetentionExecutionEnabled,
} from "@/lib/google-ads/warehouse-retention";

describe("Google Ads warehouse retention policy", () => {
  it("uses the approved retention tiers", () => {
    expect(GOOGLE_ADS_RETENTION_POLICY.core_daily.retentionDays).toBeGreaterThan(700);
    expect(GOOGLE_ADS_RETENTION_POLICY.breakdown_daily.retentionDays).toBeGreaterThan(390);
    expect(GOOGLE_ADS_RETENTION_POLICY.creative_daily.retentionDays).toBe(180);
    expect(GOOGLE_ADS_RETENTION_POLICY.raw_search_terms_hot.retentionDays).toBe(120);
    expect(GOOGLE_ADS_RETENTION_POLICY.top_queries_weekly.retentionDays).toBe(365);
  });

  it("keeps retention execution disabled by default and produces a dry run", async () => {
    expect(isGoogleAdsRetentionExecutionEnabled({} as NodeJS.ProcessEnv)).toBe(false);

    const result = await executeGoogleAdsRetentionPolicyDryRunOnly({
      asOfDate: "2026-04-08",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result.executionEnabled).toBe(false);
    expect(result.dryRun).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tier: "raw_search_terms_hot",
          tableName: "google_ads_search_query_hot_daily",
          executionEnabled: false,
        }),
      ])
    );
  });

  it("builds cutoff dates for every retention table", () => {
    const rows = buildGoogleAdsRetentionDryRun("2026-04-08");

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "google_ads_top_query_weekly",
          cutoffDate: "2025-04-08",
        }),
        expect.objectContaining({
          tableName: "google_ads_decision_action_outcome_logs",
          executionEnabled: false,
        }),
      ])
    );
  });
});
