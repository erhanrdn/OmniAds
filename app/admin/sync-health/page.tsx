"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { InlineHelp } from "@/components/admin/inline-help";
import { formatMetaDateTime } from "@/lib/meta/ui";

interface SyncIssueRow {
  businessId: string;
  businessName: string;
  provider: "google_ads" | "meta" | "ga4" | "search_console";
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
    metaQueueDepth?: number;
    metaLeasedPartitions?: number;
    metaDeadLetterPartitions?: number;
    metaOldestQueuedPartition?: string | null;
    workerOnline?: boolean;
    workerInstances?: number;
    workerLastHeartbeatAt?: string | null;
  };
  issues: SyncIssueRow[];
  workerHealth?: {
    onlineWorkers: number;
    workerInstances: number;
    lastHeartbeatAt: string | null;
    workers: Array<{
      workerId: string;
      instanceType: string;
      providerScope: string;
      status: string;
      lastHeartbeatAt: string | null;
      lastBusinessId: string | null;
      lastPartitionId: string | null;
    }>;
  };
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
    latestCheckpointPhase?: string | null;
    latestCheckpointUpdatedAt?: string | null;
    checkpointLagMinutes?: number | null;
    lastSuccessfulPageIndex?: number | null;
    resumeCapable?: boolean;
    checkpointFailures?: number;
  }>;
  metaBusinesses?: Array<{
    businessId: string;
    businessName: string;
    queueDepth: number;
    leasedPartitions: number;
    retryableFailedPartitions: number;
    deadLetterPartitions: number;
    staleLeasePartitions: number;
    stateRowCount: number;
    todayAccountRows: number;
    todayAdsetRows: number;
    currentDayReference: string | null;
    oldestQueuedPartition: string | null;
    latestPartitionActivityAt: string | null;
    accountCompletedDays: number;
    adsetCompletedDays: number;
    creativeCompletedDays: number;
    latestCheckpointScope?: string | null;
    latestCheckpointPhase?: string | null;
    latestCheckpointUpdatedAt?: string | null;
    checkpointLagMinutes?: number | null;
    lastSuccessfulPageIndex?: number | null;
    resumeCapable?: boolean;
    checkpointFailures?: number;
  }>;
}

function providerLabel(provider: SyncIssueRow["provider"]) {
  if (provider === "google_ads") return "Google Ads";
  if (provider === "meta") return "Meta";
  if (provider === "search_console") return "Search Console";
  return "GA4";
}

function formatDateTime(value: string | null) {
  return formatMetaDateTime(value, "tr") ?? "—";
}

function getMetaBusinessSignals(business: NonNullable<SyncHealthPayload["metaBusinesses"]>[number]) {
  const signals: string[] = [];
  if (business.deadLetterPartitions > 0) signals.push("Dead letter present");
  if (business.retryableFailedPartitions > 0) signals.push("Retryable failed backlog");
  if (business.queueDepth > 0 && business.leasedPartitions === 0) signals.push("Queue waiting for worker");
  if (business.staleLeasePartitions > 0) signals.push("Stale lease detected");
  if ((business.checkpointLagMinutes ?? 0) > 20) signals.push("Stale checkpoint");
  if (business.todayAccountRows === 0 || business.todayAdsetRows === 0) signals.push("Current day missing");
  if (business.stateRowCount === 0 && (business.queueDepth > 0 || business.leasedPartitions > 0 || business.deadLetterPartitions > 0)) {
    signals.push("State missing");
  }
  return signals;
}

