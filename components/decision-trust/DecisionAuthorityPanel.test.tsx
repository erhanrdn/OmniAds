import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionAuthorityPanel } from "@/components/decision-trust/DecisionAuthorityPanel";
import { createEmptyBusinessCommercialCoverageSummary } from "@/src/types/business-commercial";

describe("DecisionAuthorityPanel", () => {
  it("renders thresholds, action ceilings, and blocking reasons", () => {
    const summary = createEmptyBusinessCommercialCoverageSummary();
    const html = renderToStaticMarkup(
      <DecisionAuthorityPanel
        title="Meta Authority"
        authority={{
          scope: "Meta Decision OS",
          truthState: "degraded_missing_truth",
          completeness: "missing",
          freshness: {
            status: "stale",
            updatedAt: null,
            reason: "Country breakdown data is partial.",
          },
          missingInputs: ["target_pack", "country_economics"],
          reasons: ["Commercial truth is incomplete."],
          actionCoreCount: 2,
          watchlistCount: 4,
          archiveCount: 8,
          suppressedCount: 12,
          note: "Meta Decision OS remains visible but trust-capped by missing commercial truth.",
        }}
        commercialSummary={summary}
      />,
    );

    expect(html).toContain("Meta Authority");
    expect(html).toContain("Target ROAS 2.5x");
    expect(html).toContain("Action Ceilings");
    expect(html).toContain("review hold");
    expect(html).toContain("Blocking Reasons");
    expect(html).toContain("target_pack");
  });
});
