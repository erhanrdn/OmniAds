"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";
import { applyAuthenticatedWorkspace, clearAuthScopedClientState } from "@/lib/client-auth-state";

interface MeResponse {
  authenticated: boolean;
  user?: {
    id: string;
  };
  businesses?: Array<{
    id: string;
    name: string;
    timezone: string;
    currency: string;
    isDemoBusiness?: boolean;
    industry?: string;
    platform?: string;
  }>;
  activeBusinessId?: string | null;
}

export function AuthBootstrap() {
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const setAuthBootstrapStatus = useAppStore((state) => state.setAuthBootstrapStatus);
  const pathname = usePathname();

  useEffect(() => {
    if (!hasHydrated) return;

    let mounted = true;
    const controller = new AbortController();
    async function load() {
      setAuthBootstrapStatus("loading");
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
          headers: { "Cache-Control": "no-store" },
        });
        const payload = (await res.json().catch(() => null)) as MeResponse | null;
        if (!mounted) return;
        if (!res.ok || !payload?.authenticated || !payload.user?.id) {
          logClientAuthEvent("bootstrap_cleared_client_state", {
            pathname,
            reason: !res.ok ? "unauthenticated_response" : "invalid_payload",
          });
          clearAuthScopedClientState();
          return;
        }
        const businesses = (payload.businesses ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          timezone: item.timezone,
          currency: item.currency,
          isDemoBusiness: item.isDemoBusiness,
          industry: item.industry,
          platform: item.platform,
        }));
        applyAuthenticatedWorkspace({
          userId: payload.user.id,
          businesses,
          activeBusinessId: payload.activeBusinessId ?? null,
        });
        logClientAuthEvent("bootstrap_applied_workspace", {
          pathname,
          userId: payload.user.id,
          membershipCount: businesses.length,
          activeBusinessId: payload.activeBusinessId ?? null,
        });
      } catch (error: unknown) {
        if (!mounted || controller.signal.aborted) return;
        logClientAuthEvent("bootstrap_request_failed", {
          pathname,
          message: error instanceof Error ? error.message : "unknown_error",
        });
        clearAuthScopedClientState();
      } finally {
        if (mounted) {
          setAuthBootstrapStatus("ready");
        }
      }
    }
    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [hasHydrated, pathname, setAuthBootstrapStatus]);

  return null;
}
