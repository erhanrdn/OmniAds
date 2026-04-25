import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/date-range/DateRangePicker", () => ({
  DateRangePicker: () => React.createElement("button", { type: "button" }, "Date range"),
}));

vi.mock("@/components/creatives/CreativeDecisionSupportSurface", () => ({
  CreativeDecisionSupportSurface: () =>
    React.createElement("div", { "data-testid": "creative-decision-support-surface-stub" }),
}));

vi.mock("@/components/creatives/CreativeRenderSurface", () => ({
  CreativeRenderSurface: () =>
    React.createElement("div", { "data-testid": "creative-render-surface-stub" }),
}));

const { CreativesTopSection } = await import("@/components/creatives/CreativesTopSection");

describe("CreativesTopSection", () => {
  it("shows that segment filter counts follow the visible reporting set", () => {
    const html = renderToStaticMarkup(
      <CreativesTopSection
        businessId="business-1"
        showHeader={false}
        showGroupByControl={false}
        showAiActionsRow={false}
        dateRange={{
          preset: "last14Days",
          customStart: "2026-04-10",
          customEnd: "2026-04-23",
          lastDays: 14,
          sinceDate: "2026-04-10",
        }}
        onDateRangeChange={vi.fn()}
        groupBy="creative"
        onGroupByChange={vi.fn()}
        filters={[]}
        onFiltersChange={vi.fn()}
        selectedMetricIds={["spend", "roas"]}
        onSelectedMetricIdsChange={vi.fn()}
        selectedRows={[]}
        allRowsForHeatmap={[]}
        defaultCurrency="USD"
        onOpenRow={vi.fn()}
        onShareExport={vi.fn()}
        onCsvExport={vi.fn()}
        quickFilters={[
          {
            key: "scale",
            label: "Scale",
            summary: "Scale candidates require operator review before action.",
            count: 2,
            creativeIds: [],
            tone: "watch",
            actionableCount: 0,
            reviewOnlyCount: 2,
            mutedCount: 0,
          },
        ]}
        activeQuickFilterKey={null}
        onToggleQuickFilter={vi.fn()}
        showDecisionSupportSurface={false}
      />,
    );

    expect(html).toContain("Counts follow the visible reporting set");
    expect(html).toContain("row segments use the Decision OS window");
    expect(html).toContain(
      "Scale: 2 visible rows in the current reporting set, 2 require review before scale action",
    );
    expect(html).toContain("2 review first");
  });
});
