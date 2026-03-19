"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  IntegrationProvider,
  useIntegrationsStore,
} from "@/store/integrations-store";
import {
  clearAllIntegrationTimers,
  clearIntegrationTimer,
  type IntegrationStatusRow,
  syncIntegrationStatuses,
} from "@/hooks/integration-connection-support";

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
    clearIntegrationTimer(timers.current, provider);
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
      const rows: IntegrationStatusRow[] = data.integrations ?? [];

      syncIntegrationStatuses({
        businessId,
        rows,
        clearTimer,
        ensureBusiness,
        setConnected,
        setError,
      });
    } catch {
      // silently ignore — store already has persisted state
    }
  }, [businessId, clearTimer, ensureBusiness, setConnected, setError]);

  // Clear all timers on unmount to avoid state updates after navigation.
  useEffect(() => {
    return () => {
      clearAllIntegrationTimers(timers.current);
      timers.current = {};
    };
  }, []);

  return { connect, cancel, retry, resetConnectionState, fetchStatuses };
}
