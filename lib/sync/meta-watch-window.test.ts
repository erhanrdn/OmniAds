import { describe, expect, it } from "vitest";
import { evaluateMetaWatchWindowAcceptance } from "@/lib/sync/meta-watch-window";

describe("evaluateMetaWatchWindowAcceptance", () => {
  it("accepts the closed Meta state", () => {
    const result = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-1",
        controlPlanePersistence: {
          exactRowsPresent: true,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [],
        },
      },
      "build-1",
    );

    expect(result.accepted).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects build mismatch and missing exact rows", () => {
    const result = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-0",
        controlPlanePersistence: {
          exactRowsPresent: false,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [],
        },
      },
      "build-1",
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("build_id_mismatch");
    expect(result.reasons).toContain("exact_rows_missing");
  });

  it("rejects non-pass release gate and non-empty repair plan", () => {
    const result = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-1",
        controlPlanePersistence: {
          exactRowsPresent: true,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
        },
        releaseGate: {
          id: "release-1",
          verdict: "measure_only",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [{ businessId: "biz-1" }],
        },
      },
      "build-1",
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("release_gate_not_pass");
    expect(result.reasons).toContain("repair_plan_not_empty");
  });
});
