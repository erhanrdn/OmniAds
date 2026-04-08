import { describe, expect, it } from "vitest";
import {
  GOOGLE_ADS_DECISION_WINDOW_POLICY,
  buildGoogleAdsDecisionWindowPolicy,
} from "@/lib/google-ads/decision-window-policy";

describe("Google Ads decision window policy", () => {
  it("matches the approved Decision Engine V2 durations", () => {
    expect(GOOGLE_ADS_DECISION_WINDOW_POLICY).toEqual({
      healthAlarmDays: [1, 3, 7],
      primaryOperationalDays: 28,
      queryGovernanceDays: 56,
      baselineDays: 84,
      maturityCutoffDays: 84,
    });
  });

  it("builds explicit windows from a shared as-of date", () => {
    const policy = buildGoogleAdsDecisionWindowPolicy("2026-04-08");

    expect(policy.healthAlarmWindows).toEqual([
      expect.objectContaining({
        key: "alarm_1d",
        startDate: "2026-04-08",
        endDate: "2026-04-08",
        days: 1,
        role: "health_alarm",
      }),
      expect.objectContaining({
        key: "alarm_3d",
        startDate: "2026-04-06",
        endDate: "2026-04-08",
        days: 3,
        role: "health_alarm",
      }),
      expect.objectContaining({
        key: "alarm_7d",
        startDate: "2026-04-02",
        endDate: "2026-04-08",
        days: 7,
        role: "health_alarm",
      }),
    ]);
    expect(policy.operationalWindow).toMatchObject({
      key: "operational_28d",
      startDate: "2026-03-12",
      endDate: "2026-04-08",
      days: 28,
      role: "operational_decision",
    });
    expect(policy.queryGovernanceWindow).toMatchObject({
      key: "query_governance_56d",
      startDate: "2026-02-12",
      endDate: "2026-04-08",
      days: 56,
      role: "query_governance",
    });
    expect(policy.baselineWindow).toMatchObject({
      key: "baseline_84d",
      startDate: "2026-01-15",
      endDate: "2026-04-08",
      days: 84,
      role: "baseline",
    });
    expect(policy.maturityCutoffDays).toBe(84);
  });
});
