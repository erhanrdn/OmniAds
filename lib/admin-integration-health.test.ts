import { describe, expect, it } from "vitest";
import {
  buildAdminIntegrationHealthPayload,
  type RawAdminIntegrationHealthRow,
} from "@/lib/admin-integration-health";

describe("buildAdminIntegrationHealthPayload", () => {
  it("groups stale fallback rows by issue type and merges duplicate workspaces within a provider node", () => {
    const rows: RawAdminIntegrationHealthRow[] = [
      {
        provider: "meta",
        business_id: "biz-1",
        business_name: "Acme",
        fetched_at: "2026-03-19T10:00:00.000Z",
        refresh_failed: true,
        last_error: null,
        next_refresh_after: null,
        refresh_in_progress: false,
        snapshot_account_count: 1,
      },
      {
        provider: "google",
        business_id: "biz-1",
        business_name: "Acme",
        fetched_at: "2026-03-19T11:00:00.000Z",
        refresh_failed: true,
        last_error: null,
        next_refresh_after: null,
        refresh_in_progress: false,
        snapshot_account_count: 1,
      },
    ];

    const payload = buildAdminIntegrationHealthPayload(rows);
    const staleGroup = payload.issueGroups.find((group) => group.issueType === "Stale snapshot");

    expect(staleGroup?.affectedWorkspaces).toBe(1);
    expect(staleGroup?.providers).toHaveLength(2);
    expect(staleGroup?.providers[0]?.workspaces[0]?.businessName).toBe("Acme");
  });

  it("produces critical issue groups for quota failures", () => {
    const rows: RawAdminIntegrationHealthRow[] = [
      {
        provider: "google",
        business_id: "biz-2",
        business_name: "Beta",
        fetched_at: "2026-03-21T10:00:00.000Z",
        refresh_failed: true,
        last_error: "Resource has been exhausted due to quota",
        next_refresh_after: "2026-03-21T16:00:00.000Z",
        refresh_in_progress: false,
        snapshot_account_count: 1,
      },
    ];

    const payload = buildAdminIntegrationHealthPayload(rows);
    const quotaGroup = payload.issueGroups.find((group) => group.issueType === "Quota / rate limit");

    expect(quotaGroup?.criticality).toBe("critical");
    expect(payload.summary.topIssue).toBe("Quota / rate limit");
    expect(payload.summary.providers[1]?.topIssue).toBe("Quota / rate limit");
    expect(quotaGroup?.providers[0]?.workspaces[0]?.providerDetails[0]?.displayDetail).toContain(
      "quota"
    );
  });

  it("keeps dashboard summary provider counts even when there are no issues", () => {
    const rows: RawAdminIntegrationHealthRow[] = [
      {
        provider: "meta",
        business_id: "biz-3",
        business_name: "Gamma",
        fetched_at: new Date().toISOString(),
        refresh_failed: false,
        last_error: null,
        next_refresh_after: null,
        refresh_in_progress: false,
        snapshot_account_count: 1,
      },
    ];

    const payload = buildAdminIntegrationHealthPayload(rows);

    expect(payload.issueGroups).toHaveLength(0);
    expect(payload.summary.totalAffectedWorkspaces).toBe(0);
    expect(payload.summary.providers.find((row) => row.provider === "meta")?.connectedBusinesses).toBe(1);
  });

  it("does not report a stale snapshot when the snapshot is old but refresh has not failed", () => {
    const rows: RawAdminIntegrationHealthRow[] = [
      {
        provider: "meta",
        business_id: "biz-4",
        business_name: "Delta",
        fetched_at: "2026-03-19T10:00:00.000Z",
        refresh_failed: false,
        last_error: null,
        next_refresh_after: null,
        refresh_in_progress: false,
        snapshot_account_count: 1,
      },
    ];

    const payload = buildAdminIntegrationHealthPayload(rows);
    expect(payload.issueGroups.find((group) => group.issueType === "Stale snapshot")).toBeFalsy();
  });

  it("derives an explanatory detail when stale snapshots are being used after a failed refresh", () => {
    const rows: RawAdminIntegrationHealthRow[] = [
      {
        provider: "meta",
        business_id: "biz-4b",
        business_name: "Delta",
        fetched_at: "2026-03-19T10:00:00.000Z",
        refresh_failed: true,
        last_error: null,
        next_refresh_after: null,
        refresh_in_progress: false,
        snapshot_account_count: 1,
      },
    ];

    const payload = buildAdminIntegrationHealthPayload(rows);
    const staleDetail =
      payload.issueGroups.find((group) => group.issueType === "Stale snapshot")?.providers[0]
        ?.workspaces[0]?.providerDetails[0];

    expect(staleDetail?.lastError).toBeNull();
    expect(staleDetail?.displayDetail).toContain("latest refresh did not complete successfully");
  });

  it("derives an explanatory detail when snapshots are missing without a provider error", () => {
    const rows: RawAdminIntegrationHealthRow[] = [
      {
        provider: "google",
        business_id: "biz-5",
        business_name: "Epsilon",
        fetched_at: null,
        refresh_failed: false,
        last_error: null,
        next_refresh_after: null,
        refresh_in_progress: false,
        snapshot_account_count: 0,
      },
    ];

    const payload = buildAdminIntegrationHealthPayload(rows);
    const missingDetail =
      payload.issueGroups.find((group) => group.issueType === "Missing snapshot")?.providers[0]
        ?.workspaces[0]?.providerDetails[0];

    expect(missingDetail?.displayDetail).toContain("No provider snapshot is stored yet");
  });
});
