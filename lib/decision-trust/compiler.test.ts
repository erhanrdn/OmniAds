import { describe, expect, it } from "vitest";
import { compileDecisionTrust } from "@/lib/decision-trust/compiler";
import { buildDecisionFreshness } from "@/lib/decision-trust/kernel";

describe("compileDecisionTrust", () => {
  it("forces inactive or immaterial entities into archive context with shared suppression evidence", () => {
    const trust = compileDecisionTrust({
      surfaceLane: "action_core",
      truthState: "live_confident",
      operatorDisposition: "standard",
      entityState: "paused",
      materiality: "immaterial",
      reasons: ["Entity is paused."],
      freshness: buildDecisionFreshness({
        status: "stale",
        updatedAt: "2026-04-10T00:00:00.000Z",
        reason: "No fresh signal arrived.",
      }),
    });

    expect(trust).toMatchObject({
      surfaceLane: "archive_context",
      truthState: "inactive_or_immaterial",
      operatorDisposition: "archive_only",
    });
    expect(trust.evidence).toMatchObject({
      entityState: "paused",
      materiality: "immaterial",
      completeness: "complete",
      suppressed: true,
      aggressiveActionBlocked: true,
      freshness: {
        status: "stale",
      },
    });
  });

  it("keeps review-reduce decisions in action core while preserving degraded trust evidence", () => {
    const trust = compileDecisionTrust({
      surfaceLane: "action_core",
      truthState: "degraded_missing_truth",
      operatorDisposition: "review_reduce",
      entityState: "active",
      materiality: "material",
      missingInputs: ["target_pack", "country_economics"],
      reasons: ["Commercial truth is incomplete."],
    });

    expect(trust).toMatchObject({
      surfaceLane: "action_core",
      truthState: "degraded_missing_truth",
      operatorDisposition: "review_reduce",
    });
    expect(trust.evidence).toMatchObject({
      completeness: "partial",
      suppressed: false,
      aggressiveActionBlocked: true,
    });
    expect(trust.evidence?.aggressiveActionBlockReasons).toContain(
      "Commercial truth is incomplete.",
    );
  });
});
