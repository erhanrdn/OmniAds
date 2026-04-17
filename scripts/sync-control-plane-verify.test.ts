import { describe, expect, it } from "vitest";
import { evaluateSyncControlPlaneVerification } from "./sync-control-plane-verify";

describe("evaluateSyncControlPlaneVerification", () => {
  it("accepts exact rows with passing gates and an empty repair plan", () => {
    expect(
      evaluateSyncControlPlaneVerification({
        persistence: { exactRowsPresent: true },
        deployGate: { id: "dg-1", verdict: "pass", mode: "block" },
        releaseGate: { id: "rg-1", verdict: "pass", mode: "block" },
        repairPlan: { id: "rp-1", recommendations: [] },
      }),
    ).toEqual({
      accepted: true,
      reasons: [],
      exactRowsPresent: true,
      deployGatePass: true,
      releaseGatePass: true,
      repairPlanEmpty: true,
      deployGateModeBlock: true,
      releaseGateModeBlock: true,
    });
  });

  it("rejects measure-only release gates and non-empty repair plans", () => {
    expect(
      evaluateSyncControlPlaneVerification({
        persistence: { exactRowsPresent: true },
        deployGate: { id: "dg-1", verdict: "pass", mode: "block" },
        releaseGate: { id: "rg-1", verdict: "measure_only" },
        repairPlan: { id: "rp-1", recommendations: [{ businessId: "biz-1" }] },
      }),
    ).toEqual({
      accepted: false,
      reasons: ["release_gate_not_pass", "repair_plan_not_empty"],
      exactRowsPresent: true,
      deployGatePass: true,
      releaseGatePass: false,
      repairPlanEmpty: false,
      deployGateModeBlock: true,
      releaseGateModeBlock: false,
    });
  });

  it("can require deploy and release modes to be block for final signoff", () => {
    expect(
      evaluateSyncControlPlaneVerification(
        {
          persistence: { exactRowsPresent: true },
          deployGate: { id: "dg-1", verdict: "pass", mode: "warn_only" },
          releaseGate: { id: "rg-1", verdict: "pass", mode: "measure_only" },
          repairPlan: { id: "rp-1", recommendations: [] },
        },
        { requireBlockModes: true },
      ),
    ).toEqual({
      accepted: false,
      reasons: ["deploy_gate_mode_not_block", "release_gate_mode_not_block"],
      exactRowsPresent: true,
      deployGatePass: true,
      releaseGatePass: true,
      repairPlanEmpty: true,
      deployGateModeBlock: false,
      releaseGateModeBlock: false,
    });
  });
});
