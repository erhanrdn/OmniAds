import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

const schemaReadiness = await import("@/lib/db-schema-readiness");
const { buildGoogleErrorBudgetAudit } = await import("@/lib/google-error-budget-audit");

function collectQueryText(strings: TemplateStringsArray) {
  return strings.join(" ");
}

describe("google error budget audit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-14T00:00:00.000Z",
    } as never);
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = collectQueryText(strings);
      if (query.includes("FROM provider_request_audit_daily")) {
        return [
          {
            provider: "ga4",
            request_type: "ga4_analytics_overview:abc",
            audit_source: "live_report",
            audit_path: "/api/analytics/overview",
            request_count: 4,
            error_count: 3,
            quota_error_count: 2,
            auth_error_count: 1,
            permission_error_count: 0,
            generic_error_count: 0,
            cooldown_hit_count: 7,
            deduped_count: 0,
            last_error_at: "2026-04-14T09:00:00.000Z",
            last_error_message: "quota exhausted",
          },
          {
            provider: "google",
            request_type: "abcd1234",
            audit_source: "cron_sync",
            audit_path: "google_ads_warehouse_sync",
            request_count: 10,
            error_count: 1,
            quota_error_count: 0,
            auth_error_count: 0,
            permission_error_count: 1,
            generic_error_count: 0,
            cooldown_hit_count: 2,
            deduped_count: 1,
            last_error_at: "2026-04-14T08:00:00.000Z",
            last_error_message: "permission denied",
          },
        ];
      }
      if (query.includes("FROM provider_cooldown_state")) {
        return [
          {
            provider: "ga4",
            request_type: "ga4_analytics_overview:abc",
            cooldown_until: "2026-04-14T10:00:00.000Z",
          },
        ];
      }
      return [];
    });
  });

  it("aggregates provider, source, and cooldown evidence for operators", async () => {
    const audit = await buildGoogleErrorBudgetAudit();

    expect(audit.summary.requestCount).toBe(14);
    expect(audit.summary.errorCount).toBe(4);
    expect(audit.summary.cooldownHitCount).toBe(9);
    expect(audit.summary.topErrorProvider).toBe("ga4");

    expect(audit.providers[0]).toEqual(
      expect.objectContaining({
        provider: "ga4",
        activeCooldowns: 1,
        errorClassBreakdown: {
          quota: 2,
          auth: 1,
          permission: 0,
          generic: 0,
        },
      }),
    );
    expect(audit.providers[0].sourceBreakdown).toEqual([
      {
        source: "live_report",
        requestCount: 4,
        errorCount: 3,
        cooldownHitCount: 7,
        dedupedCount: 0,
      },
    ]);
    expect(audit.providers[0].repeatedFailurePatterns[0]).toEqual(
      expect.objectContaining({
        source: "live_report",
        path: "/api/analytics/overview",
        dominantFailureClass: "mixed",
        activeCooldown: true,
      }),
    );
  });
});
