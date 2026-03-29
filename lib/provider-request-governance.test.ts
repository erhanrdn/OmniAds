import { describe, expect, it } from "vitest";
import { buildProviderQuotaBudgetState } from "@/lib/provider-request-governance";

describe("buildProviderQuotaBudgetState", () => {
  it("computes pressure and lane allowances from daily call volume", () => {
    const state = buildProviderQuotaBudgetState({
      provider: "google",
      businessId: "biz-1",
      quotaDate: "2026-03-29",
      callCount: 2500,
      errorCount: 10,
    });

    expect(state.callCount).toBe(2500);
    expect(state.dailyBudget).toBeGreaterThan(0);
    expect(state.pressure).toBeGreaterThan(0);
    expect(state.withinDailyBudget).toBe(true);
  });

  it("marks extended and maintenance as blocked after the daily budget is exhausted", () => {
    const state = buildProviderQuotaBudgetState({
      provider: "google",
      businessId: "biz-2",
      quotaDate: "2026-03-29",
      callCount: 6000,
      errorCount: 500,
    });

    expect(state.withinDailyBudget).toBe(false);
    expect(state.maintenanceAllowed).toBe(false);
    expect(state.extendedAllowed).toBe(false);
  });
});
