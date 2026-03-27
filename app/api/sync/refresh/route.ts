import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { expireStaleMetaSyncJobs, hasBlockingMetaSyncJob } from "@/lib/meta/warehouse";
import {
  syncGoogleAdsInitial,
  syncGoogleAdsRecent,
  syncGoogleAdsReports,
  syncGoogleAdsRepairRange,
  syncGoogleAdsToday,
} from "@/lib/sync/google-ads-sync";
import {
  cleanupGoogleAdsObsoleteSyncJobs,
  expireStaleGoogleAdsSyncJobs,
  getGoogleAdsQueueHealth,
} from "@/lib/google-ads/warehouse";
import { syncGA4Reports } from "@/lib/sync/ga4-sync";
import { syncMetaInitial, syncMetaRecent, syncMetaRepairRange, syncMetaToday } from "@/lib/sync/meta-sync";
import { syncSearchConsoleReports } from "@/lib/sync/search-console-sync";

/**
 * POST /api/sync/refresh
 *
 * Triggers a background cache refresh for a specific business and provider.
 * Used by the stale-while-revalidate pattern in route-report-cache.ts.
 * Returns 202 immediately and runs the sync asynchronously.
 *
 * Body: { businessId: string, provider: "google_ads" | "ga4" | "search_console" }
 */

async function isJobAlreadyRunning(
  businessId: string,
  provider: string,
  mode?: "recent" | "today" | "initial" | "repair",
): Promise<boolean> {
  try {
    await runMigrations();
    const sql = getDb();
    if (provider === "meta") {
      await expireStaleMetaSyncJobs({ businessId }).catch(() => null);
      const syncTypesByMode: Record<
        NonNullable<typeof mode>,
        string[]
      > = {
        repair: ["repair_window"],
        today: ["today_refresh"],
        recent: ["incremental_recent", "initial_backfill", "reconnect_backfill"],
        initial: ["initial_backfill", "reconnect_backfill"],
      };
      return hasBlockingMetaSyncJob({
        businessId,
        syncTypes: syncTypesByMode[mode ?? "recent"],
        excludeTriggerSources: ["request_runtime"],
        lookbackMinutes: 90,
      });
    }
    if (provider === "google_ads") {
      await cleanupGoogleAdsObsoleteSyncJobs({ businessId }).catch(() => null);
      await expireStaleGoogleAdsSyncJobs({ businessId }).catch(() => null);
      const queueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
      if (!queueHealth) return false;
      if (mode === "today") {
        return (queueHealth.maintenanceLeasedPartitions ?? 0) > 0;
      }
      if (mode === "recent") {
        return (
          (queueHealth.coreLeasedPartitions ?? 0) > 0 ||
          (queueHealth.maintenanceLeasedPartitions ?? 0) > 0
        );
      }
      if (mode === "initial" || mode === "repair") {
        return (queueHealth.coreLeasedPartitions ?? 0) > 0;
      }
      return (queueHealth.leasedPartitions ?? 0) > 0;
    }
    const rows = await sql`
      SELECT id FROM provider_sync_jobs
      WHERE business_id = ${businessId}
        AND provider    = ${provider}
        AND status      = 'running'
        AND started_at  > now() - interval '5 minutes'
      LIMIT 1
    ` as unknown as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function runSyncForProvider(
  businessId: string,
  provider: string,
  mode: "recent" | "today" | "initial" | "repair" = "recent",
  range?: { startDate: string; endDate: string }
): Promise<void> {
  switch (provider) {
    case "google_ads":
      if (mode === "today") await syncGoogleAdsToday(businessId);
      else if (mode === "initial") await syncGoogleAdsInitial(businessId);
      else if (mode === "repair" && range) {
        await syncGoogleAdsRepairRange({
          businessId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
      }
      else if (mode === "recent") await syncGoogleAdsReports(businessId);
      else await syncGoogleAdsRecent(businessId);
      break;
    case "ga4":
      await syncGA4Reports(businessId);
      break;
    case "meta":
      if (mode === "today") await syncMetaToday(businessId);
      else if (mode === "initial") await syncMetaInitial(businessId);
      else if (mode === "repair" && range) {
        await syncMetaRepairRange({
          businessId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
      }
      else await syncMetaRecent(businessId);
      break;
    case "search_console":
      await syncSearchConsoleReports(businessId);
      break;
    default:
      console.warn("[sync-refresh] unknown_provider", { businessId, provider });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    businessId?: string;
    provider?: string;
    mode?: "recent" | "today" | "initial" | "repair";
    startDate?: string;
    endDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { businessId, provider, mode, startDate, endDate } = body;
  if (!businessId || !provider) {
    return NextResponse.json(
      { error: "businessId and provider are required." },
      { status: 400 },
    );
  }

  const validProviders = ["google_ads", "ga4", "meta", "search_console"];
  if (!validProviders.includes(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
      { status: 400 },
    );
  }

  if (provider === "meta" && mode === "repair" && (!startDate || !endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate are required for meta repair sync." },
      { status: 400 },
    );
  }

  // Zaten çalışan bir job varsa tekrar başlatma
  const alreadyRunning = await isJobAlreadyRunning(businessId, provider, mode);
  if (alreadyRunning) {
    return NextResponse.json({ ok: true, status: "already_running" }, { status: 202 });
  }

  // Fire-and-forget: hemen 202 dön, arka planda sync başlat
  runSyncForProvider(
    businessId,
    provider,
    mode ?? "recent",
    startDate && endDate ? { startDate, endDate } : undefined
  ).catch((err) => {
    console.error("[sync-refresh] background_sync_failed", {
      businessId,
      provider,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json(
    { ok: true, status: "started", mode: mode ?? "recent" },
    { status: 202 }
  );
}
