import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";

export type ProviderPlatformDateProvider = "meta" | "google";

export interface ProviderPlatformBoundary {
  provider: ProviderPlatformDateProvider;
  businessId: string;
  providerAccountId: string | null;
  timeZone: string;
  currentDate: string;
  previousDate: string;
  isPrimary: boolean;
}

function resolveDatePartsInTimeZone(timeZone: string, referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function getTodayIsoForTimeZoneServer(timeZone: string, referenceDate = new Date()) {
  return resolveDatePartsInTimeZone(timeZone, referenceDate);
}

export function addDaysToIsoDateUtc(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function getProviderPlatformDateBoundaries(input: {
  provider: ProviderPlatformDateProvider;
  businessId: string;
  providerAccountIds?: string[] | null;
  snapshot?: Awaited<ReturnType<typeof readProviderAccountSnapshot>> | null;
}) {
  const [assignment, snapshot] = await Promise.all([
    input.providerAccountIds
      ? Promise.resolve({ account_ids: input.providerAccountIds })
      : getProviderAccountAssignments(input.businessId, input.provider).catch(() => null),
    input.snapshot
      ? Promise.resolve(input.snapshot)
      : readProviderAccountSnapshot({
          businessId: input.businessId,
          provider: input.provider,
        }).catch(() => null),
  ]);

  const accountIds = assignment?.account_ids ?? [];
  if (accountIds.length === 0) {
    return [] satisfies ProviderPlatformBoundary[];
  }

  return accountIds.map((providerAccountId, index) => {
    const timeZone =
      snapshot?.accounts.find((account) => account.id === providerAccountId)?.timezone ?? "UTC";
    const currentDate = getTodayIsoForTimeZoneServer(timeZone);
    return {
      provider: input.provider,
      businessId: input.businessId,
      providerAccountId,
      timeZone,
      currentDate,
      previousDate: addDaysToIsoDateUtc(currentDate, -1),
      isPrimary: index === 0,
    } satisfies ProviderPlatformBoundary;
  });
}

export async function getProviderPlatformCurrentDate(input: {
  provider: ProviderPlatformDateProvider;
  businessId: string;
  providerAccountId?: string | null;
  providerAccountIds?: string[] | null;
  snapshot?: Awaited<ReturnType<typeof readProviderAccountSnapshot>> | null;
}) {
  const boundaries = await getProviderPlatformDateBoundaries({
    provider: input.provider,
    businessId: input.businessId,
    providerAccountIds: input.providerAccountIds ?? undefined,
    snapshot: input.snapshot,
  });
  const match =
    boundaries.find((boundary) => boundary.providerAccountId === (input.providerAccountId ?? null)) ??
    boundaries[0] ??
    null;
  return match?.currentDate ?? new Date().toISOString().slice(0, 10);
}

export async function getProviderPlatformPreviousDate(input: {
  provider: ProviderPlatformDateProvider;
  businessId: string;
  providerAccountId?: string | null;
  providerAccountIds?: string[] | null;
  snapshot?: Awaited<ReturnType<typeof readProviderAccountSnapshot>> | null;
}) {
  const boundaries = await getProviderPlatformDateBoundaries({
    provider: input.provider,
    businessId: input.businessId,
    providerAccountIds: input.providerAccountIds ?? undefined,
    snapshot: input.snapshot,
  });
  const match =
    boundaries.find((boundary) => boundary.providerAccountId === (input.providerAccountId ?? null)) ??
    boundaries[0] ??
    null;
  return match?.previousDate ?? addDaysToIsoDateUtc(new Date().toISOString().slice(0, 10), -1);
}
