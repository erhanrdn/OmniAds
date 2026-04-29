import { describe, expect, it } from "vitest";
import rawMetrics from "@/docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/raw-metrics.json";
import {
  CREATIVE_CANONICAL_DECISION_RESOLVER_VERSION,
  DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
  applyCreativeCanonicalReasonEnrichment,
  resolveCreativeCanonicalDecision,
  resolveCreativeCanonicalDecisionForAuditRow,
} from "@/lib/creative-canonical-decision";
import {
  creativeCalibrationPersonalWeight,
  shrinkCreativeCalibrationValue,
} from "@/lib/creative-decision-confidence";

const rows = rawMetrics.rows as Array<Record<string, unknown>>;

function byName(name: string) {
  const row = rows.find((item) => item.creativeName === name);
  if (!row) throw new Error(`Missing audit fixture row ${name}`);
  return row;
}

describe("creative canonical decision resolver", () => {
  it("emits the canonical payload contract for every audit row", () => {
    const decisions = rows.map((row) => resolveCreativeCanonicalDecisionForAuditRow(row));

    expect(decisions).toHaveLength(75);
    for (const decision of decisions) {
      expect(decision.debug.resolverVersion).toBe(CREATIVE_CANONICAL_DECISION_RESOLVER_VERSION);
      expect(decision.primaryReason.length).toBeGreaterThan(20);
      expect(decision.reasonChips.length).toBeGreaterThan(0);
      expect(decision.confidence.value).toBeGreaterThanOrEqual(0);
      expect(decision.confidence.value).toBeLessThanOrEqual(1);
      expect(decision.debug.readinessReasons).toEqual(expect.any(Array));
      expect(decision.debug.diagnosticFlags).toEqual(expect.any(Array));
    }
  });

  it("locks the Happy Harbor severe disagreement examples", () => {
    expect(resolveCreativeCanonicalDecisionForAuditRow(byName("WoodenWallArtCatalog")).action)
      .toBe("refresh");
    expect(resolveCreativeCanonicalDecisionForAuditRow(byName("depth")).action)
      .toBe("cut");

    const wallArt = resolveCreativeCanonicalDecisionForAuditRow(byName("WallArtCatalog"));
    expect(["test_more", "protect"]).toContain(wallArt.action);
    expect(wallArt.actionReadiness).toBe("needs_review");
    expect(wallArt.action).not.toBe("diagnose");

    expect(["scale", "protect"]).toContain(
      resolveCreativeCanonicalDecisionForAuditRow(byName("biterevise")).action,
    );
    expect(["scale", "protect"]).toContain(
      resolveCreativeCanonicalDecisionForAuditRow(byName("restraintrevise")).action,
    );
  });

  it("does not recreate the blanket-diagnose production regression", () => {
    const decisions = rows.map((row) => ({
      row,
      decision: resolveCreativeCanonicalDecisionForAuditRow(row),
    }));
    const counts = decisions.reduce<Record<string, number>>((acc, { decision }) => {
      acc[decision.action] = (acc[decision.action] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts.diagnose ?? 0).toBeLessThanOrEqual(15);
    expect(counts.diagnose ?? 0).toBeLessThan(58);
    expect(counts.cut ?? 0).toBeGreaterThan(0);
    expect(counts.scale ?? 0).toBeGreaterThan(0);
    for (const { row, decision } of decisions) {
      if (decision.action !== "diagnose" || decision.actionReadiness !== "blocked") continue;
      expect(["inactive_or_immaterial", "measurement_suspect"]).toContain(row.trustState);
      expect(Number(row.spend ?? 0)).toBeLessThan(DEFAULT_CREATIVE_CANONICAL_THRESHOLDS.minSpendForDecision);
    }
  });

  it("is deterministic across repeated full-fixture runs", () => {
    const first = rows.map((row) => resolveCreativeCanonicalDecisionForAuditRow(row));
    const second = rows.map((row) => resolveCreativeCanonicalDecisionForAuditRow(row));
    expect(second).toEqual(first);
  });

  it("keeps missing commercial truth as review posture instead of a hard blocker", () => {
    const wallArt = resolveCreativeCanonicalDecisionForAuditRow(byName("WallArtCatalog"));

    expect(wallArt.debug.diagnosticFlags).toContain("commercial_truth_missing");
    expect(wallArt.actionReadiness).toBe("needs_review");
    expect(wallArt.action).not.toBe("diagnose");
  });

  it("does not block target-pack-missing winners", () => {
    const decision = resolveCreativeCanonicalDecision({
      creativeId: "target-pack-missing-winner",
      creativeName: "Target pack missing winner",
      trustState: "live_confident",
      commercialTruthConfigured: false,
      spend: 500,
      purchases: 8,
      purchaseValue: 1500,
      impressions: 12000,
      linkClicks: 600,
      roas: 3,
      ctr: 5,
    });

    expect(["scale", "protect", "test_more", "refresh", "cut"]).toContain(decision.action);
    expect(decision.actionReadiness).toBe("needs_review");
    expect(`${decision.action}:${decision.actionReadiness}`).not.toBe("diagnose:blocked");
  });

  it("cuts mature zero-purchase spend leakage above the low-evidence gate", () => {
    const decision = resolveCreativeCanonicalDecision({
      creativeId: "zero-purchase-leak-mature",
      creativeName: "Zero purchase leak",
      spend: 420,
      purchases: 0,
      impressions: 9000,
      linkClicks: 250,
      purchaseValue: 0,
      roas: 0,
      ctr: 2.7,
      activeStatus: true,
      trustState: "live_confident",
      commercialTruthConfigured: true,
    });

    expect(decision.action).toBe("cut");
    expect(decision.actionReadiness).not.toBe("blocked");
    expect(decision.reasonChips).toContain("zero_purchase_leak");
  });

  it("does not silently fall back to test_more for mature zero-purchase leakage", () => {
    const decision = resolveCreativeCanonicalDecision({
      creativeId: "zero-purchase-leak-high-spend",
      creativeName: "High spend zero purchase leak",
      spend: 800,
      purchases: 0,
      impressions: 12000,
      linkClicks: 320,
      purchaseValue: 0,
      roas: 0,
      ctr: 2.4,
      activeDelivery: true,
      trustState: "live_confident",
      commercialTruthConfigured: true,
    });

    expect(decision.action).not.toBe("test_more");
    expect(decision.action).toBe("cut");
  });

  it("does not collapse uncalibrated clear-winner confidence to 0.20", () => {
    const decision = resolveCreativeCanonicalDecision({
      creativeId: "clear-winner",
      creativeName: "Clear winner",
      spend: 1200,
      purchases: 20,
      purchaseValue: 7200,
      impressions: 40000,
      linkClicks: 1800,
      roas: 6,
      baselineMedianRoas: 3,
      trustState: "live_confident",
      commercialTruthConfigured: true,
    });

    expect(decision.confidence.value).toBeGreaterThanOrEqual(0.55);
    expect(decision.confidence.deterministic).toBeGreaterThanOrEqual(0.65);
  });

  it("shrinks low-n calibration threshold movement", () => {
    expect(creativeCalibrationPersonalWeight(10, 50)).toBeCloseTo(0.167, 3);
    expect(creativeCalibrationPersonalWeight(20, 50)).toBeCloseTo(0.286, 3);
    expect(creativeCalibrationPersonalWeight(50, 50)).toBeCloseTo(0.5, 3);
    expect(creativeCalibrationPersonalWeight(100, 50)).toBeCloseTo(0.667, 3);
    expect(shrinkCreativeCalibrationValue(0.9, 0.5, 10, 50)).toBeLessThan(0.58);
  });

  it("rejects LLM enrichment that attempts to change canonical action fields", () => {
    const base = resolveCreativeCanonicalDecisionForAuditRow(byName("WoodenWallArtCatalog"));
    expect(
      applyCreativeCanonicalReasonEnrichment(base, {
        primaryReason: "Reviewed explanation text.",
        reasonChips: ["reviewed_reason"],
      }).action,
    ).toBe(base.action);
    expect(() =>
      applyCreativeCanonicalReasonEnrichment(base, {
        primaryReason: "Bad enrichment",
        action: "cut",
      } as never),
    ).toThrow(/cannot set canonical action/);
  });
});
