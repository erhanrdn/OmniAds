import {
  getCachedReport,
  getSnapshotAge,
} from "@/lib/reporting-cache";

const DEFAULT_ROUTE_CACHE_TTL_MINUTES = 15;
// Stale cache bu süreden daha yeni ise servis edilebilir (arka planda refresh tetiklenir)
const STALE_SERVE_MAX_MINUTES = 120;

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

export function shouldBypassRouteCachePayload(provider: string, payload: unknown) {
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

    if (freshPayload !== null && !shouldBypassRouteCachePayload(input.provider, freshPayload)) {
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
      // Stale data var: stale snapshot'ı döndür. Refresh worker/cron üzerinden ilerler.
      const stalePayload = await getCachedReport<TPayload>({
        businessId: input.businessId,
        provider: input.provider,
        reportType: input.reportType,
        dateRangeKey,
        maxAgeMinutes: STALE_SERVE_MAX_MINUTES,
      });

      if (stalePayload !== null && !shouldBypassRouteCachePayload(input.provider, stalePayload)) {
        console.log("[route-report-cache] stale_hit", {
          businessId: input.businessId,
          provider: input.provider,
          reportType: input.reportType,
          ageMinutes: Math.round(ageMinutes),
        });
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
