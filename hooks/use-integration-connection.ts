"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  IntegrationProvider,
  useIntegrationsStore,
} from "@/store/integrations-store";

const TIMEOUT_MS = 15_000;

/**
 * Manages the connection state machine for all integration providers.
 * Handles 15-second timeout, cancel, retry, and backend status refresh.
 */
export function useIntegrationConnection(businessId: string) {
  const timers = useRef<Partial<Record<IntegrationProvider, ReturnType<typeof setTimeout>>>>({});

  const startConnecting = useIntegrationsStore((s) => s.startConnecting);
  const setTimedOut = useIntegrationsStore((s) => s.setTimedOut);
  const setError = useIntegrationsStore((s) => s.setError);
  const setConnected = useIntegrationsStore((s) => s.setConnected);
  const disconnect = useIntegrationsStore((s) => s.disconnect);
  const ensureBusiness = useIntegrationsStore((s) => s.ensureBusiness);

  const clearTimer = useCallback((provider: IntegrationProvider) => {
    const t = timers.current[provider];
    if (t !== undefined) {
      clearTimeout(t);
      delete timers.current[provider];
    }
  }, []);

  const startTimer = useCallback(
    (provider: IntegrationProvider) => {
      clearTimer(provider);
      timers.current[provider] = setTimeout(() => {
        delete timers.current[provider];
        setTimedOut(businessId, provider);
      }, TIMEOUT_MS);
    },
    [businessId, clearTimer, setTimedOut]
  );

  /** Begin connecting: set state to connecting and start timeout. */
  const connect = useCallback(
    (provider: IntegrationProvider) => {
      startConnecting(businessId, provider);
      startTimer(provider);
    },
    [businessId, startConnecting, startTimer]
  );

  /** Cancel an in-progress connection, resetting to disconnected. */
  const cancel = useCallback(
    (provider: IntegrationProvider) => {
      clearTimer(provider);
      disconnect(businessId, provider);
    },
    [businessId, clearTimer, disconnect]
  );

  /** Retry after timeout or error: restart the connecting flow. */
  const retry = useCallback(
    (provider: IntegrationProvider) => {
      connect(provider);
    },
    [connect]
  );

  /**
   * Reset a provider back to disconnected (e.g. after navigating away and back).
   * Also clears any pending timer.
   */
  const resetConnectionState = useCallback(
    (provider: IntegrationProvider) => {
      clearTimer(provider);
      disconnect(businessId, provider);
    },
    [businessId, clearTimer, disconnect]
  );

  /**
   * Fetch current integration statuses from the backend and sync the store.
   * Called on page mount so stale "connecting" state is corrected.
   */
  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/integrations?businessId=${encodeURIComponent(businessId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const rows: Array<{
        provider: IntegrationProvider;
        status: string;
        id: string;
        connected_at?: string | null;
        updated_at?: string | null;
        provider_account_id?: string | null;
        provider_account_name?: string | null;
      }> = data.integrations ?? [];

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
        } else if (row.status === "error") {
          clearTimer(row.provider);
          setError(businessId, row.provider, "Connection failed on the server.");
        }
      }
    } catch {
      // silently ignore — store already has persisted state
    }
  }, [businessId, clearTimer, ensureBusiness, setConnected, setError]);

  // Clear all timers on unmount to avoid state updates after navigation.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(timers.current).forEach((t) => clearTimeout(t));
      timers.current = {};
    };
  }, []);

  return { connect, cancel, retry, resetConnectionState, fetchStatuses };
}
