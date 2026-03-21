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
  };
  issues: SyncIssueRow[];
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
  };
  const issues = payload?.issues ?? [];

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
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900">Özet</p>
        <p className="text-sm text-gray-500 mt-2">
          {summary.successJobs24h} başarılı job son 24 saatte tamamlandı. En yaygın problem:{" "}
          <span className="font-medium text-gray-700">{summary.topIssue ?? "Sorun yok"}</span>
        </p>
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
