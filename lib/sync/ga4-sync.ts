/**
 * Proactive GA4 sync service.
 *
 * Warms up the GA4 session/user/event metrics for the last 30 days so the UI
 * never hits a cold API call. Results are stored in `provider_reporting_snapshots`
 * via the existing route-report-cache layer.
 */
import {
  resolveGa4AnalyticsContext,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import { setCachedRouteReport, getNormalizedSearchParamsKey } from "@/lib/route-report-cache";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

const REPORT_TYPE = "ga4_overview";
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
    await runMigrations();
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
  let context: Awaited<ReturnType<typeof resolveGa4AnalyticsContext>>;
  try {
    context = await resolveGa4AnalyticsContext(businessId, { requireProperty: true });
  } catch (err) {
    if (err instanceof GA4AuthError) {
      return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
    }
    throw err;
  }

  const propertyId = context.propertyId!;
  let succeeded = 0;
  let failed = 0;

  for (const window of DATE_WINDOWS) {
    const { startDate, endDate } = buildDateRange(window.days);
    const searchParams = new URLSearchParams({ businessId, startDate, endDate });
    const dateRangeKey = getNormalizedSearchParamsKey(searchParams);

    await upsertSyncJob(businessId, REPORT_TYPE, dateRangeKey, "running");
    try {
      const result = await runGA4Report({
        propertyId,
        accessToken: context.accessToken,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
          { name: "conversions" },
        ],
        limit: 100,
      });

      const payload = {
        propertyId,
        propertyName: context.propertyName,
        startDate,
        endDate,
        dimensionHeaders: result.dimensionHeaders,
        metricHeaders: result.metricHeaders,
        rows: result.rows,
        rowCount: result.rowCount,
        totals: result.totals,
      };

      await setCachedRouteReport({
        businessId,
        provider: "ga4",
        reportType: REPORT_TYPE,
        searchParams,
        payload,
      });
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
