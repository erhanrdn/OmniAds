import { resolveShopifyAdminCredentials } from "@/lib/shopify/admin";
import { syncShopifyOrdersWindow } from "@/lib/shopify/commerce-sync";
import { getShopifySyncState, upsertShopifySyncState } from "@/lib/shopify/sync-state";
import type { RunnerLeaseGuard } from "@/lib/sync/worker-runtime";

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getTodayIsoForTimeZoneServer(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function classifyShopifySyncWindow(credentials: Awaited<ReturnType<typeof resolveShopifyAdminCredentials>>) {
  const timeZone =
    typeof credentials?.metadata?.iana_timezone === "string"
      ? credentials.metadata.iana_timezone
      : "UTC";
  const today = getTodayIsoForTimeZoneServer(timeZone);
  const historyDays = envNumber("SHOPIFY_COMMERCE_SYNC_DAYS", 7);
  const end = new Date(`${today}T00:00:00Z`);
  const start = addDays(end, -(historyDays - 1));
  return {
    startDate: toIsoDate(start),
    endDate: today,
    today,
    timeZone,
  };
}

export async function syncShopifyCommerceReports(
  businessId: string,
  input?: {
    runtimeLeaseGuard?: RunnerLeaseGuard;
  }
) {
  const credentials = await resolveShopifyAdminCredentials(businessId).catch(() => null);
  if (!credentials) {
    return {
      success: false,
      reason: "not_connected" as const,
      orders: 0,
      orderLines: 0,
      refunds: 0,
      transactions: 0,
      pages: 0,
    };
  }

  const window = classifyShopifySyncWindow(credentials);
  const existingState = await getShopifySyncState({
    businessId,
    providerAccountId: credentials.shopId,
    syncTarget: "commerce_recent",
  }).catch(() => null);

  await upsertShopifySyncState({
    businessId,
    providerAccountId: credentials.shopId,
    syncTarget: "commerce_recent",
    historicalTargetStart: existingState?.historicalTargetStart ?? window.startDate,
    historicalTargetEnd: existingState?.historicalTargetEnd ?? window.endDate,
    latestSyncStartedAt: new Date().toISOString(),
    latestSyncStatus: "running",
    latestSyncWindowStart: window.startDate,
    latestSyncWindowEnd: window.endDate,
    lastError: null,
  });

  if (input?.runtimeLeaseGuard?.isLeaseLost()) {
    await upsertShopifySyncState({
      businessId,
      providerAccountId: credentials.shopId,
      syncTarget: "commerce_recent",
      latestSyncStatus: "cancelled",
      latestSyncWindowStart: window.startDate,
      latestSyncWindowEnd: window.endDate,
      lastError: input.runtimeLeaseGuard.getLeaseLossReason(),
    });
    return {
      success: false,
      reason: "lease_lost" as const,
      orders: 0,
      orderLines: 0,
      refunds: 0,
      transactions: 0,
      pages: 0,
    };
  }

  try {
    const result = await syncShopifyOrdersWindow({
      businessId,
      startDate: window.startDate,
      endDate: window.endDate,
    });
    if (!result.success) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_recent",
        latestSyncStatus: result.reason,
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: result.reason,
      });
      return result;
    }

    await upsertShopifySyncState({
      businessId,
      providerAccountId: credentials.shopId,
      syncTarget: "commerce_recent",
      historicalTargetStart: existingState?.historicalTargetStart ?? window.startDate,
      historicalTargetEnd: existingState?.historicalTargetEnd ?? window.endDate,
      readyThroughDate: window.endDate,
      latestSyncStartedAt: new Date().toISOString(),
      latestSuccessfulSyncAt: new Date().toISOString(),
      latestSyncStatus: "succeeded",
      latestSyncWindowStart: window.startDate,
      latestSyncWindowEnd: window.endDate,
      lastError: null,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertShopifySyncState({
      businessId,
      providerAccountId: credentials.shopId,
      syncTarget: "commerce_recent",
      latestSyncStatus: "failed",
      latestSyncWindowStart: window.startDate,
      latestSyncWindowEnd: window.endDate,
      lastError: message,
    });
    throw error;
  }
}
