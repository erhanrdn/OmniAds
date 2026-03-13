import type { IntegrationProvider } from "@/store/integrations-store";
import type { ProviderAccountSnapshotMeta } from "@/lib/provider-account-snapshots";

interface ProviderAccountPayloadRow {
  id: string;
  name: string;
  assigned?: boolean;
}

interface ProviderAccountsPayload {
  data?: ProviderAccountPayloadRow[];
  message?: string;
  notice?: string;
  meta?: ProviderAccountSnapshotMeta;
}

export interface ProviderAccountSnapshot {
  accounts: Array<{ id: string; name: string }>;
  assignedAccountIds: string[];
  meta: ProviderAccountSnapshotMeta | null;
  notice: string | null;
}

export function supportsProviderAssignments(provider: IntegrationProvider) {
  return provider === "meta" || provider === "google";
}

export function getProviderAccountsFetchPath(
  provider: IntegrationProvider,
  businessId: string,
) {
  if (provider === "meta") {
    return `/integrations/meta/ad-accounts?businessId=${encodeURIComponent(businessId)}`;
  }
  if (provider === "google") {
    return `/api/google/accessible-accounts?businessId=${encodeURIComponent(businessId)}`;
  }
  return null;
}

export async function fetchProviderAccountSnapshot(
  provider: IntegrationProvider,
  businessId: string,
  options?: { refresh?: boolean },
): Promise<ProviderAccountSnapshot> {
  const path = getProviderAccountsFetchPath(provider, businessId);
  if (!path) {
    return { accounts: [], assignedAccountIds: [], meta: null, notice: null };
  }

  const url = options?.refresh ? `${path}&refresh=1` : path;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as ProviderAccountsPayload | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Could not load ${provider} account assignments.`);
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return {
    accounts: rows.map((row) => ({ id: row.id, name: row.name })),
    assignedAccountIds: rows.filter((row) => row.assigned === true).map((row) => row.id),
    meta: payload?.meta ?? null,
    notice: payload?.notice ?? null,
  };
}

export async function warmProviderAccountSnapshot(
  provider: IntegrationProvider,
  businessId: string,
) {
  return fetchProviderAccountSnapshot(provider, businessId, { refresh: true });
}
