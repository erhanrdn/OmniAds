import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { requireInternalOrAdminSyncAccess, businessExists } from "@/lib/internal-sync-auth";
import { logAdminAction } from "@/lib/admin-logger";
import { runGoogleAdsRepairCycle, runMetaRepairCycle } from "@/lib/sync/provider-repair-engine";
import { syncShopifyCommerceReports } from "@/lib/sync/shopify-sync";
import * as metaWarehouse from "@/lib/meta/warehouse";
import * as googleAdsWarehouse from "@/lib/google-ads/warehouse";
import {
  consumeMetaQueuedWork,
  getMetaSelectedRangeTruthReadiness,
  syncMetaRepairRange,
  syncMetaToday,
} from "@/lib/sync/meta-sync";

/**
 * POST /api/sync/refresh
 *
 * Triggers a background sync refresh for a specific business and provider.
 * Restricted to admin sessions or internal signed requests.
 * Returns 202 only after durable enqueue succeeds.
 *
 * Body: { businessId: string, provider: "google_ads" | "meta" | "shopify" }
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
const DURABLE_REFRESH_LOCK_MINUTES = 5;

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

async function hasRepairableProviderIssues(
  businessId: string,
  provider: string,
): Promise<boolean> {
  try {
    if (provider === "meta") {
      const queueHealth = await metaWarehouse.getMetaQueueHealth({ businessId }).catch(() => null);
      return (
        (queueHealth?.deadLetterPartitions ?? 0) > 0 ||
        (queueHealth?.retryableFailedPartitions ?? 0) > 0
      );
    }
    if (provider === "google_ads") {
      const [queueHealth, checkpointHealth] = await Promise.all([
        googleAdsWarehouse.getGoogleAdsQueueHealth({ businessId }).catch(() => null),
        googleAdsWarehouse
          .getGoogleAdsCheckpointHealth({ businessId, providerAccountId: null })
          .catch(() => null),
      ]);
      return (
        (queueHealth?.deadLetterPartitions ?? 0) > 0 ||
        (checkpointHealth?.checkpointFailures ?? 0) > 0
      );
    }
    return false;
  } catch {
    return false;
  }
}

async function acquireDurableRefreshLock(input: {
  businessId: string;
  provider: string;
  ownerToken: string;
}): Promise<{ acquired: boolean; error: boolean }> {
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
          AND COALESCE(lock_expires_at, started_at + (${DURABLE_REFRESH_LOCK_MINUTES} || ' minutes')::interval) > now()
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
          lock_owner,
          lock_expires_at,
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
          ${input.ownerToken},
          now() + (${DURABLE_REFRESH_LOCK_MINUTES} || ' minutes')::interval,
          NULL,
          NULL
        )
        ON CONFLICT (business_id, provider, report_type, date_range_key)
        DO UPDATE SET
          status = 'running',
          triggered_at = now(),
          started_at = now(),
          lock_owner = ${input.ownerToken},
          lock_expires_at = now() + (${DURABLE_REFRESH_LOCK_MINUTES} || ' minutes')::interval,
          completed_at = NULL,
          error_message = NULL
        WHERE provider_sync_jobs.status <> 'running'
           OR COALESCE(provider_sync_jobs.lock_expires_at, provider_sync_jobs.started_at + (${DURABLE_REFRESH_LOCK_MINUTES} || ' minutes')::interval) <= now()
        RETURNING id
      )
      SELECT
        EXISTS(SELECT 1 FROM active) AS already_running,
        EXISTS(SELECT 1 FROM upserted) AS acquired
    ` as Array<{ already_running: boolean; acquired: boolean }>;

    if (rows[0]?.already_running) return { acquired: false, error: false };
    return { acquired: Boolean(rows[0]?.acquired), error: false };
  } catch {
    return { acquired: false, error: true };
  }
}

async function releaseDurableRefreshLock(input: {
  businessId: string;
  provider: string;
  ownerToken: string;
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
        lock_expires_at = now(),
        error_message = ${input.errorMessage ?? null}
      WHERE business_id = ${input.businessId}
        AND provider = ${input.provider}
        AND report_type = ${DURABLE_REFRESH_REPORT_TYPE}
        AND date_range_key = ${DURABLE_REFRESH_RANGE_KEY}
        AND lock_owner = ${input.ownerToken}
    `;
  } catch {
    // best effort lock release
  }
}

async function runSyncForProvider(
  businessId: string,
  provider: string,
  input?: {
    mode?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<{ provider: string; result: unknown }> {
  switch (provider) {
    case "google_ads":
      const googleResult = await runGoogleAdsRepairCycle(businessId);
      return {
        provider,
        result: {
          ...((googleResult.enqueueResult && typeof googleResult.enqueueResult === "object")
            ? googleResult.enqueueResult
            : {}),
          repair: googleResult.repair,
        },
      };
    case "meta":
      if (input?.mode === "today") {
        return {
          provider,
          result: await syncMetaToday(businessId),
        };
      }
      if (input?.startDate && input?.endDate) {
        return {
          provider,
          result: await syncMetaRepairRange({
            businessId,
            startDate: input.startDate,
            endDate: input.endDate,
            triggerSource: "manual_refresh",
          }),
        };
      }
      const metaResult = await runMetaRepairCycle(businessId);
      return {
        provider,
        result: {
          ...((metaResult.enqueueResult && typeof metaResult.enqueueResult === "object")
            ? metaResult.enqueueResult
            : {}),
          repair: metaResult.repair,
        },
      };
    case "shopify":
      return {
        provider,
        result: await syncShopifyCommerceReports(businessId),
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
      repair?: { replayed?: number; requeued?: number; reclaimed?: number; blocked?: boolean };
    };
    return (
      (value.queuedCore ?? 0) <= 0 &&
      (value.repair?.replayed ?? 0) <= 0 &&
      (value.repair?.requeued ?? 0) <= 0 &&
      (value.repair?.reclaimed ?? 0) <= 0 &&
      !value.repair?.blocked &&
      (((value.queueDepth ?? 0) > 0) || ((value.leasedPartitions ?? 0) > 0))
    );
  }

  if (provider === "meta") {
    const value = result as {
      queuedCore?: number;
      queuedMaintenance?: number;
      queueDepth?: number;
      leasedPartitions?: number;
      repair?: { replayed?: number; requeued?: number; reclaimed?: number; blocked?: boolean };
    };
    return (
      (value.queuedCore ?? 0) <= 0 &&
      (value.queuedMaintenance ?? 0) <= 0 &&
      (value.repair?.replayed ?? 0) <= 0 &&
      (value.repair?.requeued ?? 0) <= 0 &&
      (value.repair?.reclaimed ?? 0) <= 0 &&
      !value.repair?.blocked &&
      (((value.queueDepth ?? 0) > 0) || ((value.leasedPartitions ?? 0) > 0))
    );
  }

  return false;
}

function isAcceptedMetaHistoricalRefreshResult(result: unknown): result is {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
} {
  if (!result || typeof result !== "object") return false;
  const value = result as {
    attempted?: number;
    succeeded?: number;
    failed?: number;
    skipped?: boolean;
  };
  return (
    Number.isFinite(value.attempted) &&
    Number(value.attempted) > 0 &&
    typeof value.skipped === "boolean"
  );
}

async function getMetaRefreshCompletionStatus(input: {
  businessId: string;
  mode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  if (
    input.mode === "today" ||
    !input.startDate ||
    !input.endDate
  ) {
    return null;
  }
  const truthReadiness = await getMetaSelectedRangeTruthReadiness({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  }).catch(() => null);
  if (!truthReadiness) {
    return { status: "processing" as const, truthReadiness: null };
  }
  const historicalStatus =
    truthReadiness.verificationState ??
    truthReadiness.state ??
    "processing";
  return {
    status: truthReadiness.truthReady
      ? ("finalized_verified" as const)
      : historicalStatus === "failed"
        ? ("failed" as const)
        : historicalStatus === "repair_required"
          ? ("repair_required" as const)
          : ("processing" as const),
    truthReadiness,
  };
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

  const validProviders = ["google_ads", "meta", "shopify"];
  if (!validProviders.includes(provider)) {
    return NextResponse.json(
      { error: "unsupported_provider_for_refresh", supportedProviders: validProviders },
      { status: 400 },
    );
  }

  if (provider !== "meta" && (mode != null || startDate != null || endDate != null)) {
    return NextResponse.json(
      { error: "mode, startDate and endDate are only supported for Meta refreshes." },
      { status: 400 },
    );
  }
  if (provider === "meta") {
    const hasPartialRange =
      (startDate != null && endDate == null) || (startDate == null && endDate != null);
    if (hasPartialRange) {
      return NextResponse.json(
        { error: "startDate and endDate must be provided together for Meta refreshes." },
        { status: 400 },
      );
    }
    if (mode != null && !["today", "repair", "finalize_range"].includes(mode)) {
      return NextResponse.json(
        { error: "unsupported_meta_refresh_mode" },
        { status: 400 },
      );
    }
  }

  // Zaten çalışan bir job varsa tekrar başlatma
  const alreadyRunning = await isJobAlreadyRunning(businessId, provider);
  const hasRepairableIssues = await hasRepairableProviderIssues(businessId, provider);
  const explicitMetaRangeRefresh =
    provider === "meta" && startDate != null && endDate != null;
  const metaConsumerRunning =
    provider === "meta"
      ? await hasMetaQueueConsumerRunning(businessId).catch(() => false)
      : false;
  const inFlightRefreshKeys = getInFlightRefreshKeys();
  const refreshKey = getRefreshKey(businessId, provider);
  const refreshAlreadyInFlight = inFlightRefreshKeys.has(refreshKey);
  if (
    refreshAlreadyInFlight ||
    (!explicitMetaRangeRefresh &&
      (!hasRepairableIssues) &&
      (alreadyRunning || metaConsumerRunning))
  ) {
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

  const durableLockOwner = crypto.randomUUID();
  const durableLock = await acquireDurableRefreshLock({
    businessId,
    provider,
    ownerToken: durableLockOwner,
  });
  if (durableLock.error) {
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: {
          provider,
          outcome: "failed",
          error: "durable_refresh_lock_acquisition_failed",
        },
      });
    }
    return NextResponse.json(
      { error: "refresh_lock_unavailable", message: "Could not acquire durable refresh lock." },
      { status: 503 }
    );
  }
  if (!durableLock.acquired) {
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
    syncResult = await runSyncForProvider(businessId, provider, {
      mode: mode ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    });
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
      ownerToken: durableLockOwner,
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

  const explicitSingleDayMetaRefresh =
    provider === "meta" &&
    startDate != null &&
    endDate != null &&
    startDate === endDate;
  const acceptedMetaHistoricalRefresh =
    explicitMetaRangeRefresh &&
    isAcceptedMetaHistoricalRefreshResult(syncResult.result);
  if (explicitSingleDayMetaRefresh && !metaConsumerRunning) {
    await Promise.resolve(consumeMetaQueuedWork(businessId)).catch((error) => {
      console.warn("[sync-refresh] meta_inline_consume_failed", {
        businessId,
        provider,
        startDate,
        endDate,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (isBacklogOnlySyncResult(provider, syncResult.result)) {
    const metaCompletion =
      provider === "meta"
        ? await getMetaRefreshCompletionStatus({
            businessId,
            mode,
            startDate,
            endDate,
          })
        : null;
    if (access.kind === "admin") {
      await logAdminAction({
        adminId: access.session.user.id,
        action: "sync.refresh",
        targetType: "business",
        targetId: businessId,
        meta: {
          provider,
          outcome:
            acceptedMetaHistoricalRefresh
              ? metaCompletion?.status ?? "processing"
              : metaCompletion?.status ?? "already_running",
          result: syncResult.result,
        },
      });
    }
    await releaseDurableRefreshLock({
      businessId,
      provider,
      ownerToken: durableLockOwner,
      status: "done",
    });

    const payload: Record<string, unknown> = {
      ok: true,
      status:
        acceptedMetaHistoricalRefresh
          ? metaCompletion?.status ?? "processing"
          : metaCompletion?.status ?? "already_running",
      provider: syncResult.provider,
      result: syncResult.result,
    };
    if (metaCompletion) payload.truthReadiness = metaCompletion.truthReadiness;
    return NextResponse.json(payload, { status: 202 });
  }

  const metaCompletion =
    provider === "meta"
      ? await getMetaRefreshCompletionStatus({
          businessId,
          mode,
          startDate,
          endDate,
        })
      : null;

  if (access.kind === "admin") {
    await logAdminAction({
      adminId: access.session.user.id,
      action: "sync.refresh",
      targetType: "business",
      targetId: businessId,
      meta: {
        provider,
        outcome: metaCompletion?.status ?? "started",
        result: syncResult.result,
      },
    });
  }
  await releaseDurableRefreshLock({
    businessId,
    provider,
    ownerToken: durableLockOwner,
    status: "done",
  });

  const payload: Record<string, unknown> = {
    ok: true,
    status: metaCompletion?.status ?? "started",
    provider: syncResult.provider,
    result: syncResult.result,
  };
  if (metaCompletion) payload.truthReadiness = metaCompletion.truthReadiness;
  return NextResponse.json(payload, { status: 202 });
}
