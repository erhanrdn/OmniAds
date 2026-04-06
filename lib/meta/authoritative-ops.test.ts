import { describe, expect, it } from "vitest";
import {
  buildMetaPublishVerificationReport,
  buildMetaSoakSnapshotOutput,
  buildMetaStateCheckOutput,
  buildMetaVerifyDayReport,
  getMetaAuthoritativeRefreshRecommendation,
} from "@/lib/meta/authoritative-ops";

describe("meta authoritative ops helpers", () => {
  it("builds verify-day output with recommendation and provenance", () => {
    const report = buildMetaVerifyDayReport({
      businessId: "biz-1",
      providerAccountId: "act_1",
      day: "2026-04-04",
      verificationState: "repair_required",
      sourceManifestState: "failed",
      validationState: "repair_required",
      activePublication: {
        publishedAt: "2026-04-05T08:59:00.000Z",
        publicationReason: "authoritative_finalize",
        activeSliceVersionId: "slice-1",
      },
      surfaces: [
        {
          surface: "account_daily",
          manifest: {
            businessId: "biz-1",
            providerAccountId: "act_1",
            day: "2026-04-04",
            surface: "account_daily",
            accountTimezone: "UTC",
            sourceKind: "finalize_day",
            sourceWindowKind: "d_minus_1",
            fetchStatus: "failed",
          },
          publication: null,
        },
      ],
      lastFailure: {
        providerAccountId: "act_1",
        day: "2026-04-04",
        surface: "account_daily",
        result: "failed",
        eventKind: "totals_mismatch",
        severity: "error",
        reason: "warehouse drift",
        createdAt: "2026-04-05T09:00:00.000Z",
      },
      repairBacklog: 2,
      deadLetters: 1,
      staleLeases: 0,
      queuedPartitions: 3,
      leasedPartitions: 0,
    });

    expect(report).toMatchObject({
      businessId: "biz-1",
      providerAccountId: "act_1",
      day: "2026-04-04",
      verificationState: "repair_required",
      refreshRecommendation: "replay_dead_letter",
      progression: {
        queued: 3,
        deadLetters: 1,
        repairBacklog: 2,
      },
    });
    expect(report.surfaces[0]).toMatchObject({
      surface: "account_daily",
      manifestState: "failed",
      publicationPublishedAt: null,
    });
  });

  it("builds state-check output with manifest counts and sla visibility", () => {
    const payload = buildMetaStateCheckOutput({
      businessId: "biz-1",
      capturedAt: "2026-04-05T10:00:00.000Z",
      manifestCounts: {
        pending: 1,
        running: 1,
        completed: 3,
        failed: 1,
        superseded: 0,
        total: 6,
      },
      progression: {
        queued: 2,
        leased: 1,
        published: 4,
        retryableFailed: 1,
        deadLetter: 1,
        staleLeases: 1,
        repairBacklog: 2,
      },
      latestPublishes: [],
      d1FinalizeSla: {
        totalAccounts: 1,
        breachedAccounts: 1,
        accounts: [
          {
            providerAccountId: "act_1",
            accountTimezone: "UTC",
            expectedDay: "2026-04-04",
            verificationState: "processing",
            publishedAt: null,
            breached: true,
          },
        ],
      },
      validationFailures24h: 2,
      recentFailures: [],
      lastSuccessfulPublishAt: null,
    });

    expect(payload).toMatchObject({
      sourceManifestCounts: {
        total: 6,
        failed: 1,
      },
      progression: {
        published: 4,
        deadLetters: 1,
      },
      d1FinalizeSla: {
        breachedAccounts: 1,
      },
      validationFailures24h: 2,
    });
  });

  it("recommends cleanup for stale leased verification attempts", () => {
    expect(
      getMetaAuthoritativeRefreshRecommendation({
        verificationState: "processing",
        deadLetters: 0,
        staleLeases: 2,
        repairBacklog: 0,
        queuedPartitions: 0,
        leasedPartitions: 1,
        sourceManifestState: "running",
      }),
    ).toBe("cleanup_then_reschedule");
  });

  it("builds publish verification output with explicit go/no-go reasons", () => {
    const report = buildMetaPublishVerificationReport({
      businessId: "biz-1",
      providerAccountId: "act_1",
      day: "2026-04-04",
      verificationState: "failed",
      sourceManifestState: "completed",
      validationState: "failed",
      activePublication: null,
      surfaces: [
        { surface: "account_daily", manifest: null, publication: null },
        { surface: "campaign_daily", manifest: null, publication: null },
      ],
      lastFailure: {
        providerAccountId: "act_1",
        day: "2026-04-04",
        surface: "account_daily",
        result: "failed",
        eventKind: "totals_mismatch",
        severity: "error",
        reason: "source mismatch",
        createdAt: "2026-04-05T09:00:00.000Z",
      },
      repairBacklog: 1,
      deadLetters: 0,
      staleLeases: 1,
      queuedPartitions: 2,
      leasedPartitions: 0,
    });

    expect(report.goNoGo.passed).toBe(false);
    expect(report.goNoGo.reasons).toEqual(
      expect.arrayContaining([
        "core publication pointer missing or not finalized_verified",
        "stale leases present",
        "last failure: source mismatch",
      ]),
    );
  });

  it("builds soak snapshot output with authoritative soak signals", () => {
    const snapshot = buildMetaSoakSnapshotOutput({
      businessId: "biz-1",
      capturedAt: "2026-04-05T10:00:00.000Z",
      sinceIso: "2026-04-05T09:00:00.000Z",
      authoritative: {
        businessId: "biz-1",
        capturedAt: "2026-04-05T10:00:00.000Z",
        manifestCounts: {
          pending: 0,
          running: 1,
          completed: 4,
          failed: 0,
          superseded: 0,
          total: 5,
        },
        progression: {
          queued: 2,
          leased: 1,
          published: 4,
          retryableFailed: 0,
          deadLetter: 0,
          staleLeases: 0,
          repairBacklog: 1,
        },
        latestPublishes: [],
        d1FinalizeSla: {
          totalAccounts: 2,
          breachedAccounts: 0,
          accounts: [],
        },
        validationFailures24h: 0,
        recentFailures: [],
        lastSuccessfulPublishAt: "2026-04-05T09:59:00.000Z",
      },
      progressDiff: {
        states: [{ scope: "account_daily" }],
        partitions: [{ status: "queued" }],
      },
    });

    expect(snapshot.soakSignals).toMatchObject({
      d1SlaBreaches: 0,
      publishedProgression: 4,
      queueDepth: 2,
      lastSuccessfulPublishAt: "2026-04-05T09:59:00.000Z",
    });
    expect(snapshot.progressDiff?.states).toHaveLength(1);
  });
});
