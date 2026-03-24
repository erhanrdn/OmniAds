import { describe, expect, it } from "vitest";
import { findPreviousDifferentBudgetFromHistory } from "@/lib/meta/activity-history";

describe("meta activity history helpers", () => {
  it("finds the previous budget from the latest matching campaign budget update", () => {
    const result = findPreviousDifferentBudgetFromHistory({
      currentDailyBudget: 30000,
      history: [
        {
          campaignId: "cmp_1",
          eventTime: "2026-02-09T11:39:29+0000",
          oldDailyBudget: 25000,
          newDailyBudget: 30000,
        },
        {
          campaignId: "cmp_1",
          eventTime: "2026-02-04T14:09:07+0000",
          oldDailyBudget: 23000,
          newDailyBudget: 25000,
        },
      ],
    });

    expect(result.previousDailyBudget).toBe(25000);
    expect(result.capturedAt).toBe("2026-02-09T11:39:29+0000");
  });
});
