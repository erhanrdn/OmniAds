import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/provider-platform-date", () => ({
  addDaysToIsoDateUtc: (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  },
  getProviderPlatformPreviousDate: vi.fn(),
}));

const providerPlatformDate = await import("@/lib/provider-platform-date");
const metadata = await import("@/lib/operator-decision-metadata");

describe("operator decision metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stable rolling decision windows from a decision anchor", () => {
    const result = metadata.buildOperatorDecisionMetadata({
      analyticsStartDate: "2026-03-01",
      analyticsEndDate: "2026-03-31",
      decisionAsOf: "2026-04-10",
    });

    expect(result.analyticsWindow).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      role: "analysis_only",
    });
    expect(result.decisionWindows.recent7d.startDate).toBe("2026-04-04");
    expect(result.decisionWindows.recent7d.endDate).toBe("2026-04-10");
    expect(result.decisionWindows.primary30d.startDate).toBe("2026-03-12");
    expect(result.decisionWindows.baseline90d.startDate).toBe("2026-01-11");
    expect(result.historicalMemory.note).toContain("selected period");
  });

  it("uses the provider previous date when decisionAsOf is not supplied", async () => {
    vi.mocked(providerPlatformDate.getProviderPlatformPreviousDate).mockResolvedValue(
      "2026-04-10",
    );

    const result = await metadata.getMetaOperatorDecisionMetadata({
      businessId: "biz",
      analyticsStartDate: "2026-02-01",
      analyticsEndDate: "2026-02-28",
    });

    expect(result.decisionAsOf).toBe("2026-04-10");
    expect(providerPlatformDate.getProviderPlatformPreviousDate).toHaveBeenCalledWith({
      provider: "meta",
      businessId: "biz",
    });
  });

  it("uses the provider previous date when decisionAsOf is blank", async () => {
    vi.mocked(providerPlatformDate.getProviderPlatformPreviousDate).mockResolvedValue(
      "2026-04-10",
    );

    const result = await metadata.getMetaOperatorDecisionMetadata({
      businessId: "biz",
      analyticsStartDate: "2026-02-01",
      analyticsEndDate: "2026-02-28",
      decisionAsOf: "   ",
    });

    expect(result.decisionAsOf).toBe("2026-04-10");
    expect(providerPlatformDate.getProviderPlatformPreviousDate).toHaveBeenCalledWith({
      provider: "meta",
      businessId: "biz",
    });
  });

  it("uses an explicit nonblank decisionAsOf without provider fallback", async () => {
    const result = await metadata.getMetaOperatorDecisionMetadata({
      businessId: "biz",
      analyticsStartDate: "2026-02-01",
      analyticsEndDate: "2026-02-28",
      decisionAsOf: " 2026-04-09 ",
    });

    expect(result.decisionAsOf).toBe("2026-04-09");
    expect(providerPlatformDate.getProviderPlatformPreviousDate).not.toHaveBeenCalled();
  });
});
