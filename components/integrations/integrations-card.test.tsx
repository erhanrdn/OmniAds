import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntegrationsCard } from "@/components/integrations/integrations-card";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import type { ProviderViewState } from "@/store/integrations-store";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", props),
}));

const baseView: ProviderViewState = {
  provider: "meta",
  status: "ready",
  connectionLabel: "Connected",
  primaryActionLabel: "Manage assignments",
  statusLabel: "Connected",
  detailLabel: "Status",
  detailValue: "Healthy",
  accountLabel: "Account",
  accountValue: "1 assigned",
  lastSyncLabel: "Last sync",
  lastSyncValue: "2026-04-10T08:00:00.000Z",
  assignedCount: 1,
  assignedSummary: "1 Meta account assigned.",
  notice: null,
  canManageAssignments: true,
  isConnected: true,
};

function buildStatus(): MetaStatusResponse {
  return {
    state: "syncing",
    connected: true,
    assignedAccountIds: ["act_1"],
    primaryAccountTimezone: "UTC",
    latestSync: {
      status: "running",
      progressPercent: 71,
      readyThroughDate: "2026-04-10",
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
  };
}

function buildGoogleStatus(): GoogleAdsStatusResponse {
  return {
    state: "action_required",
    connected: true,
    assignedAccountIds: ["acc_1"],
    blockerClass: "none",
    controlPlanePersistence: {
      identity: {
        buildId: "build-1",
        environment: "production",
        providerScope: "google_ads",
      },
      exact: {
        deployGate: null,
        releaseGate: null,
        repairPlan: null,
      },
      fallbackByBuild: {
        deployGate: null,
        releaseGate: null,
        repairPlan: null,
      },
      latest: {
        deployGate: null,
        releaseGate: null,
        repairPlan: null,
      },
      missingExact: [],
      exactRowsPresent: true,
    },
    releaseGate: {
      id: "gate-1",
      gateKind: "release_gate",
      gateScope: "release_readiness",
      buildId: "build-1",
      environment: "production",
      mode: "block",
      baseResult: "pass",
      verdict: "pass",
      blockerClass: null,
      summary: "passed",
      breakGlass: false,
      overrideReason: null,
      evidence: {},
      emittedAt: "2026-04-20T07:22:20.362Z",
    },
    repairPlan: {
      id: "plan-1",
      buildId: "build-1",
      environment: "production",
      providerScope: "google_ads",
      planMode: "dry_run",
      eligible: true,
      blockedReason: null,
      breakGlass: false,
      summary: "no recommendations",
      recommendations: [],
      emittedAt: "2026-04-20T07:22:20.672Z",
    },
    operations: {
      currentMode: "safe_mode",
      globalExtendedExecutionEnabled: false,
      quotaPressure: 0,
      breakerState: "closed",
      progressState: "blocked",
      blockingReasons: [],
      repairableActions: [],
      stallFingerprints: [],
      activityState: "ready",
    } as never,
    domains: {
      core: {
        state: "ready",
        label: "Core ready",
        detail: "Summary and campaign data are ready.",
      },
      selectedRange: {
        state: "ready",
        label: "Range ready",
        detail: "Selected range surfaces are ready.",
      },
      advisor: {
        state: "ready",
        label: "Analysis ready",
        detail: "Analysis inputs are ready.",
      },
    },
    panel: {
      coreUsable: true,
      extendedLimited: false,
      headline: "Google Ads is ready.",
      detail: "All primary surfaces are available.",
      surfaceStates: [],
    },
    advisor: {
      ready: true,
      readinessWindowDays: 90,
      requiredSurfaces: [],
      availableSurfaces: [],
      missingSurfaces: [],
      readyRangeStart: "2026-01-01",
      readyRangeEnd: "2026-04-19",
    },
    primaryAccountTimezone: "UTC",
    warehouse: {
      rowCount: 7,
      firstDate: "2026-04-13",
      lastDate: "2026-04-19",
      coverage: {
        selectedRange: {
          startDate: "2026-04-13",
          endDate: "2026-04-19",
          completedDays: 7,
          totalDays: 7,
          readyThroughDate: "2026-04-19",
          isComplete: true,
        },
      },
    },
    jobHealth: {
      runningJobs: 0,
      staleRunningJobs: 0,
      queueDepth: 0,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
    },
  };
}

describe("IntegrationsCard", () => {
  it("renders the compact Meta progress block in English without removing the existing pill and notice", () => {
    const html = renderToStaticMarkup(
      <IntegrationsCard
        provider="meta"
        language="en"
        description="Connect Ads Manager to import campaigns, ad sets, and spend."
        view={baseView}
        syncNotice="Breakdown data is still being prepared for the selected range."
        metaSyncStatus={buildStatus()}
        metaSyncLoading={false}
        onConnect={() => undefined}
        onReconnect={() => undefined}
        onRetry={() => undefined}
        onCancel={() => undefined}
        onDisconnect={() => undefined}
        onOpenAssignments={() => undefined}
      />
    );

    expect(html).toContain("Core ready");
    expect(html).toContain("Breakdown data is still being prepared for the selected range.");
    expect(html).toContain("Connection");
    expect(html).toContain("Queue / worker");
    expect(html).toContain("Core data");
    expect(html).toContain("Core coverage");
    expect(html).toContain("Extended surfaces");
    expect(html).toContain("worker active");
    expect(html).toContain("core ready");
  });

  it("renders the compact Meta progress block in Turkish", () => {
    const html = renderToStaticMarkup(
      <IntegrationsCard
        provider="meta"
        language="tr"
        description="Connect Ads Manager to import campaigns, ad sets, and spend."
        view={baseView}
        syncNotice="Breakdown verisi hâlâ hazırlanıyor."
        metaSyncStatus={buildStatus()}
        metaSyncLoading={false}
        onConnect={() => undefined}
        onReconnect={() => undefined}
        onRetry={() => undefined}
        onCancel={() => undefined}
        onDisconnect={() => undefined}
        onOpenAssignments={() => undefined}
      />
    );

    expect(html).toContain("Bağlantı");
    expect(html).toContain("Kuyruk / worker");
    expect(html).toContain("Çekirdek veri");
    expect(html).toContain("Çekirdek kapsam");
    expect(html).toContain("Genişletilmiş yüzeyler");
    expect(html).toContain("worker aktif");
    expect(html).toContain("Bu workspace için Meta hesabı atanmış.");
  });

  it("renders the compact Google progress block without surfacing stale sync attention when the control plane is closed", () => {
    const html = renderToStaticMarkup(
      <IntegrationsCard
        provider="google"
        language="en"
        description="Link Google Ads to track performance and sync account data."
        view={{
          ...baseView,
          provider: "google",
          detailValue: "Healthy",
          accountValue: "1 assigned",
        }}
        syncNotice="Cached accounts available while the latest refresh finishes."
        syncNoticeTone="info"
        googleSyncStatus={buildGoogleStatus()}
        googleSyncLoading={false}
        onConnect={() => undefined}
        onReconnect={() => undefined}
        onRetry={() => undefined}
        onCancel={() => undefined}
        onDisconnect={() => undefined}
        onOpenAssignments={() => undefined}
      />
    );

    expect(html).toContain("Connection");
    expect(html).toContain("Queue / worker");
    expect(html).toContain("Core data");
    expect(html).toContain("Selected range");
    expect(html).toContain("Analysis / advisor");
    expect(html).toContain("queue clear");
    expect(html).toContain("Cached accounts available while the latest refresh finishes.");
    expect(html).toContain("Active");
    expect(html).not.toContain("Attention / recovery");
    expect(html).not.toContain("attention needed");
  });
});
