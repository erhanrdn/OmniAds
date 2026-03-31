import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { requireInternalOrAdminSyncAccess, businessExists } from "@/lib/internal-sync-auth";
import { logAdminAction } from "@/lib/admin-logger";
import {
  enqueueGoogleAdsScheduledWork,
} from "@/lib/sync/google-ads-sync";
import {
  enqueueMetaScheduledWork,
} from "@/lib/sync/meta-sync";
import * as metaWarehouse from "@/lib/meta/warehouse";
import * as googleAdsWarehouse from "@/lib/google-ads/warehouse";

/**
 * POST /api/sync/refresh
 *
 * Triggers a background sync refresh for a specific business and provider.
 * Restricted to admin sessions or internal signed requests.
 * Returns 202 only after durable enqueue succeeds.
 *
 * Body: { businessId: string, provider: "google_ads" | "meta" }
 */

const runtimeSyncRefreshStore = globalThis as typeof globalThis & {
  __syncRefreshInFlightKeys?: Set<string>;
};

function getInFlightRefreshKeys() {
  if (!runtimeSyncRefreshStore.__syncRefreshInFlightKeys) {
    runtimeSyncRefreshStore.__syncRefreshInFlightKeys = new Set<string>();
  }
  return runtimeSyncRefreshStore.__syncRefreshInFlightKeys;
}

function getRefreshKey(businessId: string, provider: string) {
  return `${businessId}:${provider}`;
}

const DURABLE_REFRESH_REPORT_TYPE = "scheduled_refresh";
const DURABLE_REFRESH_RANGE_KEY = "full";

