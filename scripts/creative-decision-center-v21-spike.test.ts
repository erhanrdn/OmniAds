import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const generatedDir = "docs/creative-decision-center/generated";

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(`${generatedDir}/${name}.json`, "utf8")) as T;
}

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

describe("Creative Decision Center V2.1 spike artifacts", () => {
  it("keeps at least 30 golden cases with non-buyer-action assertions", () => {
    const cases = readJson<Array<Record<string, unknown>>>("golden-cases");

    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const item of cases) {
      expect(item.expectedPrimaryDecision).toBeTruthy();
      expect(item.expectedBuyerAction).toBeTruthy();
      expect(item.expectedActionability).toBeTruthy();
      expect(item.expectedProblemClass).toBeTruthy();
      expect(item.expectedPriorityBand).toBeTruthy();
      expect(item.expectedConfidenceBand).toBeTruthy();
      expect(item.expectedTopReasonTag).toBeTruthy();
      expect(item.expectedMaturity).toBeTruthy();
    }
  });

  it("does not emit row-level brief_variation in shadow output", () => {
    const report = readJson<{ rows: Array<{ afterBuyerAction: string }> }>(
      "before-after-shadow",
    );

    expect(
      report.rows.some((row) => row.afterBuyerAction === "brief_variation"),
    ).toBe(false);
  });

  it("enforces safety invariants in fixture-backed shadow output", () => {
    const report = readJson<{
      rows: Array<{
        afterBuyerAction: string;
        afterConfidenceBand: string;
        afterProblemClass: string;
        topReasonTag: string;
        missingData: string[];
        creativeName: string;
      }>;
    }>("before-after-shadow");

    for (const row of report.rows) {
      if (row.afterBuyerAction === "fix_delivery") {
        expect(row.topReasonTag).toBe("active_no_spend_24h");
        expect(row.missingData).toHaveLength(0);
      }
      if (row.afterBuyerAction === "fix_policy") {
        expect(row.topReasonTag).toBe("disapproved_or_limited");
        expect(row.missingData).toHaveLength(0);
      }
      if (
        ["scale", "cut"].includes(row.afterBuyerAction) &&
        row.missingData.length > 0
      ) {
        expect(row.afterConfidenceBand).not.toBe("high");
      }
      if (row.creativeName.toLowerCase().includes("disapproved")) {
        expect(row.afterBuyerAction).toBe("fix_policy");
      }
      if (row.creativeName.toLowerCase().includes("paused campaign")) {
        expect(row.afterBuyerAction).not.toBe("fix_delivery");
      }
    }
  });

  it("captures metamorphic sensitivity for freshness and benchmark changes", () => {
    const report = readJson<
      Array<{
        config: string;
        decisionsChanged: number;
        unsafeScaleCut: number;
      }>
    >("config-sensitivity");

    const aggressive = report.find((item) => item.config === "aggressive");
    const conservative = report.find((item) => item.config === "conservative");

    expect(aggressive?.decisionsChanged).toBeGreaterThan(0);
    expect(aggressive?.unsafeScaleCut).toBe(0);
    expect(conservative?.unsafeScaleCut).toBe(0);
  });

  it("finds no production UI buyerAction computation yet", () => {
    const roots = ["app/(dashboard)/creatives", "components/creatives"];
    const files = roots.flatMap(listSourceFiles);

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /buyerAction\s*=|buyerAction:\s*|afterBuyerAction|brief_variation/.test(
        source,
      );
    });

    expect(offenders).toEqual([]);
  });

  it("records live-read status explicitly", () => {
    const status = readJson<{
      attempted: boolean;
      reason: string;
      missingEnv: string[];
    }>("live-status");

    expect(typeof status.attempted).toBe("boolean");
    expect(status.reason.length).toBeGreaterThan(0);
    expect(Array.isArray(status.missingEnv)).toBe(true);
  });
});
