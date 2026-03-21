/**
 * Proactive Google Ads sync service.
 *
 * Fetches the most-accessed reports (overview, campaigns) for a business and
 * stores them in `provider_reporting_snapshots` via the existing cache layer.
 * Uses the exact same reporting functions as the route handlers so the cached
 * payload is format-compatible with what the UI expects.
 */
import {
  getGoogleAdsOverviewReport,
  getGoogleAdsCampaignsReport,
} from "@/lib/google-ads/reporting";
import { setCachedRouteReport, getNormalizedSearchParamsKey } from "@/lib/route-report-cache";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

const DATE_RANGES = ["7", "30"] as const;
type SyncDateRange = (typeof DATE_RANGES)[number];

async function upsertSyncJob(
  businessId: string,
  provider: string,
  reportType: string,
  dateRangeKey: string,
  status: "running" | "done" | "failed",
  errorMessage?: string,
): Promise<void> {
  try {
    await runMigrations();
    const sql = getDb();
    if (status === "running") {
      await sql`
        INSERT INTO provider_sync_jobs (business_id, provider, report_type, date_range_key, status, triggered_at, started_at)
        VALUES (${businessId}, ${provider}, ${reportType}, ${dateRangeKey}, 'running', now(), now())
        ON CONFLICT (business_id, provider, report_type, date_range_key) DO UPDATE SET
          status      = 'running',
          started_at  = now(),
          triggered_at = now(),
          error_message = NULL
      `;
    } else {
      await sql`
        UPDATE provider_sync_jobs SET
          status        = ${status},
          completed_at  = now(),
          error_message = ${errorMessage ?? null}
        WHERE business_id    = ${businessId}
          AND provider       = ${provider}
          AND report_type    = ${reportType}
          AND date_range_key = ${dateRangeKey}
      `;
    }
  } catch {
    // sync job tracking hatası sync'i durdurmamalı
  }
}

async function isGoogleAdsConnected(businessId: string): Promise<boolean> {
  const integration = await getIntegration(businessId, "google").catch(() => null);
  if (!integration || integration.status !== "connected" || !integration.access_token) return false;
  const assignment = await getProviderAccountAssignments(businessId, "google").catch(() => null);
  return (assignment?.account_ids?.length ?? 0) > 0;
}

async function syncOverview(businessId: string, dateRange: SyncDateRange): Promise<void> {
  const searchParams = new URLSearchParams({ businessId, dateRange });
  const dateRangeKey = getNormalizedSearchParamsKey(searchParams);
  const reportType = "google_ads_overview";

  await upsertSyncJob(businessId, "google_ads", reportType, dateRangeKey, "running");
  try {
    const report = await getGoogleAdsOverviewReport({
      businessId,
      dateRange,
      source: "background_sync",
    });
    const payload = {
      kpis: report.kpis,
      kpiDeltas: report.kpiDeltas,
      topCampaigns: report.topCampaigns,
      insights: report.insights,
      summary: report.summary,
      meta: report.meta,
    };
    await setCachedRouteReport({
      businessId,
      provider: "google_ads",
      reportType,
      searchParams,
      payload,
    });
    await upsertSyncJob(businessId, "google_ads", reportType, dateRangeKey, "done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await upsertSyncJob(businessId, "google_ads", reportType, dateRangeKey, "failed", msg);
    throw err;
  }
}

async function syncCampaigns(businessId: string, dateRange: SyncDateRange): Promise<void> {
  const searchParams = new URLSearchParams({ businessId, dateRange });
  const dateRangeKey = getNormalizedSearchParamsKey(searchParams);
  const reportType = "google_ads_campaign_performance";

  await upsertSyncJob(businessId, "google_ads", reportType, dateRangeKey, "running");
  try {
    const report = await getGoogleAdsCampaignsReport({
      businessId,
      dateRange,
      source: "background_sync",
    });
    const payload = {
      data: report.rows,
      rows: report.rows,
      count: report.rows.length,
      summary: report.summary,
      meta: report.meta,
    };
    await setCachedRouteReport({
      businessId,
      provider: "google_ads",
      reportType,
      searchParams,
      payload,
    });
    await upsertSyncJob(businessId, "google_ads", reportType, dateRangeKey, "done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await upsertSyncJob(businessId, "google_ads", reportType, dateRangeKey, "failed", msg);
    throw err;
  }
}

export interface GoogleAdsSyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

export async function syncGoogleAdsReports(businessId: string): Promise<GoogleAdsSyncResult> {
  const connected = await isGoogleAdsConnected(businessId);
  if (!connected) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }

  let succeeded = 0;
  let failed = 0;
  const tasks: Array<() => Promise<void>> = [];

  for (const dateRange of DATE_RANGES) {
    tasks.push(() => syncOverview(businessId, dateRange));
    tasks.push(() => syncCampaigns(businessId, dateRange));
  }

  for (const task of tasks) {
    try {
      await task();
      succeeded++;
    } catch (err) {
      failed++;
      console.warn("[google-ads-sync] task_failed", {
        businessId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("[google-ads-sync] completed", { businessId, attempted: tasks.length, succeeded, failed });
  return { businessId, attempted: tasks.length, succeeded, failed, skipped: false };
}
