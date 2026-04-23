import { describe, expect, it } from "vitest";
import {
  deriveCurrentActiveContext,
  resolveAuditWindow,
  selectDeterministicAuditSample,
} from "./creative-live-firm-audit";

describe("creative live firm audit helpers", () => {
  it("builds a last-30-completed-days audit window", () => {
    expect(resolveAuditWindow("2026-04-24")).toEqual({
      todayReference: "2026-04-24",
      startDate: "2026-03-25",
      endDate: "2026-04-23",
      days: 30,
      excludesToday: true,
    });
  });

  it("treats active campaign and ad set context as active", () => {
    const result = deriveCurrentActiveContext({
      contextRow: {
        campaignId: "cmp-active",
        adSetId: "adset-active",
      },
      campaignStatusById: new Map([["cmp-active", "ACTIVE"]]),
      adSetStatusById: new Map([["adset-active", "ACTIVE"]]),
    });

    expect(result).toEqual({
      isActive: true,
      campaignStatus: "ACTIVE",
      adSetStatus: "ACTIVE",
      source: "campaign_and_adset",
    });
  });

  it("does not treat a paused ad set as active even if the campaign is active", () => {
    const result = deriveCurrentActiveContext({
      contextRow: {
        campaignId: "cmp-active",
        adSetId: "adset-paused",
      },
      campaignStatusById: new Map([["cmp-active", "ACTIVE"]]),
      adSetStatusById: new Map([["adset-paused", "PAUSED"]]),
    });

    expect(result.isActive).toBe(false);
    expect(result.source).toBe("campaign_and_adset");
  });

  it("prioritizes active creatives by spend and then fills with inactive creatives", () => {
    const sample = selectDeterministicAuditSample(
      [
        { creativeId: "creative-03", spend: 180, isActive: false },
        { creativeId: "creative-02", spend: 120, isActive: true },
        { creativeId: "creative-01", spend: 220, isActive: true },
        { creativeId: "creative-04", spend: 260, isActive: false },
      ],
      3,
    );

    expect(sample.map((row) => row.creativeId)).toEqual([
      "creative-01",
      "creative-02",
      "creative-04",
    ]);
  });
});
