import { describe, expect, it } from "vitest";
import {
  classifySpendTier,
  deriveCampaignIsTestLike,
  hmacLabel,
  rowId,
} from "./happy-harbor-faz-a";

describe("happy harbor phase A helpers", () => {
  it("builds stable row ids from sanitized aliases", () => {
    expect(
      rowId({
        companyAlias: "company-01",
        accountAlias: "account-01",
        campaignAlias: "campaign-01",
        adSetAlias: "adset-01",
        creativeAlias: "creative-01",
      }),
    ).toBe("company-01|account-01|campaign-01|adset-01|creative-01");
  });

  it("classifies spend tiers on the agreed 30-day boundaries", () => {
    expect(classifySpendTier(999.99)).toBe("small");
    expect(classifySpendTier(1_000)).toBe("medium");
    expect(classifySpendTier(10_000)).toBe("medium");
    expect(classifySpendTier(10_000.01)).toBe("large");
  });

  it("uses keyed HMAC masks that do not expose plain labels", () => {
    const mask = hmacLabel("secret-a", "row-1", "lifecycleState", "stable_winner");

    expect(mask).toMatch(/^[a-f0-9]{64}$/);
    expect(mask).not.toContain("stable_winner");
    expect(mask).not.toBe(hmacLabel("secret-b", "row-1", "lifecycleState", "stable_winner"));
  });

  it("detects test-like campaign context from raw private names before masking", () => {
    expect(
      deriveCampaignIsTestLike({
        campaignName: "April Creative Test",
        adSetName: null,
        campaignAlias: "campaign-01",
        adSetAlias: "adset-01",
      }),
    ).toBe(true);
    expect(
      deriveCampaignIsTestLike({
        campaignName: "Brand Evergreen",
        adSetName: "Retention",
        campaignAlias: "campaign-02",
        adSetAlias: "adset-02",
      }),
    ).toBe(false);
  });
});
