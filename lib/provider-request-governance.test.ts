import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

const schemaReadiness = await import("@/lib/db-schema-readiness");
const requestGovernance = await import("@/lib/provider-request-governance");

function collectQueryText(strings: TemplateStringsArray) {
  return strings.join(" ");
}

describe("provider request governance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-14T00:00:00.000Z",
    } as never);
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = collectQueryText(strings);
      if (query.includes("SELECT error_message, http_status, failure_count, failed_at, cooldown_until")) {
        return [];
      }
      if (query.includes("SELECT quota_date, call_count, error_count")) {
        return [];
      }
      return [];
    });
  });

  it("computes pressure and lane allowances from daily call volume", () => {
    const state = requestGovernance.buildProviderQuotaBudgetState({
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
    const state = requestGovernance.buildProviderQuotaBudgetState({
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

  it("suppresses repeated failing live calls inside cooldown and logs audit source attribution", async () => {
    const execute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        Object.assign(new Error("quota exhausted"), {
          status: 429,
        }),
      );

    await expect(
      requestGovernance.runProviderRequestWithGovernance({
        provider: "ga4",
        businessId: "biz_audit",
        requestType: "ga4_analytics_overview:summary",
        requestSource: "live_report",
        requestPath: "/api/analytics/overview",
        execute,
      }),
    ).rejects.toMatchObject({ status: 429 });

    await expect(
      requestGovernance.runProviderRequestWithGovernance({
        provider: "ga4",
        businessId: "biz_audit",
        requestType: "ga4_analytics_overview:summary",
        requestSource: "live_report",
        requestPath: "/api/analytics/overview",
        execute,
      }),
    ).rejects.toBeInstanceOf(requestGovernance.ProviderRequestCooldownError);

    expect(execute).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const auditQuery = sql.mock.calls.find(([strings]) =>
      collectQueryText(strings as TemplateStringsArray).includes("INSERT INTO provider_request_audit_daily"),
    );

    expect(auditQuery).toBeTruthy();
    expect(auditQuery?.[1]).toBe("biz_audit");
    expect(auditQuery?.[2]).toBe("ga4");
    expect(auditQuery?.[4]).toBe("live_report");
    expect(auditQuery?.[5]).toBe("/api/analytics/overview");
  });
});
