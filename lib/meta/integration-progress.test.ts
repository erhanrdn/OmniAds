import { describe, expect, it } from "vitest";
import { resolveMetaIntegrationProgress } from "@/lib/meta/integration-progress";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

function buildStatus(
  overrides: Partial<MetaStatusResponse> = {}
): MetaStatusResponse {
  return {
    state: "syncing",
    connected: true,
    assignedAccountIds: ["act_1"],
    primaryAccountTimezone: "UTC",
    latestSync: {
      status: "running",
      readyThroughDate: "2026-04-10",
      progressPercent: 71,
      completedDays: 10,
      totalDays: 14,
    },
    coreReadiness: {
      state: "ready",
      usable: true,
      complete: true,
      percent: 100,
      reason: null,
      summary: "Summary and campaign data are ready for Meta's primary reporting surfaces.",
      missingSurfaces: [],
      blockedSurfaces: [],
      surfaces: {} as never,
    },
    extendedCompleteness: {
      state: "syncing",
      complete: false,
      percent: 33,
      reason: "Breakdown data is still being prepared for the selected range.",
      summary: "Breakdown data is still being prepared for the selected range.",
      missingSurfaces: ["breakdowns.age"],
      blockedSurfaces: [],
      surfaces: {} as never,
    },
    pageReadiness: {
      state: "partial",
      usable: true,
      complete: false,
      selectedRangeMode: "historical_warehouse",
      reason: "Breakdown data is still being prepared for the selected range.",
      missingRequiredSurfaces: ["breakdowns.age"],
      requiredSurfaces: {} as never,
      optionalSurfaces: {} as never,
    },
    rangeCompletionBySurface: {
      account_daily: {
        recentCompletedDays: 10,
        recentTotalDays: 14,
        historicalCompletedDays: 180,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-10",
      },
      campaign_daily: {
        recentCompletedDays: 10,
        recentTotalDays: 14,
        historicalCompletedDays: 180,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-10",
      },
      adset_daily: {
        recentCompletedDays: 8,
        recentTotalDays: 14,
        historicalCompletedDays: 160,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-08",
      },
      creative_daily: {
        recentCompletedDays: 6,
        recentTotalDays: 14,
        historicalCompletedDays: 120,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-06",
      },
      ad_daily: {
        recentCompletedDays: 6,
        recentTotalDays: 14,
        historicalCompletedDays: 110,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-05",
      },
    },
    recentExtendedReady: false,
    historicalExtendedReady: false,
    warehouse: {
      coverage: {
        pendingSurfaces: ["creative_daily", "ad_daily"],
      },
    } as never,
    jobHealth: {
      queueDepth: 8,
      leasedPartitions: 2,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
    } as never,
    operations: {
      progressState: "syncing",
      blockingReasons: [],
      repairableActions: [],
      stallFingerprints: [],
    },
    ...overrides,
  };
}

