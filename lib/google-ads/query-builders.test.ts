import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_LIMIT = process.env.GOOGLE_ADS_CAMPAIGN_CORE_LIMIT;

afterEach(() => {
  if (ORIGINAL_LIMIT == null) {
    delete process.env.GOOGLE_ADS_CAMPAIGN_CORE_LIMIT;
  } else {
    process.env.GOOGLE_ADS_CAMPAIGN_CORE_LIMIT = ORIGINAL_LIMIT;
  }
  vi.resetModules();
});

describe("buildCampaignCoreBasicQuery", () => {
  it("applies the default campaign hard cap", async () => {
    delete process.env.GOOGLE_ADS_CAMPAIGN_CORE_LIMIT;
    vi.resetModules();
    const { buildCampaignCoreBasicQuery } = await import("@/lib/google-ads/query-builders");

    const query = buildCampaignCoreBasicQuery("2026-04-01", "2026-04-01").query;

    expect(query).toContain("LIMIT 10000");
  });

  it("uses the env override for the campaign hard cap", async () => {
    process.env.GOOGLE_ADS_CAMPAIGN_CORE_LIMIT = "1234";
    vi.resetModules();
    const { buildCampaignCoreBasicQuery } = await import("@/lib/google-ads/query-builders");

    const query = buildCampaignCoreBasicQuery("2026-04-01", "2026-04-01").query;

    expect(query).toContain("LIMIT 1234");
  });
});
