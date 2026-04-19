import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntegrationsCard } from "@/components/integrations/integrations-card";
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
});
