import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const guardedFiles = [
  "app/api/overview/route.ts",
  "app/api/overview-summary/route.ts",
  "app/api/overview-sparklines/route.ts",
  "app/api/auth/demo-login/route.ts",
  "app/api/creatives/share/[token]/route.ts",
  "app/api/meta/summary/route.ts",
  "app/api/meta/status/route.ts",
  "app/api/meta/campaigns/route.ts",
  "app/api/meta/breakdowns/route.ts",
  "app/api/meta/top-creatives/route.ts",
  "app/api/google-ads/overview/route.ts",
  "app/api/google-ads/status/route.ts",
  "app/api/google-ads/campaigns/route.ts",
  "app/api/google-ads/search-intelligence/route.ts",
  "app/api/oauth/shopify/context/route.ts",
  "app/api/oauth/shopify/pending/route.ts",
  "app/api/reports/route.ts",
  "app/api/reports/[reportId]/route.ts",
  "app/api/reports/[reportId]/export/route.ts",
  "app/api/reports/[reportId]/render/route.ts",
  "app/api/seo/overview/route.ts",
  "app/api/seo/findings/route.ts",
  "app/api/seo/ai-analysis/route.ts",
  "lib/access.ts",
  "lib/auth.ts",
  "lib/business-timezone.ts",
  "lib/business-mode.server.ts",
  "lib/google-ads-gaql.ts",
  "lib/google-analytics-reporting.ts",
  "lib/overview-service.ts",
  "lib/overview-summary-store.ts",
  "lib/provider-account-snapshots.ts",
  "lib/provider-request-governance.ts",
  "lib/seo/results-cache.ts",
];

describe("request-path migration import guard", () => {
  for (const relativePath of guardedFiles) {
    it(`${relativePath} does not import migrations`, () => {
      const absolutePath = path.join(repoRoot, relativePath);
      const content = fs.readFileSync(absolutePath, "utf8");
      expect(content).not.toMatch(/from ["']@\/lib\/migrations["']/);
      expect(content).not.toMatch(/import\s+\{[^}]*runMigrations[^}]*\}/);
    });
  }
});
