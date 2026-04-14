import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type GoogleRequestAuditProvider = "google" | "ga4" | "search_console";
export type GoogleRequestAuditSource =
  | "cron_sync"
  | "background_refresh"
  | "live_report"
  | "discovery"
  | "unknown";

export interface GoogleRequestAuditContext {
  provider: GoogleRequestAuditProvider;
  businessId: string;
  requestSource: GoogleRequestAuditSource;
  requestPath: string;
  requestType: string;
}

const googleRequestAuditStorage = new AsyncLocalStorage<GoogleRequestAuditContext>();

export function runWithGoogleRequestAuditContext<T>(
  context: GoogleRequestAuditContext,
  callback: () => Promise<T>,
): Promise<T> {
  return googleRequestAuditStorage.run(context, callback);
}

export function getGoogleRequestAuditContext(
  provider?: GoogleRequestAuditProvider,
): GoogleRequestAuditContext | null {
  const context = googleRequestAuditStorage.getStore() ?? null;
  if (!context) return null;
  if (provider && context.provider !== provider) return null;
  return context;
}

export function buildGoogleRequestSignature(input: unknown) {
  return createHash("sha1")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
}

export function classifyGoogleRequestAuditSource(
  value: string | null | undefined,
): GoogleRequestAuditSource {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "unknown";

  if (
    normalized.includes("discovery") ||
    normalized.includes("accessible-accounts") ||
    normalized.includes("accessible_accounts") ||
    normalized.includes("properties") ||
    normalized.includes("sites")
  ) {
    return "discovery";
  }

  if (
    normalized.includes("refresh") ||
    normalized.includes("repair") ||
    normalized.includes("manual_refresh")
  ) {
    return "background_refresh";
  }

  if (
    normalized.includes("sync") ||
    normalized.includes("warehouse") ||
    normalized.includes("backfill") ||
    normalized.includes("warm") ||
    normalized.includes("cache_warm") ||
    normalized.includes("cache-warm") ||
    normalized.includes("cron")
  ) {
    return "cron_sync";
  }

  if (
    normalized.includes("/api/") ||
    normalized.includes("route") ||
    normalized.includes("overview") ||
    normalized.includes("report") ||
    normalized.includes("sparklines")
  ) {
    return "live_report";
  }

  return "unknown";
}
