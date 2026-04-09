import { describe, expect, it } from "vitest";
import {
  buildServingDirectReleaseSmokeRoutes,
  buildServingDirectReleaseWindow,
  summarizeServingDirectReleaseVerification,
} from "@/lib/serving-direct-release";
import type { ServingFreshnessStatusReport } from "@/lib/serving-freshness-status";

function buildFreshnessReport(
  overrides: Partial<ServingFreshnessStatusReport> = {},
): ServingFreshnessStatusReport {
  return {
    businessId: "test-business",
    capturedAt: "2026-04-09T20:00:00.000Z",
    reusedExistingLane: "cli_only",
    manualBoundarySelection: {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      overviewProvider: "google",
      demographicsDimension: "city",
    },
    classifications: {
      automated_present: 1,
      automated_missing: 0,
      manual_boundary: 1,
      manual_missing: 0,
      unknown: 0,
    },
    entries: [
      {
        surface: "provider_reporting_snapshots.ga4_analytics_overview",
        ownerModule: "@/lib/reporting-cache-writer",
        triggerLane: "lib/sync/ga4-sync.ts",
        automationMode: "automated",
        freshnessScope: "default_bounded",
        statusClassification: "automated_present",
        statusReason: "bounded automated row exists",
        selection: {
          reportType: "ga4_analytics_overview",
          startDate: "2026-03-11",
          endDate: "2026-04-09",
          dateRangeKey: "2026-03-11:2026-04-09",
        },
        lastObserved: {
          targetUpdatedAt: "2026-04-09T19:00:00.000Z",
        },
        ageMs: {
          targetUpdatedAt: 3_600_000,
        },
        operatorFallbackCommand: null,
        notes: [],
      },
      {
        surface: "provider_reporting_snapshots.ga4_detailed_demographics.non_country_dimension",
        ownerModule: "@/lib/reporting-cache-writer",
        triggerLane: "npm run reporting:cache:warm",
        automationMode: "manual",
        freshnessScope: "custom",
        statusClassification: "manual_boundary",
        statusReason: "manual boundary remains intentional",
        selection: {
          reportType: "ga4_detailed_demographics",
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          dimension: "city",
        },
        lastObserved: {
          latestManualObservedAt: "2026-04-08T19:00:00.000Z",
        },
        ageMs: {
          latestManualObservedAt: 90_000_000,
        },
        operatorFallbackCommand:
          "npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_detailed_demographics --start-date 2026-03-01 --end-date 2026-03-31 --dimension city",
        notes: [],
      },
    ],
    ...overrides,
  };
}

describe("serving direct release verification", () => {
  it("builds the exact proven user-facing GET route set", () => {
    const routes = buildServingDirectReleaseSmokeRoutes({
      baseUrl: "https://adsecute.com",
      businessId: "test-business",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      demographicsDimension: "country",
    });

    expect(routes).toHaveLength(12);
    expect(routes.map((route) => route.path)).toEqual([
      "/api/overview",
      "/api/overview-summary",
      "/api/overview-sparklines",
      "/api/analytics/overview",
      "/api/analytics/audience",
      "/api/analytics/cohorts",
      "/api/analytics/demographics",
      "/api/analytics/landing-page-performance",
      "/api/analytics/landing-pages",
      "/api/analytics/products",
      "/api/seo/overview",
      "/api/seo/findings",
    ]);
    expect(routes.find((route) => route.path === "/api/overview-summary")?.url).toContain(
      "compareMode=none",
    );
    expect(routes.find((route) => route.path === "/api/analytics/demographics")?.url).toContain(
      "dimension=country",
    );
  });

  it("summarizes blockers conservatively from automated misses, build mismatch, and http failures", () => {
    const freshnessStatus = buildFreshnessReport({
      classifications: {
        automated_present: 0,
        automated_missing: 1,
        manual_boundary: 1,
        manual_missing: 0,
        unknown: 0,
      },
      entries: [
        {
          ...buildFreshnessReport().entries[0],
          surface: "provider_reporting_snapshots.ga4_detailed_products",
          statusClassification: "automated_missing",
          lastObserved: {
            targetUpdatedAt: null,
          },
          ageMs: {
            targetUpdatedAt: null,
          },
        },
        buildFreshnessReport().entries[1],
      ],
    });

    const summary = summarizeServingDirectReleaseVerification({
      releaseMode: "post_deploy",
      freshnessStatus,
      buildInfo: {
        path: "/api/build-info",
        url: "https://adsecute.com/api/build-info",
        status: "failed",
        httpStatus: 200,
        observedBuildId: "wrong",
        expectedBuildId: "expected",
        matchesExpectedBuildId: false,
        error: null,
      },
      routeResults: [
        {
          routeId: "analytics_products",
          path: "/api/analytics/products",
          url: "https://adsecute.com/api/analytics/products?businessId=test-business",
          status: "failed",
          httpStatus: 500,
          contentType: "application/json",
          error: null,
          skippedReason: null,
          requiresAuth: true,
        },
      ],
      authenticatedRouteSmokeEnabled: true,
    });

    expect(summary.result).toBe("fail");
    expect(summary.blockers).toEqual([
      "Automated surface missing: provider_reporting_snapshots.ga4_detailed_products",
      "Build ID mismatch: expected expected, observed wrong.",
      "HTTP smoke failed for /api/analytics/products with status 500.",
    ]);
    expect(summary.manualFallbackCommands).toEqual([
      {
        surface: "provider_reporting_snapshots.ga4_detailed_demographics.non_country_dimension",
        command:
          "npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_detailed_demographics --start-date 2026-03-01 --end-date 2026-03-31 --dimension city",
      },
    ]);
  });

  it("builds the default 30-day verification window", () => {
    expect(buildServingDirectReleaseWindow(new Date("2026-04-09T12:00:00.000Z"))).toEqual({
      startDate: "2026-03-11",
      endDate: "2026-04-09",
    });
  });
});
