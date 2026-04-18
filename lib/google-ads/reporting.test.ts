import { describe, expect, it } from "vitest";
import { classifySearchAction } from "@/lib/google-ads/reporting";
import { buildQueryOwnershipContextFromTerms } from "@/lib/google-ads/query-ownership";

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
          searchTerm: "refund policy",
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

  it("suppresses sku-specific negative recommendations", () => {
    expect(
      classifySearchAction(
        {
          searchTerm: "chair5000",
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

  it("suppresses product-specific negative recommendations when product context is known", () => {
    expect(
      classifySearchAction(
        {
          searchTerm: "urbantrail carry on backpack",
          campaign: "Generic Search",
          isKeyword: false,
          conversions: 0,
          spend: 60,
          clicks: 24,
          roas: 0,
          conversionRate: 0,
        },
        ["grandmix"],
        ["UrbanTrail Carry-On Backpack"]
      )
    ).not.toBe("Add as negative keyword");
  });

  it("suppresses ambiguous commercial terms from V1 negative recommendations", () => {
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
    ).not.toBe("Add as negative keyword");
  });

  it("accepts a prebuilt ownership context without changing the decision", () => {
    const input = {
      searchTerm: "urbantrail carry on backpack",
      campaign: "Generic Search",
      isKeyword: false,
      conversions: 0,
      spend: 60,
      clicks: 24,
      roas: 0,
      conversionRate: 0,
    } as const;
    const brandTerms = ["grandmix"];
    const productTerms = ["UrbanTrail Carry-On Backpack"];
    const ownershipContext = buildQueryOwnershipContextFromTerms({
      brandTerms,
      productTerms,
    });

    expect(
      classifySearchAction(
        input,
        brandTerms,
        productTerms,
        ownershipContext,
      ),
    ).toBe(classifySearchAction(input, brandTerms, productTerms));
  });
});
