/**
 * Proactive GA4 sync service.
 *
 * Warms user-facing GA4 dashboard/reporting caches through explicit writer lanes.
 * Shared read helpers stay read-only; route/report snapshots are persisted only
 * via `lib/reporting-cache-writer.ts`.
 */
import {
  resolveGa4AnalyticsContext,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import { getNormalizedSearchParamsKey } from "@/lib/route-report-cache";
import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import {
  warmGa4EcommerceFallbackCache,
  warmGa4UserFacingRouteReportCache,
} from "@/lib/user-facing-report-cache-owners";

const REPORT_TYPE = "ga4_overview";
const BEST_EFFORT_ROUTE_REPORT_TYPES = [
  "ga4_detailed_audience",
  "ga4_detailed_cohorts",
  "ga4_detailed_demographics",
  "ga4_landing_page_performance_v1",
  "ga4_detailed_landing_pages",
  "ga4_detailed_products",
] as const;
const DATE_WINDOWS = [
  { label: "30d", days: 30 },
  { label: "7d", days: 7 },
];

function buildDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function upsertSyncJob(
  businessId: string,
  reportType: string,
  dateRangeKey: string,
  status: "running" | "done" | "failed",
  errorMessage?: string,
): Promise<void> {
  try {
    const readiness = await getDbSchemaReadiness({
      tables: ["provider_sync_jobs"],
    });
    if (!readiness.ready) {
      return;
    }
    const sql = getDb();
    if (status === "running") {
      await sql`
        INSERT INTO provider_sync_jobs (business_id, provider, report_type, date_range_key, status, triggered_at, started_at)
        VALUES (${businessId}, 'ga4', ${reportType}, ${dateRangeKey}, 'running', now(), now())
        ON CONFLICT (business_id, provider, report_type, date_range_key) DO UPDATE SET
          status       = 'running',
          started_at   = now(),
          triggered_at = now(),
          error_message = NULL
      `;
    } else {
      await sql`
        UPDATE provider_sync_jobs SET
          status       = ${status},
          completed_at = now(),
          error_message = ${errorMessage ?? null}
        WHERE business_id    = ${businessId}
          AND provider       = 'ga4'
          AND report_type    = ${reportType}
          AND date_range_key = ${dateRangeKey}
      `;
    }
  } catch {
    // tracking hatası sync'i durdurmamalı
  }
}

export interface GA4SyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

export async function syncGA4Reports(businessId: string): Promise<GA4SyncResult> {
  // GA4 bağlantısını doğrula
  try {
    await resolveGa4AnalyticsContext(businessId, { requireProperty: true });
  } catch (err) {
    if (err instanceof GA4AuthError) {
      return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
    }
    throw err;
  }

  let succeeded = 0;
  let failed = 0;

  for (const window of DATE_WINDOWS) {
    const { startDate, endDate } = buildDateRange(window.days);
    const searchParams = new URLSearchParams({ businessId, startDate, endDate });
    const dateRangeKey = getNormalizedSearchParamsKey(searchParams);

    await upsertSyncJob(businessId, REPORT_TYPE, dateRangeKey, "running");
    try {
      await warmGa4UserFacingRouteReportCache({
        businessId,
        reportType: "ga4_analytics_overview",
        startDate,
        endDate,
      });
      await warmGa4EcommerceFallbackCache({
        businessId,
        startDate,
        endDate,
      });
      for (const reportType of BEST_EFFORT_ROUTE_REPORT_TYPES) {
        try {
          await warmGa4UserFacingRouteReportCache({
            businessId,
            reportType,
            startDate,
            endDate,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn("[ga4-sync] detail_cache_warm_failed", {
            businessId,
            reportType,
            startDate,
            endDate,
            message,
          });
        }
      }
      await upsertSyncJob(businessId, REPORT_TYPE, dateRangeKey, "done");
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await upsertSyncJob(businessId, REPORT_TYPE, dateRangeKey, "failed", msg);
      failed++;
      console.warn("[ga4-sync] task_failed", { businessId, window: window.label, message: msg });
      // quota hatası gelirse diğer window'ları da deneme
      if (err instanceof GA4AuthError && err.status === 429) break;
    }
  }

  console.log("[ga4-sync] completed", { businessId, attempted: DATE_WINDOWS.length, succeeded, failed });
  return { businessId, attempted: DATE_WINDOWS.length, succeeded, failed, skipped: false };
}
