import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockQuery: Record<string, unknown> = {
  isLoading: false,
  isError: false,
  data: {
    currentMode: "Margin Protect",
    recommendedMode: "Margin Protect",
    confidence: 0.74,
    why: ["Selected-range performance is below break-even."],
    guardrails: ["Restrict scaling until margin pressure clears."],
    changeTriggers: [],
    activeCommercialInputs: [
      { label: "Break-even ROAS", detail: "1.60x" },
      { label: "Target ROAS", detail: "2.30x" },
    ],
    platformInputs: [],
    missingInputs: ["Meta location breakdown is unavailable for the selected range."],
  },
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => mockQuery),
}));

const { CreativeCommercialContextCard } = await import(
  "@/components/creatives/creative-commercial-context-card"
);

describe("CreativeCommercialContextCard", () => {
  it("renders commercial context without touching AI commentary labels", () => {
    const html = renderToStaticMarkup(
      <CreativeCommercialContextCard
        businessId="biz"
        startDate="2026-04-01"
        endDate="2026-04-10"
      />,
    );

    expect(html).toContain("Commercial Context");
    expect(html).toContain("Margin Protect");
    expect(html).toContain("Guardrail");
    expect(html).toContain("Missing inputs:");
  });

  it("shows a quiet fallback when the context route fails", () => {
    mockQuery = {
      isLoading: false,
      isError: true,
      data: null,
    };

    const html = renderToStaticMarkup(
      <CreativeCommercialContextCard
        businessId="biz"
        startDate="2026-04-01"
        endDate="2026-04-10"
      />,
    );

    expect(html).toContain("Commercial context is unavailable for this range.");
  });
});