async function isJobAlreadyRunning(
  businessId: string,
  provider: string,
): Promise<boolean> {
  try {
    await runMigrations();
    const sql = getDb();
    if (provider === "meta") {
      await metaWarehouse.expireStaleMetaSyncJobs({ businessId }).catch(() => null);
      const queueHealth = await metaWarehouse.getMetaQueueHealth({ businessId }).catch(() => null);
      if (!queueHealth) return false;
      return (queueHealth.queueDepth ?? 0) > 0 || (queueHealth.leasedPartitions ?? 0) > 0;
    }
    if (provider === "google_ads") {
      await googleAdsWarehouse.cleanupGoogleAdsObsoleteSyncJobs({ businessId }).catch(() => null);
      await googleAdsWarehouse.expireStaleGoogleAdsSyncJobs({ businessId }).catch(() => null);
      const queueHealth = await googleAdsWarehouse.getGoogleAdsQueueHealth({ businessId }).catch(() => null);
      if (!queueHealth) return false;
      return (queueHealth.queueDepth ?? 0) > 0 || (queueHealth.leasedPartitions ?? 0) > 0;
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

async function acquireDurableRefreshLock(input: {
  businessId: string;
  provider: string;
}): Promise<boolean> {
  try {
    await runMigrations();
    const sql = getDb();
    const rows = await sql`
      WITH active AS (
        SELECT id
        FROM provider_sync_jobs
        WHERE business_id = ${input.businessId}
          AND provider = ${input.provider}
          AND report_type = ${DURABLE_REFRESH_REPORT_TYPE}
          AND date_range_key = ${DURABLE_REFRESH_RANGE_KEY}
          AND status = 'running'
        LIMIT 1
      ),
      upserted AS (
        INSERT INTO provider_sync_jobs (
          business_id,
          provider,
          report_type,
          date_range_key,
          status,
          triggered_at,
          started_at,
          completed_at,
          error_message
        )
        VALUES (
          ${input.businessId},
          ${input.provider},
          ${DURABLE_REFRESH_REPORT_TYPE},
          ${DURABLE_REFRESH_RANGE_KEY},
          'running',
          now(),
          now(),
          NULL,
          NULL
        )
        ON CONFLICT (business_id, provider, report_type, date_range_key)
        DO UPDATE SET
          status = 'running',
          triggered_at = now(),
          started_at = now(),
          completed_at = NULL,
          error_message = NULL
        WHERE provider_sync_jobs.status <> 'running'
        RETURNING id
      )
      SELECT
        EXISTS(SELECT 1 FROM active) AS already_running,
        EXISTS(SELECT 1 FROM upserted) AS acquired
    ` as Array<{ already_running: boolean; acquired: boolean }>;

    if (rows[0]?.already_running) return false;
    return Boolean(rows[0]?.acquired);
  } catch {
    return true;
  }
}

async function releaseDurableRefreshLock(input: {
  businessId: string;
  provider: string;
  status: "done" | "failed";
  errorMessage?: string | null;
}) {
  try {
    await runMigrations();
    const sql = getDb();
    await sql`
      UPDATE provider_sync_jobs
      SET
        status = ${input.status},
        completed_at = now(),
        error_message = ${input.errorMessage ?? null}
      WHERE business_id = ${input.businessId}
        AND provider = ${input.provider}
        AND report_type = ${DURABLE_REFRESH_REPORT_TYPE}
        AND date_range_key = ${DURABLE_REFRESH_RANGE_KEY}
    `;
  } catch {
    // best effort lock release
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

function isBacklogOnlySyncResult(provider: string, result: unknown): boolean {
  if (!result || typeof result !== "object") return false;

  if (provider === "google_ads") {
    const value = result as {
      queuedCore?: number;
      queueDepth?: number;
      leasedPartitions?: number;
    };
    return (
      (value.queuedCore ?? 0) <= 0 &&
      (((value.queueDepth ?? 0) > 0) || ((value.leasedPartitions ?? 0) > 0))
    );
  }

  if (provider === "meta") {
    const value = result as {
      queuedCore?: number;
      queuedMaintenance?: number;
      queueDepth?: number;
      leasedPartitions?: number;
    };
    return (
      (value.queuedCore ?? 0) <= 0 &&
      (value.queuedMaintenance ?? 0) <= 0 &&
      (((value.queueDepth ?? 0) > 0) || ((value.leasedPartitions ?? 0) > 0))
    );
  }

  return false;
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
  const inFlightRefreshKeys = getInFlightRefreshKeys();
  const refreshKey = getRefreshKey(businessId, provider);
  const refreshAlreadyInFlight = inFlightRefreshKeys.has(refreshKey);
  if (alreadyRunning || metaConsumerRunning || refreshAlreadyInFlight) {
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: {
          provider,
          outcome: "already_running",
          duplicateReason: refreshAlreadyInFlight ? "in_process_refresh" : "existing_backlog",
        },
      });
    }
    return NextResponse.json({ ok: true, status: "already_running" }, { status: 202 });
  }

  const durableLockAcquired = await acquireDurableRefreshLock({ businessId, provider });
  if (!durableLockAcquired) {
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: {
          provider,
          outcome: "already_running",
          duplicateReason: "durable_refresh_lock",
        },
      });
    }
    return NextResponse.json({ ok: true, status: "already_running" }, { status: 202 });
  }

  let syncResult: Awaited<ReturnType<typeof runSyncForProvider>>;
  inFlightRefreshKeys.add(refreshKey);
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
    await releaseDurableRefreshLock({
      businessId,
      provider,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "internal_error", message: "Could not enqueue sync refresh." },
      { status: 500 }
    );
  } finally {
    inFlightRefreshKeys.delete(refreshKey);
  }

  if (isBacklogOnlySyncResult(provider, syncResult.result)) {
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: { provider, outcome: "already_running", result: syncResult.result },
      });
    }
    await releaseDurableRefreshLock({ businessId, provider, status: "done" });

    return NextResponse.json(
      { ok: true, status: "already_running", provider: syncResult.provider, result: syncResult.result },
      { status: 202 }
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
  await releaseDurableRefreshLock({ businessId, provider, status: "done" });

  return NextResponse.json(
    { ok: true, status: "started", provider: syncResult.provider, result: syncResult.result },
    { status: 202 }
  );
}
