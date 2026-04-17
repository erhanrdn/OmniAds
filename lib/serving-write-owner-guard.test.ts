import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GA4_AUTO_WARM_DATE_WINDOWS,
  GA4_AUTO_WARM_DETAIL_REQUESTS,
  SHOPIFY_AUTOMATED_OVERVIEW_SNAPSHOT_REPORT_TYPE,
  isGa4AutoWarmDemographicsDimension,
  isGa4AutoWarmDetailRequest,
  isGa4AutoWarmWindowDays,
  shouldAutoWarmShopifyOverviewSnapshot,
} from "@/lib/sync/report-warmer-boundaries";

const repoRoot = process.cwd();

const writerImportSpecifiers = [
  "@/lib/overview-summary-materializer",
  "@/lib/overview-summary-range-owner",
  "@/lib/reporting-cache-writer",
  "@/lib/user-facing-report-cache-owners",
  "@/lib/seo/results-cache-writer",
  "@/lib/shopify/overview-materializer",
];

const sharedReadModules = [
  "lib/overview-service.ts",
  "lib/overview-summary-store.ts",
  "lib/reporting-cache.ts",
  "lib/route-report-cache.ts",
  "lib/shopify/read-adapter.ts",
  "lib/shopify/overview.ts",
  "lib/seo/results-cache.ts",
  "app/api/overview/route.ts",
  "app/api/overview-summary/route.ts",
  "app/api/overview-sparklines/route.ts",
  "app/api/analytics/overview/route.ts",
  "app/api/analytics/audience/route.ts",
  "app/api/analytics/cohorts/route.ts",
  "app/api/analytics/demographics/route.ts",
  "app/api/analytics/landing-page-performance/route.ts",
  "app/api/analytics/landing-pages/route.ts",
  "app/api/analytics/products/route.ts",
  "app/api/seo/overview/route.ts",
  "app/api/seo/findings/route.ts",
];

const explicitOwnerEntrypoints = [
  ["lib/google-ads/warehouse.ts", "@/lib/overview-summary-materializer"],
  ["lib/meta/warehouse.ts", "@/lib/overview-summary-materializer"],
  ["scripts/materialize-overview-summary-range.ts", "@/lib/overview-summary-range-owner"],
  ["lib/sync/ga4-sync.ts", "@/lib/user-facing-report-cache-owners"],
  ["scripts/warm-user-facing-report-cache.ts", "@/lib/user-facing-report-cache-owners"],
  ["lib/sync/shopify-sync.ts", "@/lib/user-facing-report-cache-owners"],
  ["lib/meta/cleanup.ts", "@/lib/reporting-cache-writer"],
  ["lib/sync/search-console-sync.ts", "@/lib/seo/results-cache-writer"],
  ["lib/sync/shopify-sync.ts", "@/lib/shopify/overview-materializer"],
  ["app/api/webhooks/shopify/sync/route.ts", "@/lib/shopify/overview-materializer"],
] as const;

const inScopeOwnerCoverage = [
  {
    surface: "platform_overview_summary_ranges",
    entrypoints: ["scripts/materialize-overview-summary-range.ts"],
  },
  {
    surface: "provider_reporting_snapshots_ga4_user_facing",
    entrypoints: ["lib/sync/ga4-sync.ts", "scripts/warm-user-facing-report-cache.ts"],
  },
  {
    surface: "provider_reporting_snapshots_shopify_overview",
    entrypoints: ["scripts/warm-user-facing-report-cache.ts", "lib/sync/shopify-sync.ts"],
  },
  {
    surface: "seo_results_cache_findings",
    entrypoints: ["lib/sync/search-console-sync.ts"],
  },
  {
    surface: "shopify_serving_state",
    entrypoints: ["lib/sync/shopify-sync.ts", "app/api/webhooks/shopify/sync/route.ts"],
  },
  {
    surface: "shopify_reconciliation_runs",
    entrypoints: ["lib/sync/shopify-sync.ts"],
  },
] as const;

const targetWriteRules = [
  {
    allowedFiles: new Set([
      "lib/overview-summary-materializer.ts",
      "scripts/db-normalization-support.ts",
      "scripts/db-write-benchmark.ts",
    ]),
    patterns: [
      /\bINSERT\s+INTO\s+platform_overview_daily_summary\b/i,
      /\bINSERT\s+INTO\s+platform_overview_summary_ranges\b/i,
      /\bDELETE\s+FROM\s+platform_overview_summary_ranges\b/i,
    ],
  },
  {
    allowedFiles: new Set([
      "lib/reporting-cache-writer.ts",
      "lib/google-ads/warehouse.ts",
      "scripts/reset-google-ads-stack.ts",
      "scripts/db-normalization-support.ts",
      "scripts/db-write-benchmark.ts",
    ]),
    patterns: [
      /\bINSERT\s+INTO\s+provider_reporting_snapshots\b/i,
      /\bDELETE\s+FROM\s+provider_reporting_snapshots\b/i,
      /\bUPDATE\s+provider_reporting_snapshots\b/i,
    ],
  },
  {
    allowedFiles: new Set([
      "lib/seo/results-cache-writer.ts",
    ]),
    patterns: [
      /\bINSERT\s+INTO\s+seo_results_cache\b/i,
      /\bDELETE\s+FROM\s+seo_results_cache\b/i,
      /\bUPDATE\s+seo_results_cache\b/i,
    ],
  },
  {
    allowedFiles: new Set([
      "lib/shopify/overview-materializer.ts",
    ]),
    patterns: [
      /\bINSERT\s+INTO\s+shopify_reconciliation_runs\b/i,
      /\bINSERT\s+INTO\s+shopify_serving_state\b/i,
      /\bINSERT\s+INTO\s+shopify_serving_state_history\b/i,
      /\bUPDATE\s+shopify_serving_state\b/i,
    ],
  },
] as const;

