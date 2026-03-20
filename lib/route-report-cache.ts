import {
  getCachedReport,
  setCachedReport,
} from "@/lib/reporting-cache";

const DEFAULT_ROUTE_CACHE_TTL_MINUTES = 15;

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
  try {
    const payload = await getCachedReport<TPayload>({
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      dateRangeKey: getNormalizedSearchParamsKey(input.searchParams),
      maxAgeMinutes: input.maxAgeMinutes ?? DEFAULT_ROUTE_CACHE_TTL_MINUTES,
    });
    if (shouldBypassRouteCache(input.provider, payload)) {
      return null;
    }
    return payload;
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
