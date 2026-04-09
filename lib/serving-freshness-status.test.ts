import { describe, expect, it } from "vitest";
import {
  buildServingFreshnessStatusEntrySpecs,
  classifyServingFreshnessStatus,
} from "@/lib/serving-freshness-status";

describe("serving freshness status", () => {
  it("classifies automated, manual, and unknown boundaries conservatively", () => {
    expect(
      classifyServingFreshnessStatus({
        automationMode: "automated",
        applicable: true,
        observedTargetTimestamp: "2026-04-09T12:00:00.000Z",
      }),
    ).toBe("automated_present");
    expect(
      classifyServingFreshnessStatus({
        automationMode: "automated",
        applicable: true,
      }),
    ).toBe("automated_missing");
    expect(
      classifyServingFreshnessStatus({
        automationMode: "manual",
        applicable: true,
        exactManualSelection: false,
      }),
    ).toBe("manual_boundary");
    expect(
      classifyServingFreshnessStatus({
        automationMode: "manual",
        applicable: true,
        exactManualSelection: true,
      }),
    ).toBe("manual_missing");
    expect(
      classifyServingFreshnessStatus({
        automationMode: "manual",
        applicable: false,
        exactManualSelection: true,
      }),
    ).toBe("unknown");
  });

  it("builds automated and manual status specs for all in-scope surfaces", () => {
    const specs = buildServingFreshnessStatusEntrySpecs({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      demographicsDimension: "city",
      referenceDate: new Date("2026-04-09T12:00:00.000Z"),
      shopifyRecentWindowDays: 7,
      shopifyRecentWindow: {
        startDate: "2026-04-03",
        endDate: "2026-04-09",
      },
    });

    expect(specs.some((entry) => entry.surface === "platform_overview_summary_ranges.google")).toBe(true);
    expect(specs.some((entry) => entry.surface === "platform_overview_summary_ranges.meta")).toBe(true);
    expect(
      specs.filter((entry) => entry.surface === "provider_reporting_snapshots.ga4_analytics_overview").length,
    ).toBe(2);
    expect(
      specs.filter((entry) => entry.surface === "provider_reporting_snapshots.ecommerce_fallback").length,
    ).toBe(2);
    expect(
      specs.filter((entry) => entry.surface === "provider_reporting_snapshots.ga4_detailed_demographics").length,
    ).toBe(2);
    expect(
      specs.some(
        (entry) =>
          entry.surface === "provider_reporting_snapshots.ga4_detailed_demographics.non_country_dimension" &&
          entry.selection.dimension === "city",
      ),
    ).toBe(true);
    expect(
      specs.some(
        (entry) =>
          entry.surface === "provider_reporting_snapshots.ga4_detailed_audience.custom_window" &&
          entry.selection.startDate === "2026-03-01" &&
          entry.selection.endDate === "2026-03-31",
      ),
    ).toBe(true);
    expect(
      specs.some(
        (entry) =>
          entry.surface === "provider_reporting_snapshots.overview_shopify_orders_aggregate_v6.recent_window" &&
          entry.selection.startDate === "2026-04-03" &&
          entry.selection.endDate === "2026-04-09",
      ),
    ).toBe(true);
    expect(
      specs.some(
        (entry) =>
          entry.surface === "provider_reporting_snapshots.overview_shopify_orders_aggregate_v6.custom_window" &&
          entry.selection.startDate === "2026-03-01" &&
          entry.selection.endDate === "2026-03-31",
      ),
    ).toBe(true);
    expect(specs.some((entry) => entry.surface === "seo_results_cache.overview")).toBe(true);
    expect(specs.some((entry) => entry.surface === "seo_results_cache.findings")).toBe(true);
    expect(specs.some((entry) => entry.surface === "shopify_serving_state")).toBe(true);
    expect(specs.some((entry) => entry.surface === "shopify_reconciliation_runs")).toBe(true);
  });

  it("builds exact operator fallback commands for manual boundaries", () => {
    const specs = buildServingFreshnessStatusEntrySpecs({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      demographicsDimension: "city",
      referenceDate: new Date("2026-04-09T12:00:00.000Z"),
      shopifyRecentWindow: {
        startDate: "2026-04-03",
        endDate: "2026-04-09",
      },
    });

    expect(
      specs.find((entry) => entry.surface === "platform_overview_summary_ranges.google")
        ?.operatorFallbackCommand,
    ).toBe(
      "npm run overview:summary:materialize -- --business-id <business_id> --provider google --start-date 2026-03-01 --end-date 2026-03-31",
    );
    expect(
      specs.find(
        (entry) =>
          entry.surface === "provider_reporting_snapshots.ga4_detailed_demographics.non_country_dimension",
      )?.operatorFallbackCommand,
    ).toBe(
      "npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_detailed_demographics --start-date 2026-03-01 --end-date 2026-03-31 --dimension city",
    );
    expect(
      specs.find(
        (entry) => entry.surface === "provider_reporting_snapshots.overview_shopify_orders_aggregate_v6.custom_window",
      )?.operatorFallbackCommand,
    ).toBe(
      "npm run reporting:cache:warm -- --business-id <business_id> --report-type overview_shopify_orders_aggregate_v6 --start-date 2026-03-01 --end-date 2026-03-31",
    );
  });
});
