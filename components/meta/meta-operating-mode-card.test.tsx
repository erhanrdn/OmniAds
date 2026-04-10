import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockQuery: Record<string, unknown> = {
  isLoading: false,
  isError: false,
  data: {
    currentMode: "Exploit",
    recommendedMode: "Exploit",
    confidence: 0.82,
    why: ["Selected-range performance is beating targets."],
    guardrails: ["Scale in controlled steps."],
    changeTriggers: ["Performance slips toward target."],
    activeCommercialInputs: [{ label: "Target ROAS", detail: "2.40x" }],
    platformInputs: [{ label: "Selected-range ROAS", detail: "3.10x" }],
    missingInputs: [],
  },
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => mockQuery),
}));

const { MetaOperatingModeCard } = await import("@/components/meta/meta-operating-mode-card");

describe("MetaOperatingModeCard", () => {
  it("renders the deterministic operating-mode summary", () => {
    const html = renderToStaticMarkup(
      <MetaOperatingModeCard
        businessId="biz"
        startDate="2026-04-01"
        endDate="2026-04-10"
      />,
    );

    expect(html).toContain("Operating Mode");
    expect(html).toContain("Exploit");
    expect(html).toContain("Commercial Drivers");
    expect(html).toContain("What changes this mode");
  });

  it("keeps a non-throwing fallback when data is unavailable", () => {
    mockQuery = {
      isLoading: false,
      isError: true,
      data: null,
    };

    const html = renderToStaticMarkup(
      <MetaOperatingModeCard
        businessId="biz"
        startDate="2026-04-01"
        endDate="2026-04-10"
      />,
    );

    expect(html).toContain("Operating mode is currently unavailable.");
  });
});
