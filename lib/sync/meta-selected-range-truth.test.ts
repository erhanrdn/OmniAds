import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/warehouse")>();
  return {
    ...actual,
    getMetaPublishedVerificationSummary: vi.fn(),
  };
});

const assignments = await import("@/lib/provider-account-assignments");
const warehouse = await import("@/lib/meta/warehouse");
const metaSync = await import("@/lib/sync/meta-sync");

describe("getMetaSelectedRangeTruthReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_AUTHORITATIVE_FINALIZATION_V2 = "1";
    process.env.META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES = "";
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_1"],
    } as never);
  });

  it("stays processing when published verification is unavailable instead of inferring truth from coverage", async () => {
    vi.mocked(warehouse.getMetaPublishedVerificationSummary).mockResolvedValue(
      null as never,
    );

    const result = await metaSync.getMetaSelectedRangeTruthReadiness({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-02",
    });

    expect(result).toEqual({
      truthReady: false,
      state: "processing",
      verificationState: "processing",
      totalDays: 2,
      completedCoreDays: 0,
      blockingReasons: [],
      reasonCounts: {},
      detectorReasonCodes: [],
      sourceFetchedAt: null,
      publishedAt: null,
      asOf: null,
    });
  });

  it("returns published verification truth when publication proof exists", async () => {
    vi.mocked(warehouse.getMetaPublishedVerificationSummary).mockResolvedValue({
      verificationState: "finalized_verified",
      truthReady: true,
      totalDays: 2,
      completedCoreDays: 2,
      sourceFetchedAt: "2026-04-03T00:00:00.000Z",
      publishedAt: "2026-04-03T00:05:00.000Z",
      asOf: "2026-04-03T00:05:00.000Z",
      publishedSlices: 4,
      totalExpectedSlices: 4,
      reasonCounts: {},
      publishedKeysBySurface: {
        account_daily: ["act_1:2026-04-01", "act_1:2026-04-02"],
        campaign_daily: ["act_1:2026-04-01", "act_1:2026-04-02"],
        adset_daily: ["act_1:2026-04-01", "act_1:2026-04-02"],
        ad_daily: ["act_1:2026-04-01", "act_1:2026-04-02"],
        breakdown_daily: ["act_1:2026-04-01", "act_1:2026-04-02"],
      },
    } as never);

    const result = await metaSync.getMetaSelectedRangeTruthReadiness({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-02",
    });

    expect(result).toMatchObject({
      truthReady: true,
      state: "finalized_verified",
      verificationState: "finalized_verified",
      totalDays: 2,
      completedCoreDays: 2,
      sourceFetchedAt: "2026-04-03T00:00:00.000Z",
      publishedAt: "2026-04-03T00:05:00.000Z",
      asOf: "2026-04-03T00:05:00.000Z",
    });
  });
});
