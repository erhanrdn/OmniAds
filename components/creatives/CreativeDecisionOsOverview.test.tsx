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
    engineVersion: "2026-04-10-phase-04-v1",
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
    expect(html).toContain("Degraded commercial truth");
  });
});
