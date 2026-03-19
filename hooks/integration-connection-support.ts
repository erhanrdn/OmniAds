"use client";

import type { IntegrationProvider } from "@/store/integrations-store";

const INTEGRATION_ERROR_MESSAGE = "Connection failed on the server.";

export interface IntegrationStatusRow {
  provider: IntegrationProvider;
  status: string;
  id: string;
  connected_at?: string | null;
  updated_at?: string | null;
  provider_account_id?: string | null;
  provider_account_name?: string | null;
}

type IntegrationTimeoutMap = Partial<
  Record<IntegrationProvider, ReturnType<typeof setTimeout>>
>;

export function clearIntegrationTimer(
  timers: IntegrationTimeoutMap,
  provider: IntegrationProvider
) {
  const timer = timers[provider];
  if (timer !== undefined) {
    clearTimeout(timer);
    delete timers[provider];
  }
}

export function clearAllIntegrationTimers(timers: IntegrationTimeoutMap) {
  Object.values(timers).forEach((timer) => clearTimeout(timer));
}

export function syncIntegrationStatuses(params: {
  businessId: string;
  rows: IntegrationStatusRow[];
  clearTimer: (provider: IntegrationProvider) => void;
  ensureBusiness: (businessId: string) => void;
  setConnected: (
    businessId: string,
    provider: IntegrationProvider,
    integrationId?: string,
    metadata?: {
      connectedAt?: string;
      lastSyncAt?: string;
      providerAccountId?: string | null;
      providerAccountName?: string | null;
    }
  ) => void;
  setError: (
    businessId: string,
    provider: IntegrationProvider,
    errorMessage: string
  ) => void;
}) {
  const { businessId, rows, clearTimer, ensureBusiness, setConnected, setError } = params;

  ensureBusiness(businessId);

  for (const row of rows) {
    if (row.status === "connected") {
      clearTimer(row.provider);
      setConnected(businessId, row.provider, row.id, {
        connectedAt: row.connected_at ?? undefined,
        lastSyncAt: row.updated_at ?? undefined,
        providerAccountId: row.provider_account_id,
        providerAccountName: row.provider_account_name,
      });
      continue;
    }

    if (row.status === "error") {
      clearTimer(row.provider);
      setError(businessId, row.provider, INTEGRATION_ERROR_MESSAGE);
    }
  }
}
