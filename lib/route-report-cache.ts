import {
  getCachedReport,
  setCachedReport,
  getSnapshotAge,
} from "@/lib/reporting-cache";

const DEFAULT_ROUTE_CACHE_TTL_MINUTES = 15;
// Stale cache bu süreden daha yeni ise servis edilebilir (arka planda refresh tetiklenir)
const STALE_SERVE_MAX_MINUTES = 120;

/**
 * Arka planda bir provider'ın cache'ini yenileme isteği gönderir (fire-and-forget).
 * Sunucu tarafında çalışır, /api/sync/refresh endpoint'ini çağırır.
 */
function triggerBackgroundRefresh(businessId: string, provider: string): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return;
  fetch(`${appUrl}/api/sync/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessId, provider }),
  }).catch(() => {});
}

function hasPermissionDeniedMarker(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;

  const visited = new Set<unknown>();
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    for (const entry of Object.values(current as Record<string, unknown>)) {
      if (typeof entry === "string" && entry.toUpperCase().includes("PERMISSION_DENIED")) {
        return true;
      }
      stack.push(entry);
    }
  }

  return false;
}

function shouldBypassRouteCache(provider: string, payload: unknown) {
  if (provider !== "google_ads") return false;
  return hasPermissionDeniedMarker(payload);
}

export function getNormalizedSearchParamsKey(searchParams: URLSearchParams): string {
  const pairs = Array.from(searchParams.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });
  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export async function getCachedRouteReport<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  searchParams: URLSearchParams;
  maxAgeMinutes?: number;
}): Promise<TPayload | null> {
  const dateRangeKey = getNormalizedSearchParamsKey(input.searchParams);
  const freshMaxAge = input.maxAgeMinutes ?? DEFAULT_ROUTE_CACHE_TTL_MINUTES;

  try {
    // Önce taze cache'i dene
    const freshPayload = await getCachedReport<TPayload>({
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      dateRangeKey,
      maxAgeMinutes: freshMaxAge,
    });

    if (freshPayload !== null && !shouldBypassRouteCache(input.provider, freshPayload)) {
      return freshPayload;
    }

    // Taze değil ama stale penceresi içinde mi?
    const ageMinutes = await getSnapshotAge({
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      dateRangeKey,
    });

    if (ageMinutes < STALE_SERVE_MAX_MINUTES) {
      // Stale data var: arka planda refresh tetikle ve stale'i döndür
      const stalePayload = await getCachedReport<TPayload>({
        businessId: input.businessId,
        provider: input.provider,
        reportType: input.reportType,
        dateRangeKey,
        maxAgeMinutes: STALE_SERVE_MAX_MINUTES,
      });

      if (stalePayload !== null && !shouldBypassRouteCache(input.provider, stalePayload)) {
        console.log("[route-report-cache] stale_hit", {
          businessId: input.businessId,
          provider: input.provider,
          reportType: input.reportType,
          ageMinutes: Math.round(ageMinutes),
        });
        triggerBackgroundRefresh(input.businessId, input.provider);
        return stalePayload;
      }
    }

    return null;
  } catch (error) {
    console.warn("[route-report-cache] read_failed", {
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setCachedRouteReport<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  searchParams: URLSearchParams;
  payload: TPayload;
}): Promise<void> {
  if (shouldBypassRouteCache(input.provider, input.payload)) {
    return;
  }
  try {
    await setCachedReport({
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      dateRangeKey: getNormalizedSearchParamsKey(input.searchParams),
      payload: input.payload,
    });
  } catch (error) {
    console.warn("[route-report-cache] write_failed", {
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
