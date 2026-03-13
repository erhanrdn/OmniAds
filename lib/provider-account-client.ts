import type { IntegrationProvider } from "@/store/integrations-store";

interface ProviderAccountPayloadRow {
  id: string;
  name: string;
  assigned?: boolean;
}

interface ProviderAccountsPayload {
  data?: ProviderAccountPayloadRow[];
  message?: string;
}

export interface ProviderAccountSnapshot {
  accounts: Array<{ id: string; name: string }>;
  assignedAccountIds: string[];
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
): Promise<ProviderAccountSnapshot> {
  const path = getProviderAccountsFetchPath(provider, businessId);
  if (!path) {
    return { accounts: [], assignedAccountIds: [] };
  }

  const response = await fetch(path, {
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
  };
}
