import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn().mockResolvedValue(undefined),
  getDbSchemaReadiness: vi.fn().mockResolvedValue({
    ready: true,
    missingTables: [],
    checkedAt: "2026-04-17T00:00:00.000Z",
  }),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const {
  saveSeoMonthlyAiAnalysisFailure,
  saveSeoMonthlyAiAnalysisSuccess,
} = await import("@/lib/seo/monthly-ai-analysis-store");

describe("seo monthly ai analysis store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([
      {
        id: "analysis-1",
        business_id: "biz-1",
        analysis_month: "2026-04-01",
        period_start: "2026-04-01",
        period_end: "2026-04-30",
        analysis: null,
        raw_response: null,
        status: "success",
        error_message: null,
        created_at: "2026-04-17T00:00:00.000Z",
        updated_at: "2026-04-17T00:00:00.000Z",
      },
    ]);
  });

  it("writes canonical business refs on success", async () => {
    await saveSeoMonthlyAiAnalysisSuccess({
      businessId: "biz-1",
      analysisMonth: "2026-04-01",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      analysis: {} as never,
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });

  it("writes canonical business refs on failure", async () => {
    await saveSeoMonthlyAiAnalysisFailure({
      businessId: "biz-1",
      analysisMonth: "2026-04-01",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      errorMessage: "boom",
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });
});
