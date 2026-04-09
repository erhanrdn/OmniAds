import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const guardMatrix: Array<{
  relativePath: string;
  forbiddenPatterns: RegExp[];
}> = [
  {
    relativePath: "lib/google-ads/serving.ts",
    forbiddenPatterns: [/\bhydrateOverviewSummaryRangeFromGoogle\s*\(/],
  },
  {
    relativePath: "lib/overview-service.ts",
    forbiddenPatterns: [/\bsetCachedReport\s*\(/],
  },
  {
    relativePath: "lib/shopify/read-adapter.ts",
    forbiddenPatterns: [/\bupsertShopifyServingState\s*\(/, /\binsertShopifyReconciliationRun\s*\(/],
  },
  {
    relativePath: "lib/shopify/overview.ts",
    forbiddenPatterns: [/\bsetCachedReport\s*\(/],
  },
  {
    relativePath: "lib/provider-account-discovery.ts",
    forbiddenPatterns: [/\brequestProviderAccountSnapshotRefresh\s*\(/, /\bforceProviderAccountSnapshotRefresh\s*\(/],
  },
  {
    relativePath: "lib/google-ads-gaql.ts",
    forbiddenPatterns: [/\bupsertIntegration\s*\(/, /\breadGaqlFromDb\s*\(/, /\bwriteGaqlToDb\s*\(/],
  },
  {
    relativePath: "lib/google-analytics-reporting.ts",
    forbiddenPatterns: [/\blogGa4QuotaUsage\s*\(/, /\bupsertIntegration\s*\(/],
  },
  {
    relativePath: "lib/search-console.ts",
    forbiddenPatterns: [/\bupsertIntegration\s*\(/],
  },
  {
    relativePath: "lib/business-context.ts",
    forbiddenPatterns: [/\bsetSessionActiveBusiness\s*\(/],
  },
  {
    relativePath: "app/api/analytics/overview/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/analytics/audience/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/analytics/cohorts/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/analytics/demographics/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/analytics/landing-page-performance/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/analytics/landing-pages/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/analytics/products/route.ts",
    forbiddenPatterns: [/\bsetCachedRouteReport\s*\(/],
  },
  {
    relativePath: "app/api/seo/overview/route.ts",
    forbiddenPatterns: [/\bsetSeoResultsCache\s*\(/],
  },
  {
    relativePath: "app/api/seo/findings/route.ts",
    forbiddenPatterns: [/\bsetSeoResultsCache\s*\(/],
  },
];

describe("GET read-path module guard", () => {
  for (const entry of guardMatrix) {
    it(`${entry.relativePath} does not retain banned read-time mutators`, () => {
      const content = fs.readFileSync(path.join(repoRoot, entry.relativePath), "utf8");
      for (const pattern of entry.forbiddenPatterns) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});
