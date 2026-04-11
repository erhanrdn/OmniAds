import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import { CreativeDecisionOsOverview } from "@/components/creatives/CreativeDecisionOsOverview";

function payload() {
  const metadata = buildOperatorDecisionMetadata({
    analyticsStartDate: "2026-04-01",
    analyticsEndDate: "2026-04-10",
    decisionAsOf: "2026-04-10",
  });
  return {
    contractVersion: "creative-decision-os.v1",
    engineVersion: "2026-04-11-phase-05-v2",
    generatedAt: "2026-04-10T00:00:00.000Z",
    businessId: "biz",
    startDate: "2026-04-01",
    endDate: "2026-04-10",
    analyticsWindow: metadata.analyticsWindow,
    decisionWindows: metadata.decisionWindows,
    historicalMemory: metadata.historicalMemory,
    decisionAsOf: metadata.decisionAsOf,
    summary: {
      totalCreatives: 8,
      scaleReadyCount: 2,
      keepTestingCount: 2,
      fatiguedCount: 1,
      blockedCount: 2,
      comebackCount: 1,
      protectedWinnerCount: 1,
      supplyPlanCount: 2,
      message: "Decision OS highlights which creatives to scale, keep in test, refresh, block, or retest.",
      operatingMode: "Exploit",
      surfaceSummary: {
        actionCoreCount: 4,
        watchlistCount: 2,
        archiveCount: 2,
        degradedCount: 1,
      },
    },
    creatives: [],
    lifecycleBoard: [
      { state: "incubating", label: "incubating", count: 1, creativeIds: ["c1"] },
      { state: "validating", label: "validating", count: 1, creativeIds: ["c2"] },
      { state: "scale_ready", label: "scale_ready", count: 1, creativeIds: ["c3"] },
      { state: "stable_winner", label: "stable_winner", count: 1, creativeIds: ["c4"] },
      { state: "fatigued_winner", label: "fatigued_winner", count: 1, creativeIds: ["c5"] },
      { state: "blocked", label: "blocked", count: 1, creativeIds: ["c6"] },
      { state: "retired", label: "retired", count: 1, creativeIds: ["c7"] },
      { state: "comeback_candidate", label: "comeback_candidate", count: 1, creativeIds: ["c8"] },
    ],
    operatorQueues: [
      { key: "promotion", label: "Promotion queue", summary: "Scale-ready creatives", count: 2, creativeIds: ["c3", "c4"] },
      { key: "keep_testing", label: "Keep testing", summary: "Still in test", count: 2, creativeIds: ["c1", "c2"] },
      { key: "fatigued_blocked", label: "Fatigued / blocked", summary: "Refresh or block", count: 3, creativeIds: ["c5", "c6", "c7"] },
      { key: "comeback", label: "Comeback", summary: "Retest", count: 1, creativeIds: ["c8"] },
    ],
    families: [
      {
        familyId: "family:1",
        familyLabel: "Travel Hook Family",
        familySource: "copy_signature",
        creativeIds: ["c1", "c2"],
        dominantFormat: "video",
        lifecycleState: "scale_ready",
        primaryAction: "promote_to_scaling",
        totalSpend: 420,
        totalPurchaseValue: 1660,
        totalPurchases: 18,
        topAngles: ["utility"],
        topHooks: ["travel hook"],
        metaFamily: "purchase_value",
        metaFamilyLabel: "purchase/value",
        provenance: {
          confidence: "medium",
          overGroupingRisk: "medium",
          evidence: ["Heuristic family matched same format, primary taxonomy, and normalized headline."],
        },
      },
    ],
    patterns: [
      {
        patternKey: "travel",
        hook: "Travel hook",
        angle: "utility",
        format: "video",
        creativeIds: ["c1", "c2"],
        spend: 420,
        purchaseValue: 1660,
        roas: 3.95,
        lifecycleState: "scale_ready",
        confidence: 0.78,
      },
    ],
    protectedWinners: [
      {
        creativeId: "c4",
        familyId: "family:1",
        creativeName: "Winner creative",
        familyLabel: "Travel Hook Family",
        spend: 240,
        roas: 3.8,
        reasons: ["Deterministic engine marks this as a shipped winner that should stay protected."],
      },
    ],
    supplyPlan: [
      {
        kind: "expand_angle_family",
        priority: "medium",
        familyId: "family:1",
        familyLabel: "Travel Hook Family",
        creativeIds: ["c1", "c2"],
        summary: "Expand this winner family with adjacent angle variants before saturation shows up.",
        reasons: ["Family is scale-capable but creative depth is still shallow."],
      },
      {
        kind: "new_test_concepts",
        priority: "high",
        familyId: "family:2",
        familyLabel: "Backup Family",
        creativeIds: ["c5"],
        summary: "Generate fresh test concepts to widen hook and angle coverage for this family.",
        reasons: ["Family has meaningful spend but no protected winner yet."],
      },
    ],
    commercialTruthCoverage: {
      operatingMode: "Exploit",
      confidence: 0.82,
      missingInputs: [],
      activeInputs: [],
      guardrails: ["Scale in controlled steps."],
      configuredSections: {
        targetPack: true,
        countryEconomics: true,
        promoCalendar: false,
        operatingConstraints: true,
      },
    },
    historicalAnalysis: {
      summary:
        "Video leads the selected-period format mix while Travel Pack and Utility describe the strongest visible pattern. This block is analysis-only and does not change deterministic Decision Signals.",
      selectedWindow: {
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        rowCount: 8,
        materialRowCount: 6,
        note: "Analysis only. Live decisions continue to use the primary decision window.",
      },
      winningFormats: [
        {
          label: "Video",
          creativeCount: 5,
          spend: 640,
          purchaseValue: 2_240,
          purchases: 20,
          roas: 3.5,
          shareOfSpend: 0.64,
          summary: "Format Video covers 5 creative(s), 640 spend, 3.50x ROAS, and 20 purchase(s) in the selected period.",
        },
      ],
      hookTrends: [
        {
          label: "Travel Pack",
          creativeCount: 3,
          spend: 420,
          purchaseValue: 1_660,
          purchases: 18,
          roas: 3.95,
          shareOfSpend: 0.42,
          summary: "Hook Travel Pack covers 3 creative(s), 420 spend, 3.95x ROAS, and 18 purchase(s) in the selected period.",
        },
      ],
      angleTrends: [
        {
          label: "Utility",
          creativeCount: 4,
          spend: 480,
          purchaseValue: 1_780,
          purchases: 19,
          roas: 3.71,
          shareOfSpend: 0.48,
          summary: "Angle Utility covers 4 creative(s), 480 spend, 3.71x ROAS, and 19 purchase(s) in the selected period.",
        },
      ],
      familyPerformance: [
        {
          familyId: "family:1",
          familyLabel: "Travel Hook Family",
          familySource: "copy_signature",
          creativeCount: 2,
          dominantFormat: "Video",
          spend: 420,
          purchaseValue: 1_660,
          purchases: 18,
          roas: 3.95,
          topHook: "Travel Pack",
          topAngle: "Utility",
          summary:
            "Travel Hook Family covers 2 creative(s) with 420 spend and 3.95x ROAS in the selected period.",
        },
      ],
    },
  } as any;
}

describe("CreativeDecisionOsOverview", () => {
  it("renders operator-grade recommendation sections", () => {
    const html = renderToStaticMarkup(
      <CreativeDecisionOsOverview
        decisionOs={payload()}
        isLoading={false}
        activeFamilyId={null}
        activeQueueKey={null}
        onSelectFamily={vi.fn()}
        onSelectQueue={vi.fn()}
      />,
    );

    expect(html).toContain("Recommendations");
    expect(html).toContain("Creative Decision OS");
    expect(html).toContain("Decisions use live windows");
    expect(html).toContain("Lifecycle Board");
    expect(html).toContain("Operator Queues");
    expect(html).toContain("Concept Families");
    expect(html).toContain("Pattern Board");
    expect(html).toContain("Protected Winners");
    expect(html).toContain("Supply Planning");
    expect(html).toContain("Degraded commercial truth");
    expect(html).toContain("Historical Analysis");
    expect(html).toContain("Selected-period format and family patterns");
    expect(html).toContain("Travel Hook Family");
  });
});