function formatIssueType(issue: SyncIssueRow) {
  if (issue.provider !== "meta") return issue.reportType;
  if (issue.reportType === "queue_waiting_worker") return "queue waiting worker";
  if (issue.reportType === "stale_lease") return "stale lease";
  if (issue.reportType === "queue_dead_letter") return "dead letter present";
  if (issue.reportType === "state_missing") return "state missing";
  if (issue.reportType === "current_day_missing") return "current day missing";
  if (issue.reportType === "retryable_failed_backlog") return "retryable failed backlog";
  if (issue.reportType === "stale_checkpoint") return "stale checkpoint";
  return issue.reportType;
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
    metaQueueDepth: 0,
    metaLeasedPartitions: 0,
    metaDeadLetterPartitions: 0,
    metaOldestQueuedPartition: null,
    workerOnline: false,
    workerInstances: 0,
    workerLastHeartbeatAt: null,
  };
  const issues = payload?.issues ?? [];
  const googleAdsBusinesses = payload?.googleAdsBusinesses ?? [];
  const metaBusinesses = payload?.metaBusinesses ?? [];

  async function runProviderAction(
    businessId: string,
    provider: "google_ads" | "meta",
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
          provider,
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
        <MetricCard label="Meta Queue" value={summary.metaQueueDepth ?? 0} help="Meta partition queue depth across all businesses." />
        <MetricCard label="Meta Leased" value={summary.metaLeasedPartitions ?? 0} help="Meta partitions currently leased or running." />
        <MetricCard label="Meta Dead" value={summary.metaDeadLetterPartitions ?? 0} help="Meta dead-letter partitions that require intervention." />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Worker runtime</p>
            <p className="mt-1 text-sm text-gray-500">
              Durable worker heartbeat and queue ownership visibility for Meta and Google Ads.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                summary.workerOnline
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {summary.workerOnline ? "Worker online" : "Worker offline"}
            </span>
            <MetricPill label="Instances" value={summary.workerInstances ?? 0} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <p className="text-xs text-gray-500">
            Last heartbeat <span className="font-medium text-gray-700">{formatDateTime(summary.workerLastHeartbeatAt ?? null)}</span>
          </p>
          <p className="text-xs text-gray-500">
            Online workers <span className="font-medium text-gray-700">{payload?.workerHealth?.onlineWorkers ?? 0}</span>
          </p>
        </div>
        {payload?.workerHealth?.workers?.length ? (
          <div className="mt-4 space-y-2">
            {payload.workerHealth.workers.slice(0, 4).map((worker) => (
              <div
                key={worker.workerId}
                className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <span className="font-medium text-gray-800">{worker.workerId}</span>
                  <span className="ml-2">{worker.providerScope}</span>
                  <span className="ml-2">{worker.status}</span>
                </div>
                <div className="text-gray-500">
                  Heartbeat {formatDateTime(worker.lastHeartbeatAt)} • Business {worker.lastBusinessId ?? "—"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900">Özet</p>
        <div className="mt-3 space-y-3 text-sm text-gray-500">
          <p>
            {summary.successJobs24h} başarılı job son 24 saatte tamamlandı. En yaygın problem:{" "}
            <span className="font-medium text-gray-700">{summary.topIssue ?? "Sorun yok"}</span>
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <p>
              Google Ads kuyruk sağlığı:
              <span className="ml-1 font-medium text-gray-700">
                en eski queued {formatDateTime(summary.googleAdsOldestQueuedPartition ?? null)}
              </span>
            </p>
            <p>
              Meta kuyruk sağlığı:
              <span className="ml-1 font-medium text-gray-700">
                en eski queued {formatDateTime(summary.metaOldestQueuedPartition ?? null)}
              </span>
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-3">
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
                        Checkpoint {business.latestCheckpointPhase ?? "—"} • Last page {business.lastSuccessfulPageIndex ?? "—"} • Resume {business.resumeCapable ? "yes" : "no"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Oldest queued {formatDateTime(business.oldestQueuedPartition)} • Latest activity {formatDateTime(business.latestPartitionActivityAt)} • Checkpoint {formatDateTime(business.latestCheckpointUpdatedAt ?? null)}
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
                        onClick={() => runProviderAction(business.businessId, "google_ads", "cleanup")}
                      />
                      <ActionButton
                        label="Replay Dead Letter"
                        busy={isBusy && actionState.action === "replay_dead_letter"}
                        onClick={() => runProviderAction(business.businessId, "google_ads", "replay_dead_letter")}
                      />
                      <ActionButton
                        label="Reschedule"
                        busy={isBusy && actionState.action === "reschedule"}
                        onClick={() => runProviderAction(business.businessId, "google_ads", "reschedule")}
                      />
                      <ActionButton
                        label="Refresh State"
                        busy={isBusy && actionState.action === "refresh_state"}
                        onClick={() => runProviderAction(business.businessId, "google_ads", "refresh_state")}
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
          <h2 className="text-sm font-semibold text-gray-900">Meta queue recovery</h2>
          <p className="mt-1 text-sm text-gray-500">
            Use these controls instead of manual SQL when a Meta queue is stuck.
          </p>
        </div>
        {metaBusinesses.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400">Meta queue verisi yok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {metaBusinesses.map((business) => {
              const isBusy = actionState.businessId === business.businessId;
              return (
                <div key={business.businessId} className="px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{business.businessName}</p>
                      {getMetaBusinessSignals(business).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {getMetaBusinessSignals(business).map((signal) => (
                            <span
                              key={signal}
                              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                            >
                              {signal}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <MetricPill label="Queue" value={business.queueDepth} />
                        <MetricPill label="Leased" value={business.leasedPartitions} />
                        <MetricPill label="Retryable failed" value={business.retryableFailedPartitions} />
                        <MetricPill label="Dead letter" value={business.deadLetterPartitions} />
                        <MetricPill label="Stale lease" value={business.staleLeasePartitions} />
                        <MetricPill label="State rows" value={business.stateRowCount} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <MetricPill label="Today account" value={business.todayAccountRows} />
                        <MetricPill label="Today adset" value={business.todayAdsetRows} />
                      </div>
                      <p className="mt-3 text-xs text-gray-500">
                        Current day reference {business.currentDayReference ?? "—"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <MetricPill label="Account days" value={business.accountCompletedDays} />
                        <MetricPill label="Adset days" value={business.adsetCompletedDays} />
                        <MetricPill label="Creative days" value={business.creativeCompletedDays} />
                      </div>
                      <p className="mt-3 text-xs text-gray-500">
                        Oldest queued {formatDateTime(business.oldestQueuedPartition)} • Latest activity {formatDateTime(business.latestPartitionActivityAt)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Checkpoint {business.latestCheckpointScope ?? "—"} / {business.latestCheckpointPhase ?? "—"} • Last page {business.lastSuccessfulPageIndex ?? "—"} • Updated {formatDateTime(business.latestCheckpointUpdatedAt ?? null)}
                      </p>
                      {actionState.businessId === business.businessId && actionState.message ? (
                        <p className="mt-2 text-xs text-emerald-700">{actionState.message}</p>
                      ) : null}
                      {actionState.businessId === business.businessId && actionState.error ? (
                        <p className="mt-2 text-xs text-red-700">{actionState.error}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton label="Cleanup" busy={isBusy && actionState.action === "cleanup"} onClick={() => runProviderAction(business.businessId, "meta", "cleanup")} />
                      <ActionButton label="Replay Dead Letter" busy={isBusy && actionState.action === "replay_dead_letter"} onClick={() => runProviderAction(business.businessId, "meta", "replay_dead_letter")} />
                      <ActionButton label="Reschedule" busy={isBusy && actionState.action === "reschedule"} onClick={() => runProviderAction(business.businessId, "meta", "reschedule")} />
                      <ActionButton label="Refresh State" busy={isBusy && actionState.action === "refresh_state"} onClick={() => runProviderAction(business.businessId, "meta", "refresh_state")} />
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
                      {providerLabel(issue.provider)} • {formatIssueType(issue)} • {issue.status}
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

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
      {label} {value}
    </span>
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
