import { describe, expect, it } from "vitest";
import { buildGoogleAdsSelectedRangeContext } from "@/lib/google-ads/serving";

describe("buildGoogleAdsSelectedRangeContext", () => {
  it("hides context when the selected range is outside the decision snapshot context window", () => {
    expect(
      buildGoogleAdsSelectedRangeContext({
        canonicalAsOfDate: "2026-03-31",
        canonicalTotals: { spend: 100, revenue: 300, conversions: 10, roas: 3 },
        selectedRangeStart: "2025-11-01",
        selectedRangeEnd: "2025-11-14",
        selectedTotals: { spend: 40, revenue: 120, conversions: 4, roas: 3 },
      }).state
    ).toBe("hidden");
  });

  it("returns aligned for small ROAS deltas", () => {
    expect(
      buildGoogleAdsSelectedRangeContext({
        canonicalAsOfDate: "2026-03-31",
        canonicalTotals: { spend: 100, revenue: 300, conversions: 10, roas: 3 },
        selectedRangeStart: "2026-03-18",
        selectedRangeEnd: "2026-03-31",
        selectedTotals: { spend: 30, revenue: 96, conversions: 7, roas: 3.2 },
      }).state
    ).toBe("aligned");
  });

  it("returns stronger or softer when the delta is meaningful", () => {
    expect(
      buildGoogleAdsSelectedRangeContext({
        canonicalAsOfDate: "2026-03-31",
        canonicalTotals: { spend: 100, revenue: 300, conversions: 10, roas: 3 },
        selectedRangeStart: "2026-03-18",
        selectedRangeEnd: "2026-03-31",
        selectedTotals: { spend: 30, revenue: 120, conversions: 8, roas: 4 },
      }).state
    ).toBe("stronger");

    expect(
      buildGoogleAdsSelectedRangeContext({
        canonicalAsOfDate: "2026-03-31",
        canonicalTotals: { spend: 100, revenue: 300, conversions: 10, roas: 3 },
        selectedRangeStart: "2026-03-18",
        selectedRangeEnd: "2026-03-31",
        selectedTotals: { spend: 30, revenue: 60, conversions: 8, roas: 2 },
      }).state
    ).toBe("softer");
  });

  it("falls back to volatile when divergence is large but conversion depth is thin", () => {
    expect(
      buildGoogleAdsSelectedRangeContext({
        canonicalAsOfDate: "2026-03-31",
        canonicalTotals: { spend: 100, revenue: 300, conversions: 10, roas: 3 },
        selectedRangeStart: "2026-03-18",
        selectedRangeEnd: "2026-03-31",
        selectedTotals: { spend: 30, revenue: 120, conversions: 2, roas: 4 },
      }).state
    ).toBe("volatile");
  });

  it("keeps the selected range framed as contextual", () => {
    expect(
      buildGoogleAdsSelectedRangeContext({
        canonicalAsOfDate: "2026-03-31",
        canonicalTotals: { spend: 100, revenue: 300, conversions: 10, roas: 3 },
        selectedRangeStart: "2026-03-18",
        selectedRangeEnd: "2026-03-31",
        selectedTotals: { spend: 30, revenue: 96, conversions: 7, roas: 3.2 },
      }).summary
    ).toContain("multi-window decision snapshot");
  });
});
