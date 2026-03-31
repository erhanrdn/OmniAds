import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { expireStaleMetaSyncJobs } from "@/lib/meta/warehouse";
import { requireInternalOrAdminSyncAccess, businessExists } from "@/lib/internal-sync-auth";
import { logAdminAction } from "@/lib/admin-logger";
import {
  enqueueGoogleAdsScheduledWork,
} from "@/lib/sync/google-ads-sync";
import {
  cleanupGoogleAdsObsoleteSyncJobs,
  expireStaleGoogleAdsSyncJobs,
  getGoogleAdsQueueHealth,
} from "@/lib/google-ads/warehouse";
import {
  enqueueMetaScheduledWork,
} from "@/lib/sync/meta-sync";

/**
 * POST /api/sync/refresh
 *
 * Triggers a background sync refresh for a specific business and provider.
 * Restricted to admin sessions or internal signed requests.
 * Returns 202 only after durable enqueue succeeds.
 *
 * Body: { businessId: string, provider: "google_ads" | "meta" }
 */

async function isJobAlreadyRunning(
  businessId: string,
  provider: string,
): Promise<boolean> {
  try {
    await runMigrations();
    const sql = getDb();
    if (provider === "meta") {
      await expireStaleMetaSyncJobs({ businessId }).catch(() => null);
      return false;
    }
    if (provider === "google_ads") {
      await cleanupGoogleAdsObsoleteSyncJobs({ businessId }).catch(() => null);
      await expireStaleGoogleAdsSyncJobs({ businessId }).catch(() => null);
      const queueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
      if (!queueHealth) return false;
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

async function hasMetaQueueConsumerRunning(
  businessId: string,
): Promise<boolean> {
  try {
    await runMigrations();
    const sql = getDb();
    const rows = await sql`
      SELECT COUNT(*)::int AS leased_count
      FROM meta_sync_partitions
      WHERE business_id = ${businessId}
        AND status IN ('leased', 'running')
    ` as Array<{ leased_count: number }>;
    return Number(rows[0]?.leased_count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function runSyncForProvider(
  businessId: string,
  provider: string,
): Promise<{ provider: string; result: unknown }> {
  switch (provider) {
    case "google_ads":
      return {
        provider,
        result: await enqueueGoogleAdsScheduledWork(businessId),
      };
    case "meta":
      return {
        provider,
        result: await enqueueMetaScheduledWork(businessId),
      };
    default:
      throw new Error(`unsupported_provider_for_refresh:${provider}`);
  }
}

export async function POST(request: NextRequest) {
  const access = await requireInternalOrAdminSyncAccess(request);
  if (access.error) return access.error;

  let body: {
    businessId?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    mode?: string;
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

  if (!(await businessExists(businessId).catch(() => false))) {
    return NextResponse.json(
      { error: "Unknown businessId." },
      { status: 404 },
    );
  }

  const validProviders = ["google_ads", "meta"];
  if (!validProviders.includes(provider)) {
    return NextResponse.json(
      { error: "unsupported_provider_for_refresh", supportedProviders: validProviders },
      { status: 400 },
    );
  }

  if (mode != null || startDate != null || endDate != null) {
    return NextResponse.json(
      { error: "mode, startDate and endDate are no longer supported by this endpoint." },
      { status: 400 },
    );
  }

  // Zaten çalışan bir job varsa tekrar başlatma
  const alreadyRunning = await isJobAlreadyRunning(businessId, provider);
  const metaConsumerRunning =
    provider === "meta"
      ? await hasMetaQueueConsumerRunning(businessId).catch(() => false)
      : false;
  if (alreadyRunning || metaConsumerRunning) {
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: { provider, outcome: "already_running" },
      });
    }
    return NextResponse.json({ ok: true, status: "already_running" }, { status: 202 });
  }

  let syncResult: Awaited<ReturnType<typeof runSyncForProvider>>;
  try {
    syncResult = await runSyncForProvider(businessId, provider);
  } catch (err) {
    console.error("[sync-refresh] background_sync_failed", {
      businessId,
      provider,
      message: err instanceof Error ? err.message : String(err),
    });
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: {
          provider,
          outcome: "failed",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
    return NextResponse.json(
      { error: "internal_error", message: "Could not enqueue sync refresh." },
      { status: 500 }
    );
  }

  if (access.kind === "admin") {
    await logAdminAction({
      adminId: access.session.user.id,
      action: "sync.refresh",
      targetType: "business",
      targetId: businessId,
      meta: { provider, outcome: "started", result: syncResult.result },
    });
  }

  return NextResponse.json(
    { ok: true, status: "started", provider: syncResult.provider, result: syncResult.result },
    { status: 202 }
  );
}
