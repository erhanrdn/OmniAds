import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadOverviewBenchmarkBaselineMap,
  resolveOverviewBenchmarkBaselinePath,
} from "@/scripts/overview-benchmark-lib";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("overview benchmark baseline loader", () => {
  it("returns an empty baseline map when the file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "overview-benchmark-"));
    tempDirs.push(dir);

    const baseline = loadOverviewBenchmarkBaselineMap(join(dir, "missing.json"));
    expect(baseline).toEqual({});
  });

  it("loads values from baseline keys and scenario averages", () => {
    const dir = mkdtempSync(join(tmpdir(), "overview-benchmark-"));
    tempDirs.push(dir);

    const baselinePath = join(dir, "baseline.json");
    writeFileSync(
      baselinePath,
      JSON.stringify({
        baseline: {
          overview_data_no_trends_30d_ms: 123,
        },
        scenarios: [
          {
            name: "google_ads_overview_30d",
            averageMs: 45,
          },
          {
            name: "google_ads_search_intelligence_90d",
            averageMs: 78,
          },
          {
            name: "google_ads_products_30d",
            averageMs: 52,
          },
        ],
      }),
      "utf8",
    );

    const baseline = loadOverviewBenchmarkBaselineMap(baselinePath);

    expect(baseline.overview_data_no_trends_30d_ms).toBe(123);
    expect(baseline.overview_data_no_trends_30d).toBe(123);
    expect(baseline.google_ads_overview_30d).toBe(45);
    expect(baseline.google_ads_search_intelligence_90d).toBe(78);
    expect(baseline.google_ads_products_30d).toBe(52);
    expect(resolveOverviewBenchmarkBaselinePath(baselinePath)).toContain("baseline.json");
  });
});
