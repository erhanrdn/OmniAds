import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";

const metadata = buildOperatorDecisionMetadata({
  analyticsStartDate: "2026-04-01",
  analyticsEndDate: "2026-04-10",
  decisionAsOf: "2026-04-10",
});

let mockQuery: Record<string, unknown> = {
  isLoading: false,
  isError: false,
  data: {
    startDate: "2026-04-01",
    endDate: "2026-04-10",
    analyticsWindow: metadata.analyticsWindow,
    decisionWindows: metadata.decisionWindows,
    historicalMemory: metadata.historicalMemory,
    decisionAsOf: metadata.decisionAsOf,
    currentMode: "Exploit",
    recommendedMode: "Exploit",
    confidence: 0.82,
    why: ["Live decision-window performance is beating targets."],
    guardrails: ["Scale in controlled steps."],
    changeTriggers: ["Performance slips toward target."],
    activeCommercialInputs: [{ label: "Target ROAS", detail: "2.40x" }],
    platformInputs: [{ label: "Primary window ROAS", detail: "3.10x" }],
    missingInputs: [],
    degradedMode: {
      active: false,
      confidenceCap: null,
      reasons: [],
      safeActionLabels: [],
    },
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
    expect(html).toContain("Decisions use live windows");
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
