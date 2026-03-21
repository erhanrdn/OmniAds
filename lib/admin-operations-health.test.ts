import { describe, expect, it } from "vitest";
import {
  buildAdminAuthHealth,
  buildAdminRevenueRisk,
  buildAdminSyncHealth,
} from "@/lib/admin-operations-health";

describe("buildAdminAuthHealth", () => {
  it("classifies only confirmed auth failures as issues", () => {
    const payload = buildAdminAuthHealth([
      {
        business_id: "biz-1",
        business_name: "Acme",
        provider: "google",
        status: "connected",
        refresh_token: null,
        token_expires_at: "2026-03-20T10:00:00.000Z",
        scopes: "openid profile",
        error_message: null,
        updated_at: "2026-03-21T10:00:00.000Z",
      },
    ]);

    expect(payload.summary.affectedBusinesses).toBe(1);
    expect(payload.summary.expiredTokens).toBe(1);
    expect(payload.summary.missingRefreshTokens).toBe(1);
    expect(payload.summary.missingScopes).toBe(1);
    expect(payload.summary.topIssue).toBeTruthy();
    expect(payload.summary.expiringSoon).toBe(0);
    expect(payload.issues).toHaveLength(2);
  });
});

describe("buildAdminSyncHealth", () => {
  it("tracks failed jobs, stuck jobs, and active cooldowns", () => {
    const payload = buildAdminSyncHealth({
      jobs: [
        {
          business_id: "biz-1",
          business_name: "Acme",
          provider: "google_ads",
          report_type: "overview",
          status: "failed",
          error_message: "quota",
          triggered_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
        {
          business_id: "biz-2",
          business_name: "Beta",
          provider: "ga4",
          report_type: "ga4_overview",
          status: "running",
          error_message: null,
          triggered_at: "2026-03-21T10:00:00.000Z",
          started_at: "2026-03-21T10:00:00.000Z",
          completed_at: null,
        },
      ],
      cooldowns: [
        {
          business_id: "biz-3",
          business_name: "Gamma",
          provider: "search_console",
          request_type: "seo_overview",
          error_message: "cooldown",
          cooldown_until: new Date(Date.now() + 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    expect(payload.summary.failedJobs24h).toBe(1);
    expect(payload.summary.activeCooldowns).toBe(1);
    expect(payload.summary.impactedBusinesses).toBe(3);
    expect(payload.issues.some((issue) => issue.status === "cooldown")).toBe(true);
  });
});

describe("buildAdminRevenueRisk", () => {
  it("surfaces unsubscribed businesses and non-active subscriptions", () => {
    const payload = buildAdminRevenueRisk({
      workspaces: [
        {
          business_id: "biz-1",
          business_name: "Acme",
          owner_name: "Owner",
          owner_email: "owner@example.com",
          created_at: "2026-03-01T10:00:00.000Z",
          connected_integrations: 2,
          has_active_subscription: false,
        },
      ],
      subscriptions: [
        {
          business_id: "biz-2",
          business_name: "Beta",
          owner_name: "Owner 2",
          owner_email: "owner2@example.com",
          plan_id: "growth",
          status: "cancelled",
          updated_at: new Date().toISOString(),
        },
        {
          business_id: "biz-3",
          business_name: "Gamma",
          owner_name: "Owner 3",
          owner_email: "owner3@example.com",
          plan_id: "pro",
          status: "active",
          updated_at: new Date().toISOString(),
        },
      ],
    });

    expect(payload.summary.unsubscribedBusinesses).toBe(1);
    expect(payload.summary.nonActiveSubscriptions).toBe(1);
    expect(payload.summary.activeSubscriptions).toBe(1);
    expect(payload.summary.atRiskBusinesses).toBe(2);
  });
});