function walkSourceFiles(currentPath: string, found: string[] = []) {
  if (!fs.existsSync(currentPath)) return found;
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walkSourceFiles(absolutePath, found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|mts|cts|mjs)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx|mts|cts|mjs)$/.test(entry.name)) continue;
    found.push(absolutePath);
  }
  return found;
}

describe("serving write owner guard", () => {
  it("shared read modules do not import explicit writer/materializer modules", () => {
    for (const relativePath of sharedReadModules) {
      const content = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      for (const specifier of writerImportSpecifiers) {
        expect(content).not.toContain(specifier);
      }
    }
  });

  it("explicit non-GET entrypoints import the approved owner modules", () => {
    for (const [relativePath, specifier] of explicitOwnerEntrypoints) {
      const content = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      expect(content).toContain(specifier);
    }
  });

  it("in-scope serving surfaces retain explicit non-GET owner triggers", () => {
    for (const coverage of inScopeOwnerCoverage) {
      for (const relativePath of coverage.entrypoints) {
        expect(
          fs.existsSync(path.join(repoRoot, relativePath)),
          `${coverage.surface} is missing trigger entrypoint ${relativePath}`,
        ).toBe(true);
      }
    }
  });

  it("scheduled cache warmers keep their automated versus manual guardrails explicit", () => {
    expect(GA4_AUTO_WARM_DATE_WINDOWS).toEqual([
      { label: "30d", days: 30 },
      { label: "7d", days: 7 },
    ]);
    expect(isGa4AutoWarmWindowDays(30)).toBe(true);
    expect(isGa4AutoWarmWindowDays(7)).toBe(true);
    expect(isGa4AutoWarmWindowDays(14)).toBe(false);

    expect(GA4_AUTO_WARM_DETAIL_REQUESTS).toEqual([
      { reportType: "ga4_detailed_audience" },
      { reportType: "ga4_detailed_cohorts" },
      { reportType: "ga4_detailed_demographics", dimension: "country" },
      { reportType: "ga4_landing_page_performance_v1" },
      { reportType: "ga4_detailed_landing_pages" },
      { reportType: "ga4_detailed_products" },
    ]);
    expect(isGa4AutoWarmDemographicsDimension("country")).toBe(true);
    expect(isGa4AutoWarmDemographicsDimension("city")).toBe(false);
    expect(
      isGa4AutoWarmDetailRequest({
        reportType: "ga4_detailed_demographics",
        dimension: "country",
      }),
    ).toBe(true);
    expect(
      isGa4AutoWarmDetailRequest({
        reportType: "ga4_detailed_demographics",
        dimension: "city",
      }),
    ).toBe(false);
    expect(
      isGa4AutoWarmDetailRequest({
        reportType: "ga4_detailed_audience",
        dimension: "country",
      }),
    ).toBe(false);

    expect(SHOPIFY_AUTOMATED_OVERVIEW_SNAPSHOT_REPORT_TYPE).toBe(
      "overview_shopify_orders_aggregate_v6",
    );
    expect(shouldAutoWarmShopifyOverviewSnapshot()).toBe(true);
    expect(shouldAutoWarmShopifyOverviewSnapshot({ materializeOverviewState: true })).toBe(true);
    expect(shouldAutoWarmShopifyOverviewSnapshot({ materializeOverviewState: false })).toBe(false);
  });

  it("target surfaces are written only from approved owner modules", () => {
    const sourceFiles = [
      ...walkSourceFiles(path.join(repoRoot, "app")),
      ...walkSourceFiles(path.join(repoRoot, "lib")),
      ...walkSourceFiles(path.join(repoRoot, "scripts")),
    ];

    const violations: string[] = [];
    for (const absolutePath of sourceFiles) {
      const relativePath = path.relative(repoRoot, absolutePath);
      const content = fs.readFileSync(absolutePath, "utf8");
      for (const rule of targetWriteRules) {
        if (rule.allowedFiles.has(relativePath)) continue;
        for (const pattern of rule.patterns) {
          if (pattern.test(content)) {
            violations.push(`${relativePath}: ${pattern}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
