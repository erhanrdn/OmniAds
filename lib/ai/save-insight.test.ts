import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const { saveInsight, saveInsightFailure } = await import("@/lib/ai/save-insight");

describe("saveInsight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([
      {
        id: "insight-1",
        business_id: "biz-1",
        insight_date: "2026-04-16",
        locale: "en",
        summary: "Summary",
        risks: [],
        opportunities: [],
        recommendations: [],
        raw_response: {},
        status: "success",
        error_message: null,
        created_at: "2026-04-16T00:00:00.000Z",
      },
    ]);
  });

  it("writes canonical business refs for successful insights", async () => {
    await saveInsight({
      businessId: "biz-1",
      insightDate: "2026-04-16",
      locale: "en",
      insight: {
        summary: "Summary",
        risks: [],
        opportunities: [],
        recommendations: [],
      },
      rawResponse: { ok: true },
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });

  it("writes canonical business refs for failed insights", async () => {
    sql.mockResolvedValueOnce([]);

    await saveInsightFailure({
      businessId: "biz-1",
      insightDate: "2026-04-16",
      locale: "en",
      errorMessage: "boom",
      rawResponse: { ok: false },
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });
});
