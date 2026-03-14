import {
  getCachedReport,
  setCachedReport,
} from "@/lib/reporting-cache";

const DEFAULT_ROUTE_CACHE_TTL_MINUTES = 15;

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
    return await getCachedReport<TPayload>({
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      dateRangeKey: getNormalizedSearchParamsKey(input.searchParams),
      maxAgeMinutes: input.maxAgeMinutes ?? DEFAULT_ROUTE_CACHE_TTL_MINUTES,
    });
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
