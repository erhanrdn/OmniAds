import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetaAccountRecs } from "@/components/meta/meta-account-recs";

describe("MetaAccountRecs", () => {
  it("shows the analysis error under the action button", () => {
    const html = renderToStaticMarkup(
      <MetaAccountRecs
        recommendationsData={{
          status: "ok",
          summary: {
            title: "Summary",
            summary: "Summary",
            primaryLens: "volume",
            confidence: "medium",
            recommendationCount: 0,
          },
          recommendations: [],
        }}
        isRecsLoading={false}
        lastAnalyzedAt={null}
        checkedRecIds={new Set()}
        onToggleCheck={vi.fn()}
        onAnalyze={vi.fn()}
        analysisError="Internal fetch failed (/api/meta/campaigns 500)"
        language="en"
      />
    );

    expect(html).toContain("Run AI Analysis");
    expect(html).toContain("Internal fetch failed (/api/meta/campaigns 500)");
  });
});
