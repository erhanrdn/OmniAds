import {
  buildCurrentDayWarehouseSnapshot,
  pickEarliestDate,
  pickLatestTimestamp,
  type CurrentDayWarehouseSnapshotFields,
} from "@/lib/current-day-snapshot";
import {
  META_WAREHOUSE_HISTORY_DAYS,
  getHistoricalWindowStart,
} from "@/lib/meta/history";
import {
  getMetaAccountDailyCoverage,
  getMetaAdSetDailyCoverage,
  getMetaCampaignDailyCoverage,
} from "@/lib/meta/warehouse";

type MetaCurrentDaySnapshotScope = "summary" | "campaigns" | "adsets";

export async function resolveMetaCurrentDaySnapshot(input: {
  businessId: string;
  requestedDate: string;
  scope: MetaCurrentDaySnapshotScope;
}): Promise<Required<CurrentDayWarehouseSnapshotFields>> {
  const historicalStart = getHistoricalWindowStart(
    input.requestedDate,
    META_WAREHOUSE_HISTORY_DAYS,
  );
  const coverages = await Promise.all([
    input.scope === "summary"
      ? getMetaAccountDailyCoverage({
          businessId: input.businessId,
          providerAccountId: null,
          startDate: historicalStart,
          endDate: input.requestedDate,
        }).catch(() => null)
      : Promise.resolve(null),
    input.scope === "summary" || input.scope === "campaigns"
      ? getMetaCampaignDailyCoverage({
          businessId: input.businessId,
          providerAccountId: null,
          startDate: historicalStart,
          endDate: input.requestedDate,
        }).catch(() => null)
      : Promise.resolve(null),
    input.scope === "adsets"
      ? getMetaAdSetDailyCoverage({
          businessId: input.businessId,
          providerAccountId: null,
          startDate: historicalStart,
          endDate: input.requestedDate,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

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
