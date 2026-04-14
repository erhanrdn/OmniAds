import { describe, expect, it } from "vitest";
import { buildGlobalRebuildTruthReview } from "@/lib/rebuild-truth-review";

function buildMetaProtectedTruth(overrides: Partial<Parameters<typeof buildGlobalRebuildTruthReview>[0]["metaProtectedPublishedTruth"]> = {}) {
  return {
    runtimeAvailable: true,
    asOfDate: "2026-04-14",
    scope: {
      kind: "all_businesses" as const,
      businessIds: null,
    },
    hasNonZeroProtectedPublishedRows: false,
    protectedPublishedRows: 0,
    activePublicationPointerRows: 0,
    protectedTruthClassesPresent: [],
    protectedTruthClassesAbsent: [
      "core_daily_rows",
      "breakdown_daily_rows",
      "active_publication_pointers",
      "active_published_slice_versions",
      "active_source_manifests",
      "published_day_state",
    ],
    classes: [],
    ...overrides,
  };
}

describe("buildGlobalRebuildTruthReview", () => {
  it("keeps Google in cold bootstrap when queue work exists but coverage is still zero", () => {
    const review = buildGlobalRebuildTruthReview({
      googleBusinesses: [
        {
          businessId: "biz_google",
          queueDepth: 12,
          leasedPartitions: 0,
          deadLetterPartitions: 0,
          campaignCompletedDays: 0,
          searchTermCompletedDays: 0,
          productCompletedDays: 0,
          assetCompletedDays: 0,
          recentExtendedReady: false,
          historicalExtendedReady: false,
        },
      ],
      metaBusinesses: [],
      googleExecution: {
        sync: "global_backfill",
        retentionEnabled: false,
      },
      metaExecution: {
        authoritativeFinalizationEnabled: false,
        retentionEnabled: false,
      },
      metaProtectedPublishedTruth: buildMetaProtectedTruth(),
    });

    expect(review.googleAds.rebuild.state).toBe("cold_bootstrap");
    expect(review.googleAds.rebuild.evidence.coldBootstrapBusinesses).toBe(1);
  });

  it("keeps Google quota-limited ahead of backfill readiness when quota evidence is present", () => {
    const review = buildGlobalRebuildTruthReview({
      googleBusinesses: [
        {
          businessId: "biz_google_quota",
          queueDepth: 4,
          leasedPartitions: 0,
          deadLetterPartitions: 0,
          campaignCompletedDays: 40,
          searchTermCompletedDays: 20,
          productCompletedDays: 20,
          assetCompletedDays: 20,
          recentExtendedReady: false,
          historicalExtendedReady: false,
          quotaPressure: 0.92,
          quotaErrorCount: 3,
          quotaLimitedEvidence: true,
          recoveryMode: "half_open",
        },
      ],
      metaBusinesses: [],
      googleExecution: {
        sync: "global_backfill",
        retentionEnabled: false,
      },
      metaExecution: {
        authoritativeFinalizationEnabled: false,
        retentionEnabled: false,
      },
      metaProtectedPublishedTruth: buildMetaProtectedTruth(),
    });

    expect(review.googleAds.rebuild.state).toBe("quota_limited");
    expect(review.googleAds.rebuild.evidence.quotaLimitedBusinesses).toBe(1);
  });

  it("classifies Meta protected truth as publication_missing when blocked and no pointers are visible", () => {
    const review = buildGlobalRebuildTruthReview({
      googleBusinesses: [],
      metaBusinesses: [
        {
          businessId: "biz_meta_blocked",
          queueDepth: 0,
          leasedPartitions: 0,
          retryableFailedPartitions: 0,
          staleLeasePartitions: 0,
          deadLetterPartitions: 2,
          stateRowCount: 5,
          todayAccountRows: 0,
          todayAdsetRows: 0,
          accountCompletedDays: 30,
          adsetCompletedDays: 30,
          creativeCompletedDays: 30,
          recentExtendedReady: false,
          historicalExtendedReady: false,
          progressState: "blocked",
        },
      ],
      googleExecution: {
        sync: "global_backfill",
        retentionEnabled: false,
      },
      metaExecution: {
        authoritativeFinalizationEnabled: true,
        retentionEnabled: false,
      },
      metaProtectedPublishedTruth: buildMetaProtectedTruth(),
    });

    expect(review.meta.rebuild.state).toBe("blocked");
    expect(review.meta.protectedPublishedTruth.state).toBe("publication_missing");
  });

  it("classifies Meta protected truth as rebuild_incomplete when backfill still remains", () => {
    const review = buildGlobalRebuildTruthReview({
      googleBusinesses: [],
      metaBusinesses: [
        {
          businessId: "biz_meta_backfill",
          queueDepth: 8,
          leasedPartitions: 1,
          retryableFailedPartitions: 0,
          staleLeasePartitions: 0,
          deadLetterPartitions: 0,
          stateRowCount: 10,
          todayAccountRows: 0,
          todayAdsetRows: 0,
          accountCompletedDays: 20,
          adsetCompletedDays: 20,
          creativeCompletedDays: 10,
          recentExtendedReady: false,
          historicalExtendedReady: false,
          progressState: "syncing",
        },
      ],
      googleExecution: {
        sync: "global_backfill",
        retentionEnabled: false,
      },
      metaExecution: {
        authoritativeFinalizationEnabled: true,
        retentionEnabled: false,
      },
      metaProtectedPublishedTruth: buildMetaProtectedTruth(),
    });

    expect(review.meta.rebuild.state).toBe("backfill_in_progress");
    expect(review.meta.protectedPublishedTruth.state).toBe("rebuild_incomplete");
  });

  it("exposes Meta protected published truth when live protected rows are visible", () => {
    const review = buildGlobalRebuildTruthReview({
      googleBusinesses: [],
      metaBusinesses: [
        {
          businessId: "biz_meta_ready",
          queueDepth: 0,
          leasedPartitions: 0,
          retryableFailedPartitions: 0,
          staleLeasePartitions: 0,
          deadLetterPartitions: 0,
          stateRowCount: 20,
          todayAccountRows: 5,
          todayAdsetRows: 5,
          accountCompletedDays: 365,
          adsetCompletedDays: 365,
          creativeCompletedDays: 365,
          recentExtendedReady: true,
          historicalExtendedReady: true,
          progressState: "ready",
        },
      ],
      googleExecution: {
        sync: "global_backfill",
        retentionEnabled: false,
      },
      metaExecution: {
        authoritativeFinalizationEnabled: true,
        retentionEnabled: false,
      },
      metaProtectedPublishedTruth: buildMetaProtectedTruth({
        hasNonZeroProtectedPublishedRows: true,
        protectedPublishedRows: 48,
        activePublicationPointerRows: 12,
        protectedTruthClassesPresent: [
          "core_daily_rows",
          "active_publication_pointers",
          "active_published_slice_versions",
        ],
        protectedTruthClassesAbsent: [
          "breakdown_daily_rows",
          "active_source_manifests",
          "published_day_state",
        ],
        classes: [
          {
            key: "core_daily_rows",
            label: "Protected core daily rows",
            present: true,
            observed: true,
            protectedRows: 48,
            latestProtectedValue: "2026-04-13",
          },
        ],
      }),
    });

    expect(review.meta.rebuild.state).toBe("ready");
    expect(review.meta.protectedPublishedTruth.state).toBe("present");
    expect(review.meta.protectedPublishedTruth.protectedPublishedRows).toBe(48);
    expect(review.meta.protectedPublishedTruth.protectedTruthClassesPresent).toContain(
      "core_daily_rows",
    );
  });
});
