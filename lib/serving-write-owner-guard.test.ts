import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const writerImportSpecifiers = [
  "@/lib/overview-summary-materializer",
  "@/lib/reporting-cache-writer",
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
  ["lib/sync/ga4-sync.ts", "@/lib/reporting-cache-writer"],
  ["lib/meta/cleanup.ts", "@/lib/reporting-cache-writer"],
  ["lib/sync/search-console-sync.ts", "@/lib/seo/results-cache-writer"],
  ["app/api/webhooks/shopify/sync/route.ts", "@/lib/shopify/overview-materializer"],
] as const;

const targetWriteRules = [
  {
    allowedFiles: new Set([
      "lib/overview-summary-materializer.ts",
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
