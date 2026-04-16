import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/creatives/CreativeDecisionOsOverview", () => ({
  CreativeDecisionOsOverview: () =>
    React.createElement("div", { "data-testid": "creative-decision-os-overview-stub" }, "creative-overview-stub"),
}));

vi.mock("@/components/creatives/CreativeDecisionSupportSurface", () => ({
  CreativeDecisionSupportSurface: () =>
    React.createElement("div", { "data-testid": "creative-decision-support-surface-stub" }, "creative-support-surface-stub"),
}));

const { CreativeDecisionOsDrawer } = await import(
  "@/components/creatives/CreativeDecisionOsDrawer"
);

describe("CreativeDecisionOsDrawer", () => {
  it("keeps the drawer framed as support while the page worklist stays primary", () => {
    const html = renderToStaticMarkup(
      <CreativeDecisionOsDrawer
        decisionOs={
          {
            decisionAsOf: "2026-04-10",
            decisionWindows: {
              primary30d: {
                startDate: "2026-03-11",
                endDate: "2026-04-10",
              },
            },
            summary: {
              message:
                "Decision OS highlights which creatives to scale, test, refresh, hold, retest, or keep evergreen.",
              operatingMode: "Exploit",
            },
          } as any
        }
        isLoading={false}
        open
        onOpenChange={vi.fn()}
        quickFilters={[]}
        allRows={[]}
        selectedRows={[]}
        activeFamilyId={null}
        activeQuickFilterKey={null}
        onSelectFamily={vi.fn()}
        onSelectQuickFilter={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    expect(html).toContain("Creative Decision Support");
    expect(html).toContain(
      "Decision OS highlights which creatives to scale, test, refresh, hold, retest, or keep evergreen.",
    );
    expect(html).toContain(
      "The page worklist stays primary. This drawer is support for live-window decision context only.",
    );
    expect(html).toContain("Decision as of 2026-04-10");
    expect(html).toContain("Operating Mode");
    expect(html).toContain("Exploit");
    expect(html).toContain("Reset width");
    expect(html).toContain("Close Creative Decision OS");
    expect(html).toContain("creative-support-surface-stub");
    expect(html).toContain("creative-overview-stub");
  });
});
