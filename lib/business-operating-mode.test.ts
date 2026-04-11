import { describe, expect, it } from "vitest";
import { buildAccountOperatingMode } from "@/lib/business-operating-mode";
import {
  createEmptyCountryEconomicsRow,
  createEmptyBusinessCommercialTruthSnapshot,
  createEmptyOperatingConstraints,
  createEmptyPromoCalendarEvent,
  createEmptyTargetPack,
} from "@/src/types/business-commercial";

function buildBaseSnapshot() {
  const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");
  snapshot.targetPack = {
    ...createEmptyTargetPack(),
    targetRoas: 2.4,
    breakEvenRoas: 1.5,
    targetCpa: 45,
    breakEvenCpa: 62,
  };
  snapshot.operatingConstraints = createEmptyOperatingConstraints();
  snapshot.countryEconomics = [
    createEmptyCountryEconomicsRow({ countryCode: "GB" }),
  ];
  return snapshot;
}

function buildCampaigns(overrides?: Partial<{ spend: number; revenue: number; purchases: number }>) {
  return {
    rows: [
      {
        id: "cmp_1",
        name: "Scale Winner",
        spend: overrides?.spend ?? 1200,
        revenue: overrides?.revenue ?? 4200,
        purchases: overrides?.purchases ?? 42,
      },
    ],
  } as never;
}

function buildBreakdowns() {
  return {
    location: [
      {
        key: "US",
        label: "US",
        spend: 700,
        revenue: 2800,
      },
      {
        key: "CA",
        label: "CA",
        spend: 300,
        revenue: 900,
      },
    ],
  } as never;
}

describe("business operating mode", () => {
  it("prioritizes Recovery for critical blockers", () => {
    const snapshot = buildBaseSnapshot();
    snapshot.operatingConstraints = {
      ...createEmptyOperatingConstraints(),
      checkoutIssueStatus: "critical",
    };

    const result = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns(),
      breakdowns: buildBreakdowns(),
    });

    expect(result.recommendedMode).toBe("Recovery");
    expect(result.guardrails[0]).toContain("Do not scale budgets");
  });

  it("moves into Peak / Promo when an active promo overlaps the selected range", () => {
    const snapshot = buildBaseSnapshot();
    snapshot.promoCalendar = [
      {
        ...createEmptyPromoCalendarEvent(),
        title: "Spring Push",
        severity: "high",
        startDate: "2026-04-01",
        endDate: "2026-04-15",
      },
    ];

    const result = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-04-05",
      endDate: "2026-04-10",
      decisionAsOf: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns(),
      breakdowns: buildBreakdowns(),
    });

    expect(result.recommendedMode).toBe("Peak / Promo");
    expect(result.why[0]).toContain("Spring Push");
  });

  it("falls into Margin Protect when performance is below break-even", () => {
    const snapshot = buildBaseSnapshot();
    const result = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns({ spend: 1400, revenue: 1200, purchases: 18 }),
      breakdowns: buildBreakdowns(),
    });

    expect(result.recommendedMode).toBe("Margin Protect");
    expect(result.why.join(" ")).toContain("break-even");
  });

  it("returns Exploit when targets are beaten with enough signal and no blockers", () => {
    const snapshot = buildBaseSnapshot();
    const result = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns({ spend: 1600, revenue: 5200, purchases: 48 }),
      breakdowns: buildBreakdowns(),
    });

    expect(result.recommendedMode).toBe("Exploit");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("soft-fails into Explore when commercial truth and signal volume are incomplete", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");
    const result = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns({ spend: 80, revenue: 210, purchases: 1 }),
      breakdowns: null,
    });

    expect(result.recommendedMode).toBe("Explore");
    expect(result.missingInputs.length).toBeGreaterThan(0);
    expect(result.degradedMode.active).toBe(true);
    expect(result.degradedMode.safeActionLabels).toContain("review_hold");
  });

  it("keeps operating mode stable when the analytics window changes", () => {
    const snapshot = buildBaseSnapshot();
    const base = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      decisionAsOf: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns({ spend: 1600, revenue: 5200, purchases: 48 }),
      breakdowns: buildBreakdowns(),
    });
    const shifted = buildAccountOperatingMode({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      decisionAsOf: "2026-04-10",
      snapshot,
      campaigns: buildCampaigns({ spend: 1600, revenue: 5200, purchases: 48 }),
      breakdowns: buildBreakdowns(),
    });

    expect(base.recommendedMode).toBe("Exploit");
    expect(shifted.recommendedMode).toBe("Exploit");
    expect(base.currentMode).toBe(shifted.currentMode);
    expect(base.decisionAsOf).toBe("2026-04-10");
    expect(base.analyticsWindow.startDate).toBe("2026-04-01");
    expect(shifted.analyticsWindow.startDate).toBe("2026-03-01");
    expect(base.decisionWindows.primary30d).toEqual(shifted.decisionWindows.primary30d);
  });
});
