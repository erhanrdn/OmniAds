import { describe, expect, it } from "vitest";
import { classifySearchAction } from "@/lib/google-ads/reporting";

describe("classifySearchAction", () => {
  it("does not recommend adding a branded term as a negative keyword when brand ownership is known", () => {
    expect(
      classifySearchAction(
        {
          searchTerm: "grandmix chairs",
          campaign: "Generic Search",
          isKeyword: false,
          conversions: 0,
          spend: 60,
          clicks: 24,
          roas: 0,
          conversionRate: 0,
        },
        ["grandmix"]
      )
    ).not.toBe("Add as negative keyword");
  });

  it("still recommends negatives for genuine non-brand waste", () => {
    expect(
      classifySearchAction(
        {
          searchTerm: "cheap camping backpack",
          campaign: "Generic Search",
          isKeyword: false,
          conversions: 0,
          spend: 60,
          clicks: 24,
          roas: 0,
          conversionRate: 0,
        },
        ["grandmix"]
      )
    ).toBe("Add as negative keyword");
  });
});
