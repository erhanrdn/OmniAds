import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreativeDecisionSupportSurface } from "@/components/creatives/CreativeDecisionSupportSurface";

describe("CreativeDecisionSupportSurface", () => {
  it("labels quick-filter counts as visible reporting-set counts", () => {
    const html = renderToStaticMarkup(
      <CreativeDecisionSupportSurface
        decisionOs={null}
        allRows={[{ id: "creative-1" } as never]}
        selectedRows={[]}
        quickFilters={[
          {
            key: "watch",
            label: "Watch",
            summary: "Rows to monitor.",
            count: 1,
            creativeIds: ["creative-1"],
            tone: "watch",
          },
        ]}
        activeQuickFilterKey={null}
        onToggleQuickFilter={vi.fn()}
      />,
    );

    expect(html).toContain("Counts follow the current visible reporting set.");
    expect(html).toContain("The row segment itself stays anchored to the Decision OS window.");
    expect(html).toContain("Watch");
  });
});