describe("resolveMetaIntegrationProgress", () => {
  it("returns null when Meta is disconnected or the route summary is not visible", () => {
    expect(
      resolveMetaIntegrationProgress(buildStatus({ connected: false }))
    ).toBeNull();

    expect(
      resolveMetaIntegrationProgress(
        buildStatus({
          integrationSummary: {
            visible: false,
            state: "waiting",
            scope: "not_applicable",
            attentionNeeded: false,
            stages: [],
          },
        })
      )
    ).toBeNull();
  });

  it("prefers the route summary over legacy raw composition", () => {
    const model = resolveMetaIntegrationProgress(
      buildStatus({
        integrationSummary: {
          visible: true,
          state: "blocked",
          scope: "selected_range",
          attentionNeeded: true,
          stages: [
            {
              key: "connection",
              state: "ready",
              percent: null,
              code: "connected",
              evidence: {
                assignedAccountCount: 1,
                primaryTimezone: "UTC",
              },
            },
            {
              key: "queue_worker",
              state: "blocked",
              percent: null,
              code: "queue_blocked",
              evidence: {
                queueDepth: 3,
                blockerCount: 1,
                blockerCodes: ["blocked_publication_mismatch"],
              },
            },
            {
              key: "core_data",
              state: "ready",
              percent: null,
              code: "core_ready",
              evidence: {
                readyThroughDate: "2026-04-05",
              },
            },
            {
              key: "priority_window",
              state: "blocked",
              percent: 43,
              code: "selected_range_blocked",
              evidence: {
                completedDays: 3,
                totalDays: 7,
                blockerCount: 1,
                blockerCodes: ["blocked_publication_mismatch"],
              },
            },
            {
              key: "extended_surfaces",
              state: "working",
              percent: 33,
              code: "breakdowns_preparing",
              evidence: {
                pendingSurfaceCount: 1,
                pendingSurfaces: ["creative_daily"],
              },
            },
            {
              key: "attention",
              state: "blocked",
              percent: null,
              code: "attention_needed",
              evidence: {
                blockerCount: 1,
                blockerCodes: ["blocked_publication_mismatch"],
              },
            },
          ],
        },
      }),
      "en"
    );

    expect(model?.stages.map((stage) => stage.title)).toEqual([
      "Connection",
      "Queue / worker",
      "Core data",
      "Selected range",
      "Extended surfaces",
      "Attention / recovery",
    ]);
    expect(model?.stages.find((stage) => stage.key === "priority_window")).toMatchObject({
      state: "blocked",
      label: "range blocked",
      detail: "Selected-range truth needs recovery before it can be trusted.",
      percent: 43,
      evidence: "Published truth blocked • 3/7 days",
    });
  });

  it("localizes recent-window progress in English", () => {
    const model = resolveMetaIntegrationProgress(buildStatus(), "en");

    expect(model?.stages.map((stage) => stage.title)).toEqual([
      "Connection",
      "Queue / worker",
      "Core data",
      "Recent window",
      "Extended surfaces",
    ]);
    expect(model?.stages[0]).toMatchObject({
      state: "ready",
      label: "connected",
      detail: "Meta account is assigned to this workspace.",
      evidence: "Primary timezone UTC",
    });
    expect(model?.stages[1]).toMatchObject({
      state: "working",
      label: "worker active",
      evidence: "Queue 8 • Leased 2",
    });
    expect(model?.stages[3]).toMatchObject({
      state: "working",
      label: "recent window preparing",
      detail: "Recent summary and campaign days are being prepared first.",
      percent: 71,
      evidence: "10/14 days • Ready through Apr 10, 2026",
    });
    expect(model?.stages[4]).toMatchObject({
      state: "working",
      label: "breakdowns preparing",
      evidence: expect.stringContaining("Pending creatives, ads"),
    });
  });

  it("localizes the Meta card progress block in Turkish", () => {
    const model = resolveMetaIntegrationProgress(buildStatus(), "tr");

    expect(model?.stages.map((stage) => stage.title)).toEqual([
      "Bağlantı",
      "Kuyruk / worker",
      "Çekirdek veri",
      "Yakın pencere",
      "Genişletilmiş yüzeyler",
    ]);
    expect(model?.stages[0]).toMatchObject({
      label: "bağlı",
      detail: "Bu workspace için Meta hesabı atanmış.",
      evidence: "Birincil saat dilimi UTC",
    });
    expect(model?.stages[1]).toMatchObject({
      label: "worker aktif",
      evidence: "Kuyruk 8 • Lease 2",
    });
    expect(model?.stages[3]).toMatchObject({
      label: "yakın pencere hazırlanıyor",
      detail: "Yakın özet ve kampanya günleri önce hazırlanıyor.",
      evidence: expect.stringContaining("10/14 gün"),
    });
    expect(model?.stages[4]).toMatchObject({
      label: "breakdownlar hazırlanıyor",
      evidence: expect.stringContaining("Bekleyen kreatifler, reklamlar"),
    });
  });
});
