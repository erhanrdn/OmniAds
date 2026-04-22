import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `${businessId}-ref`] as const),
    );
  }),
}));

const schemaReadiness = await import("@/lib/db-schema-readiness");
const requestGovernance = await import("@/lib/provider-request-governance");

function collectQueryText(strings: TemplateStringsArray) {
  return strings.join(" ");
}

function latestSqlCallContaining(text: string) {
  return [...sql.mock.calls]
    .reverse()
    .find(([strings]) =>
      collectQueryText(strings as TemplateStringsArray).includes(text),
    );
}

async function runRejectedGovernedRequest(input: {
  message: string;
  status?: number;
  businessId: string;
  requestType: string;
}) {
  const execute = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(
      Object.assign(new Error(input.message), {
        status: input.status,
      }),
    );
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(
    requestGovernance.runProviderRequestWithGovernance({
      provider: "meta",
      businessId: input.businessId,
      requestType: input.requestType,
      requestSource: "live_report",
      requestPath: "/api/meta/provider-governance-test",
      execute,
    }),
  ).rejects.toMatchObject(input.status != null ? { status: input.status } : {});

  await new Promise((resolve) => setTimeout(resolve, 0));

  const auditQuery = latestSqlCallContaining("INSERT INTO provider_request_audit_daily");
  const cooldownQuery = latestSqlCallContaining("INSERT INTO provider_cooldown_state");

  errorSpy.mockRestore();

  return { auditQuery, cooldownQuery };
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
    const cooldownQuery = sql.mock.calls.find(([strings]) =>
      collectQueryText(strings as TemplateStringsArray).includes("INSERT INTO provider_cooldown_state"),
    );
    const quotaQuery = sql.mock.calls.find(([strings]) =>
      collectQueryText(strings as TemplateStringsArray).includes("INSERT INTO provider_quota_usage"),
    );

    expect(auditQuery).toBeTruthy();
    expect(auditQuery?.[1]).toBe("biz_audit");
    expect(collectQueryText(auditQuery?.[0] as TemplateStringsArray)).toContain("business_ref_id");
    expect(auditQuery?.[3]).toBe("ga4");
    expect(auditQuery?.[5]).toBe("live_report");
    expect(auditQuery?.[6]).toBe("/api/analytics/overview");
    expect(auditQuery?.[16]).toBe("provider_request_failed:quota");
    expect(cooldownQuery).toBeTruthy();
    expect(collectQueryText(cooldownQuery?.[0] as TemplateStringsArray)).toContain("business_ref_id");
    expect(quotaQuery).toBeTruthy();
    expect(collectQueryText(quotaQuery?.[0] as TemplateStringsArray)).toContain("business_ref_id");
  });

  it("sanitizes provider audit paths and failure messages", async () => {
    const error = Object.assign(
      new Error("token abc123 for account act_1234567890"),
      { status: 403 },
    );
    const execute = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      requestGovernance.runProviderRequestWithGovernance({
        provider: "meta",
        businessId: "biz_sensitive",
        requestType: "meta_sensitive_read",
        requestSource: "live_report",
        requestPath:
          "/api/meta/accounts/act_1234567890?access_token=secret_token&businessId=biz_sensitive",
        execute,
      }),
    ).rejects.toMatchObject({ status: 403 });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const auditQuery = sql.mock.calls.find(([strings]) =>
      collectQueryText(strings as TemplateStringsArray).includes("INSERT INTO provider_request_audit_daily"),
    );
    const consolePayload = errorSpy.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(auditQuery?.[6]).toBe("/api/meta/accounts/:id");
    expect(auditQuery?.[16]).toBe("provider_request_failed:permission");
    expect(JSON.stringify(consolePayload)).not.toContain("secret_token");
    expect(JSON.stringify(consolePayload)).not.toContain("act_1234567890");
    expect(JSON.stringify(consolePayload)).not.toContain("biz_sensitive");
    errorSpy.mockRestore();
  });

  it.each([
    ["RESOURCE_EXHAUSTED", "RESOURCE_EXHAUSTED: transient pressure"],
    ["QUOTA", "Quota exhausted for this provider"],
    ["RATE LIMIT", "Rate limit exceeded by provider"],
    ["TOO MANY REQUESTS", "Too many requests for this provider"],
  ])(
    "classifies 403 %s provider errors as quota before generic permission handling",
    async (label, message) => {
      const { auditQuery, cooldownQuery } = await runRejectedGovernedRequest({
        message,
        status: 403,
        businessId: `biz_quota_403_${label.replaceAll(" ", "_").toLowerCase()}`,
        requestType: `meta_quota_403_${label.replaceAll(" ", "_").toLowerCase()}`,
      });

      expect(auditQuery).toBeTruthy();
      expect(auditQuery?.[9]).toBe(1);
      expect(auditQuery?.[11]).toBe(0);
      expect(auditQuery?.[16]).toBe("provider_request_failed:quota");
      expect(cooldownQuery).toBeTruthy();
      expect(cooldownQuery?.[7]).toBe("provider_request_failed:quota:status_403");
      expect(cooldownQuery?.[8]).toBe(403);

      const failedAt = new Date(String(cooldownQuery?.[5])).getTime();
      const cooldownUntil = new Date(String(cooldownQuery?.[9])).getTime();
      expect(cooldownUntil - failedAt).toBeGreaterThanOrEqual(4.5 * 60_000);
      expect(cooldownUntil - failedAt).toBeLessThan(6 * 60_000);
    },
  );

  it.each([
    ["QUOTA", "Quota exhausted while refreshing token"],
    ["RATE LIMIT", "Rate limit hit by authenticated user"],
    ["RESOURCE_EXHAUSTED", "RESOURCE_EXHAUSTED while authenticating"],
  ])(
    "keeps explicit 401 %s provider errors classified as auth",
    async (label, message) => {
      const { auditQuery, cooldownQuery } = await runRejectedGovernedRequest({
        message,
        status: 401,
        businessId: `biz_auth_401_${label.replaceAll(" ", "_").toLowerCase()}`,
        requestType: `meta_auth_401_${label.replaceAll(" ", "_").toLowerCase()}`,
      });

      expect(auditQuery).toBeTruthy();
      expect(auditQuery?.[9]).toBe(0);
      expect(auditQuery?.[10]).toBe(1);
      expect(auditQuery?.[11]).toBe(0);
      expect(auditQuery?.[16]).toBe("provider_request_failed:auth");
      expect(cooldownQuery).toBeTruthy();
      expect(cooldownQuery?.[7]).toBe("provider_request_failed:auth:status_401");
      expect(cooldownQuery?.[8]).toBe(401);
    },
  );

  it("keeps true 403 permission errors classified as permission", async () => {
    const { auditQuery, cooldownQuery } = await runRejectedGovernedRequest({
      message: "Permission denied for this account scope",
      status: 403,
      businessId: "biz_true_permission_403",
      requestType: "meta_true_permission_403",
    });

    expect(auditQuery).toBeTruthy();
    expect(auditQuery?.[9]).toBe(0);
    expect(auditQuery?.[11]).toBe(1);
    expect(auditQuery?.[16]).toBe("provider_request_failed:permission");
    expect(cooldownQuery?.[7]).toBe("provider_request_failed:permission:status_403");
  });

  it("keeps 429 provider errors classified as quota", async () => {
    const { auditQuery, cooldownQuery } = await runRejectedGovernedRequest({
      message: "Permission wording should not override 429 quota status",
      status: 429,
      businessId: "biz_true_quota_429",
      requestType: "meta_true_quota_429",
    });

    expect(auditQuery).toBeTruthy();
    expect(auditQuery?.[9]).toBe(1);
    expect(auditQuery?.[10]).toBe(0);
    expect(auditQuery?.[11]).toBe(0);
    expect(auditQuery?.[16]).toBe("provider_request_failed:quota");
    expect(cooldownQuery?.[7]).toBe("provider_request_failed:quota:status_429");
  });

  it("continues to classify non-403 quota and permission messages correctly", async () => {
    const quotaResult = await runRejectedGovernedRequest({
      message: "RESOURCE_EXHAUSTED without explicit HTTP status",
      businessId: "biz_quota_without_status",
      requestType: "meta_quota_without_status",
    });
    expect(quotaResult.auditQuery?.[9]).toBe(1);
    expect(quotaResult.auditQuery?.[16]).toBe("provider_request_failed:quota");

    const permissionResult = await runRejectedGovernedRequest({
      message: "Permission denied without HTTP status",
      businessId: "biz_permission_without_status",
      requestType: "meta_permission_without_status",
    });
    expect(permissionResult.auditQuery?.[11]).toBe(1);
    expect(permissionResult.auditQuery?.[16]).toBe("provider_request_failed:permission");
  });
});
