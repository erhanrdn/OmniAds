import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { syncGoogleAdsReports } from "@/lib/sync/google-ads-sync";
import { syncGA4Reports } from "@/lib/sync/ga4-sync";
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
): Promise<boolean> {
  try {
    await runMigrations();
    const sql = getDb();
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

async function runSyncForProvider(businessId: string, provider: string): Promise<void> {
  switch (provider) {
    case "google_ads":
      await syncGoogleAdsReports(businessId);
      break;
    case "ga4":
      await syncGA4Reports(businessId);
      break;
    case "search_console":
      await syncSearchConsoleReports(businessId);
      break;
    default:
      console.warn("[sync-refresh] unknown_provider", { businessId, provider });
  }
}

export async function POST(request: NextRequest) {
  let body: { businessId?: string; provider?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { businessId, provider } = body;
  if (!businessId || !provider) {
    return NextResponse.json(
      { error: "businessId and provider are required." },
      { status: 400 },
    );
  }

  const validProviders = ["google_ads", "ga4", "search_console"];
  if (!validProviders.includes(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
      { status: 400 },
    );
  }

  // Zaten çalışan bir job varsa tekrar başlatma
  const alreadyRunning = await isJobAlreadyRunning(businessId, provider);
  if (alreadyRunning) {
    return NextResponse.json({ ok: true, status: "already_running" }, { status: 202 });
  }

  // Fire-and-forget: hemen 202 dön, arka planda sync başlat
  runSyncForProvider(businessId, provider).catch((err) => {
    console.error("[sync-refresh] background_sync_failed", {
      businessId,
      provider,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
