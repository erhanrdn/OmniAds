import { type IntegrationProvider } from "@/store/integrations-store";

export interface ProviderAccountRow {
  id: string;
  name: string;
  currency?: string;
  timezone?: string;
  isManager?: boolean;
  assigned?: boolean;
}

interface ProviderErrorBody {
  error?: string;
  message?: string;
}

interface SaveSuccessBody {
  success?: boolean;
  assigned_accounts?: string[];
}

export function getProviderAssignmentTitle(provider: IntegrationProvider | null) {
  if (!provider) return "Assign accounts";
  if (provider === "meta") {
    return "Assign Meta ad accounts to this business";
  }
  if (provider === "google") {
    return "Assign Google Ads customer accounts to this business";
  }
  if (provider === "ga4") return "Assign GA4 properties to this business";
  if (provider === "shopify") return "Assign Shopify stores to this business";
  return `Assign ${provider} accounts to this business`;
}

export function getProviderFetchPath(provider: IntegrationProvider, businessId: string) {
  if (provider === "meta") {
    return `/integrations/meta/ad-accounts?businessId=${encodeURIComponent(businessId)}`;
  }
  if (provider === "google") {
    return `/api/google/accessible-accounts?businessId=${encodeURIComponent(businessId)}`;
  }
  return null;
}

export function getProviderSavePath(provider: IntegrationProvider, businessId: string) {
  if (provider === "meta") {
    return `/businesses/${encodeURIComponent(businessId)}/meta/assign-accounts`;
  }
  return `/businesses/${encodeURIComponent(businessId)}/${provider}/assign-accounts`;
}

function hasErrorMessage(payload: unknown): payload is ProviderErrorBody {
  if (!payload || typeof payload !== "object") return false;
  return "message" in payload && typeof payload.message === "string";
}

function hasAssignedAccounts(payload: unknown): payload is SaveSuccessBody {
  if (!payload || typeof payload !== "object") return false;
  if (!("assigned_accounts" in payload)) return false;
  const maybeIds = payload.assigned_accounts;
  return Array.isArray(maybeIds) && maybeIds.every((id) => typeof id === "string");
}

export async function saveProviderAssignments(params: {
  provider: IntegrationProvider;
  businessId: string;
  draftIds: string[];
}): Promise<{ assignedIds: string[]; error: string | null }> {
  try {
    const response = await fetch(getProviderSavePath(params.provider, params.businessId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ account_ids: params.draftIds }),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        assignedIds: params.draftIds,
        error:
          (hasErrorMessage(payload) ? payload.message : null) ??
          "Could not save account assignments.",
      };
    }

    return {
      assignedIds: hasAssignedAccounts(payload)
        ? (payload.assigned_accounts ?? params.draftIds)
        : params.draftIds,
      error: null,
    };
  } catch {
    return {
      assignedIds: params.draftIds,
      error: "Could not save account assignments.",
    };
  }
}
