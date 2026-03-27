"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { InlineHelp } from "@/components/admin/inline-help";

interface SyncIssueRow {
  businessId: string;
  businessName: string;
  provider: "google_ads" | "ga4" | "search_console";
  reportType: string;
  status: "failed" | "running" | "cooldown";
  detail: string;
  triggeredAt: string | null;
  completedAt: string | null;
}

interface SyncHealthPayload {
  summary: {
    impactedBusinesses: number;
    runningJobs: number;
    stuckJobs: number;
    failedJobs24h: number;
    activeCooldowns: number;
    successJobs24h: number;
    topIssue: string | null;
    googleAdsQueueDepth?: number;
    googleAdsLeasedPartitions?: number;
    googleAdsDeadLetterPartitions?: number;
    googleAdsOldestQueuedPartition?: string | null;
  };
  issues: SyncIssueRow[];
  googleAdsBusinesses?: Array<{
    businessId: string;
    businessName: string;
    queueDepth: number;
    leasedPartitions: number;
    deadLetterPartitions: number;
    oldestQueuedPartition: string | null;
    latestPartitionActivityAt: string | null;
    campaignCompletedDays: number;
    searchTermCompletedDays: number;
    productCompletedDays: number;
  }>;
}

function providerLabel(provider: SyncIssueRow["provider"]) {
  if (provider === "google_ads") return "Google Ads";
  if (provider === "search_console") return "Search Console";
  return "GA4";
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("tr-TR");
}

const SYNC_HELP: Record<string, string> = {
  "Failed 24h":
    "Background sync jobs that failed during the last 24 hours and need system-side attention.",
  Stuck:
    "Jobs still marked as running after the normal execution window, which usually means the sync is stuck.",
  Running:
    "Jobs currently executing right now. This is not an error by itself.",
  Cooldowns:
    "Provider requests temporarily paused after confirmed failures, rate limits, or repeated retries.",
};

