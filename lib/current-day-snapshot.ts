export interface CurrentDayWarehouseSnapshotFields {
  todayMode?: "warehouse_snapshot";
  requestedEndDate?: string | null;
  effectiveEndDate?: string | null;
  warehouseReadyThroughDate?: string | null;
  lastWarehouseWriteAt?: string | null;
  isStaleSnapshot?: boolean;
}

function readBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (typeof value !== "string") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isMetaTodayLiveReadsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return readBooleanFlag(env.META_TODAY_LIVE_READS_ENABLED, true);
}

export function isGoogleAdsTodayLiveReadsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return readBooleanFlag(env.GOOGLE_ADS_TODAY_LIVE_READS_ENABLED, true);
}

export function pickEarliestDate(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
}

export function pickLatestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export function buildCurrentDayWarehouseSnapshot(input: {
  requestedEndDate: string;
  warehouseReadyThroughDate?: string | null;
  lastWarehouseWriteAt?: string | null;
}): Required<CurrentDayWarehouseSnapshotFields> {
  const effectiveEndDate =
    input.warehouseReadyThroughDate == null
      ? null
      : input.warehouseReadyThroughDate.localeCompare(input.requestedEndDate) <= 0
        ? input.warehouseReadyThroughDate
        : input.requestedEndDate;
  return {
    todayMode: "warehouse_snapshot",
    requestedEndDate: input.requestedEndDate,
    effectiveEndDate,
    warehouseReadyThroughDate: input.warehouseReadyThroughDate ?? null,
    lastWarehouseWriteAt: input.lastWarehouseWriteAt ?? null,
    isStaleSnapshot:
      effectiveEndDate == null || effectiveEndDate.localeCompare(input.requestedEndDate) < 0,
  };
}

export function hasUsableCurrentDaySnapshot(
  snapshot: CurrentDayWarehouseSnapshotFields | null | undefined,
) {
  return Boolean(snapshot?.effectiveEndDate);
}
