import {
  buildCurrentDayWarehouseSnapshot,
  pickEarliestDate,
  pickLatestTimestamp,
  type CurrentDayWarehouseSnapshotFields,
} from "@/lib/current-day-snapshot";
import { getHistoricalWindowStart } from "@/lib/google-ads/history";
import { getGoogleAdsDailyCoverage } from "@/lib/google-ads/warehouse";
import type { GoogleAdsWarehouseScope } from "@/lib/google-ads/warehouse-types";

export async function resolveGoogleAdsCurrentDaySnapshot(input: {
  businessId: string;
  providerAccountId?: string | null;
  requestedDate: string;
  scopes: GoogleAdsWarehouseScope[];
}): Promise<Required<CurrentDayWarehouseSnapshotFields>> {
  const historicalStart = getHistoricalWindowStart(input.requestedDate);
  const coverages = await Promise.all(
    input.scopes.map((scope) =>
      getGoogleAdsDailyCoverage({
        scope,
        businessId: input.businessId,
        providerAccountId: input.providerAccountId ?? null,
        startDate: historicalStart,
        endDate: input.requestedDate,
      }).catch(() => null),
    ),
  );

  const warehouseReadyThroughDate = pickEarliestDate(
    coverages.map((coverage) => coverage?.ready_through_date ?? null),
  );
  const lastWarehouseWriteAt = pickLatestTimestamp(
    coverages.map((coverage) => coverage?.latest_updated_at ?? null),
  );

  return buildCurrentDayWarehouseSnapshot({
    requestedEndDate: input.requestedDate,
    warehouseReadyThroughDate,
    lastWarehouseWriteAt,
  });
}
