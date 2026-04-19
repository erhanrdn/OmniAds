import { describe, expect, it } from "vitest";
import {
  countConsecutiveSuccessfulMetaWatchWindowRuns,
  evaluateMetaWatchWindowAcceptance,
  evaluateMetaWatchWindowStability,
  isMetaWatchWindowStreakEligible,
} from "@/lib/sync/meta-watch-window";

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
          mode: "block",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
          mode: "block",
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
          mode: "block",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
          mode: "block",
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
          mode: "block",
        },
        releaseGate: {
          id: "release-1",
          verdict: "measure_only",
          mode: "measure_only",
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

  it("can require gate modes to be block for product-ready signoff", () => {
    const result = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-1",
        controlPlanePersistence: {
          exactRowsPresent: true,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
          mode: "warn_only",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
          mode: "measure_only",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [],
        },
      },
      "build-1",
      { requireBlockModes: true },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("deploy_gate_mode_not_block");
    expect(result.reasons).toContain("release_gate_mode_not_block");
  });

  it("rejects a clean deploy when the stability window regresses", () => {
    const immediateAcceptance = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-1",
        controlPlanePersistence: {
          exactRowsPresent: true,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
          mode: "block",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
          mode: "block",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [],
        },
      },
      "build-1",
    );
    const stabilityAcceptance = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-1",
        controlPlanePersistence: {
          exactRowsPresent: true,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
          mode: "block",
        },
        releaseGate: {
          id: "release-1",
          verdict: "blocked",
          mode: "block",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [{ businessId: "biz-1" }],
        },
      },
      "build-1",
    );

    const result = evaluateMetaWatchWindowStability({
      immediateAcceptance,
      stabilityAcceptance,
      manualRemediationObserved: false,
    });

    expect(result.cleanDeployAccepted).toBe(false);
    expect(result.stabilityWindowPassed).toBe(false);
    expect(result.reasons).toContain("stability_release_gate_not_pass");
    expect(result.reasons).toContain("stability_repair_plan_not_empty");
  });

  it("rejects a clean deploy when manual remediation runs during the stability window", () => {
    const immediateAcceptance = evaluateMetaWatchWindowAcceptance(
      {
        buildId: "build-1",
        controlPlanePersistence: {
          exactRowsPresent: true,
        },
        deployGate: {
          id: "deploy-1",
          verdict: "pass",
          mode: "block",
        },
        releaseGate: {
          id: "release-1",
          verdict: "pass",
          mode: "block",
        },
        repairPlan: {
          id: "plan-1",
          recommendations: [],
        },
      },
      "build-1",
    );

    const result = evaluateMetaWatchWindowStability({
      immediateAcceptance,
      stabilityAcceptance: immediateAcceptance,
      manualRemediationObserved: true,
    });

    expect(result.cleanDeployAccepted).toBe(false);
    expect(result.stabilityWindowPassed).toBe(true);
    expect(result.manualRemediationObserved).toBe(true);
    expect(result.reasons).toContain("manual_remediation_observed");
  });

  it("counts only consecutive deploy-triggered successful watch runs toward the official streak", () => {
    expect(
      countConsecutiveSuccessfulMetaWatchWindowRuns([
        { conclusion: "success", event: "workflow_dispatch" },
        { conclusion: "success", event: "workflow_run" },
        { conclusion: "success", event: "workflow_run" },
        { conclusion: "failure", event: "workflow_run" },
        { conclusion: "success", event: "workflow_run" },
      ]),
    ).toBe(2);
  });

  it("ignores non-terminal watch runs when calculating the official streak", () => {
    expect(
      countConsecutiveSuccessfulMetaWatchWindowRuns([
        { conclusion: null, event: "workflow_run" },
        { conclusion: "success", event: "workflow_run" },
        { conclusion: "success", event: "workflow_run" },
      ]),
    ).toBe(2);
  });

  it("marks only deploy-triggered runs as streak eligible", () => {
    expect(isMetaWatchWindowStreakEligible("workflow_run")).toBe(true);
    expect(isMetaWatchWindowStreakEligible("workflow_dispatch")).toBe(false);
    expect(isMetaWatchWindowStreakEligible(null)).toBe(false);
  });
});