export default function AdminSyncHealthPage() {
  const [payload, setPayload] = useState<SyncHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{
    businessId: string | null;
    action: string | null;
    message: string | null;
    error: string | null;
  }>({
    businessId: null,
    action: null,
    message: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/sync-health")
      .then(async (response) => {
        const nextPayload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            (nextPayload as { message?: string } | null)?.message ??
              "Sync health could not be loaded."
          );
        }
        return nextPayload as SyncHealthPayload;
      })
      .then((nextPayload) => {
        if (cancelled) return;
        setPayload(nextPayload);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPayload(null);
        setLoadError(error instanceof Error ? error.message : "Sync health could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-400">Yükleniyor...</div>;
  }

  if (loadError) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{loadError}</div>;
  }

  const summary = payload?.summary ?? {
    impactedBusinesses: 0,
    runningJobs: 0,
    stuckJobs: 0,
    failedJobs24h: 0,
    activeCooldowns: 0,
    successJobs24h: 0,
    topIssue: null,
    googleAdsQueueDepth: 0,
    googleAdsLeasedPartitions: 0,
    googleAdsDeadLetterPartitions: 0,
    googleAdsOldestQueuedPartition: null,
  };
  const issues = payload?.issues ?? [];
  const googleAdsBusinesses = payload?.googleAdsBusinesses ?? [];

  async function runGoogleAdsAction(
    businessId: string,
    action: "cleanup" | "replay_dead_letter" | "reschedule" | "refresh_state"
  ) {
    setActionState({
      businessId,
      action,
      message: null,
      error: null,
    });
    try {
      const response = await fetch("/api/admin/sync-health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "google_ads",
          action,
          businessId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (body as { message?: string } | null)?.message ??
            "Google Ads recovery action failed."
        );
      }
      setActionState({
        businessId,
        action,
        message: `${action} completed successfully.`,
        error: null,
      });
      const refreshed = await fetch("/api/admin/sync-health").then((res) => res.json());
      setPayload(refreshed as SyncHealthPayload);
    } catch (error) {
      setActionState({
        businessId,
        action,
        message: null,
        error:
          error instanceof Error ? error.message : "Google Ads recovery action failed.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-50">
            <RefreshCw className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sync Health</h1>
            <p className="text-sm text-gray-500 mt-1">Yalnızca gerçekten takılan veya başarısız olan arka plan sync olaylarını gösterir</p>
          </div>
        </div>
        <Link href="/admin" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          Dashboard&apos;a dön
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Failed 24h" value={summary.failedJobs24h} help={SYNC_HELP["Failed 24h"]} />
        <MetricCard label="Stuck" value={summary.stuckJobs} help={SYNC_HELP.Stuck} />
        <MetricCard label="Running" value={summary.runningJobs} help={SYNC_HELP.Running} />
        <MetricCard label="Cooldowns" value={summary.activeCooldowns} help={SYNC_HELP.Cooldowns} />
        <MetricCard label="GAds Queue" value={summary.googleAdsQueueDepth ?? 0} help="Google Ads partition queue depth across all businesses." />
        <MetricCard label="GAds Leased" value={summary.googleAdsLeasedPartitions ?? 0} help="Google Ads partitions currently leased or running." />
        <MetricCard label="GAds Dead" value={summary.googleAdsDeadLetterPartitions ?? 0} help="Google Ads dead-letter partitions that require intervention." />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900">Özet</p>
        <p className="text-sm text-gray-500 mt-2">
          {summary.successJobs24h} başarılı job son 24 saatte tamamlandı. En yaygın problem:{" "}
          <span className="font-medium text-gray-700">{summary.topIssue ?? "Sorun yok"}</span>
        </p>
        <p className="text-sm text-gray-500 mt-2">
          En eski Google Ads queued partition:{" "}
          <span className="font-medium text-gray-700">{formatDateTime(summary.googleAdsOldestQueuedPartition ?? null)}</span>
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Recovery actions are available below for cleanup, dead-letter replay, reschedule, and state refresh.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Google Ads queue recovery</h2>
          <p className="mt-1 text-sm text-gray-500">
            Use these controls instead of manual SQL when a business queue is stuck.
          </p>
        </div>
        {googleAdsBusinesses.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400">Google Ads queue verisi yok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {googleAdsBusinesses.map((business) => {
              const isBusy = actionState.businessId === business.businessId;
              return (
                <div key={business.businessId} className="px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{business.businessName}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Queue {business.queueDepth} • Leased {business.leasedPartitions} • Dead-letter {business.deadLetterPartitions}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Campaign {business.campaignCompletedDays} • Search terms {business.searchTermCompletedDays} • Products {business.productCompletedDays}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Oldest queued {formatDateTime(business.oldestQueuedPartition)} • Latest activity {formatDateTime(business.latestPartitionActivityAt)}
                      </p>
                      {actionState.businessId === business.businessId && actionState.message ? (
                        <p className="mt-2 text-xs text-emerald-700">{actionState.message}</p>
                      ) : null}
                      {actionState.businessId === business.businessId && actionState.error ? (
                        <p className="mt-2 text-xs text-red-700">{actionState.error}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        label="Cleanup"
                        busy={isBusy && actionState.action === "cleanup"}
                        onClick={() => runGoogleAdsAction(business.businessId, "cleanup")}
                      />
                      <ActionButton
                        label="Replay Dead Letter"
                        busy={isBusy && actionState.action === "replay_dead_letter"}
                        onClick={() => runGoogleAdsAction(business.businessId, "replay_dead_letter")}
                      />
                      <ActionButton
                        label="Reschedule"
                        busy={isBusy && actionState.action === "reschedule"}
                        onClick={() => runGoogleAdsAction(business.businessId, "reschedule")}
                      />
                      <ActionButton
                        label="Refresh State"
                        busy={isBusy && actionState.action === "refresh_state"}
                        onClick={() => runGoogleAdsAction(business.businessId, "refresh_state")}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Problemli sync olayları</h2>
        </div>
        {issues.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400">Aktif sync problemi yok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {issues.map((issue) => (
              <div key={`${issue.businessId}:${issue.provider}:${issue.reportType}:${issue.triggeredAt}:${issue.status}`} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{issue.businessName}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {providerLabel(issue.provider)} • {issue.reportType} • {issue.status}
                    </p>
                    <p className="text-sm text-gray-600 mt-3">{issue.detail}</p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <p>Triggered: {formatDateTime(issue.triggeredAt)}</p>
                    <p className="mt-1">Completed / until: {formatDateTime(issue.completedAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  help,
}: {
  label: string;
  value: number;
  help?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        {help ? <InlineHelp text={help} /> : null}
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? "Working..." : label}
    </button>
  );
}
