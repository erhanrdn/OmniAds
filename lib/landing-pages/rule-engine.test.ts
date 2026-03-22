import { describe, expect, it } from "vitest";
import { buildLandingPageRow } from "@/lib/landing-pages/performance";
import { buildLandingPageRuleReport } from "@/lib/landing-pages/rule-engine";

describe("buildLandingPageRuleReport", () => {
  it("classifies a strong product page as a scale candidate", () => {
    const row = buildLandingPageRow({
      path: "/products/explorer-backpack",
      sessions: 3200,
      engagementRate: 0.72,
      scrollEvents: 1680,
      viewItem: 1650,
      addToCarts: 330,
      checkouts: 170,
      addShippingInfo: 120,
      addPaymentInfo: 98,
      purchases: 76,
      totalRevenue: 12800,
    });

    const report = buildLandingPageRuleReport(row);

    expect(report.archetype).toBe("product");
    expect(report.action).toBe("scale");
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.confidence).toBeGreaterThan(0.5);
  });

  it("flags weak discovery on a content page", () => {
    const row = buildLandingPageRow({
      path: "/blogs/gift-guide",
      sessions: 2600,
      engagementRate: 0.67,
      scrollEvents: 1240,
      viewItem: 140,
      addToCarts: 9,
      checkouts: 2,
      addShippingInfo: 0,
      addPaymentInfo: 0,
      purchases: 0,
      totalRevenue: 0,
    });

    const report = buildLandingPageRuleReport(row);

    expect(report.archetype).toBe("content");
    expect(report.action).toBe("fix_product_discovery");
    expect(report.causeTags).toContain("poor_product_discovery");
  });

  it("routes tracking mismatches into a tracking audit verdict", () => {
    const row = buildLandingPageRow({
      path: "/collections/ramadan-decor",
      sessions: 1400,
      engagementRate: 0.7,
      scrollEvents: 420,
      viewItem: 360,
      addToCarts: 80,
      checkouts: 20,
      addShippingInfo: 0,
      addPaymentInfo: 0,
      purchases: 0,
      totalRevenue: 4000,
    });

    const report = buildLandingPageRuleReport(row);

    expect(report.action).toBe("tracking_audit");
    expect(report.causeTags).toContain("tracking_gap");
  });

  it("treats downstream leakage on listing pages as a handoff issue instead of blaming the listing", () => {
    const row = buildLandingPageRow({
      path: "/collections/ramadan-decor",
      sessions: 5200,
      engagementRate: 0.74,
      scrollEvents: 1700,
      viewItem: 2600,
      addToCarts: 120,
      checkouts: 18,
      addShippingInfo: 10,
      addPaymentInfo: 8,
      purchases: 6,
      totalRevenue: 1200,
    });

    const report = buildLandingPageRuleReport(row);

    expect(report.archetype).toBe("listing");
    expect(report.action).toBe("watch");
    expect(report.primaryLeak).toBeNull();
    expect(report.summary.toLowerCase()).toContain("after users leave this page");
  });
});
