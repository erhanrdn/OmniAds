"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";
import { applyAuthenticatedWorkspace, clearAuthScopedClientState } from "@/lib/client-auth-state";
import type { AppLanguage } from "@/lib/i18n";

interface MeResponse {
  authenticated: boolean;
  user?: {
    id: string;
    language?: AppLanguage;
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
  const authBootstrapStatus = useAppStore((state) => state.authBootstrapStatus);
  const setAuthBootstrapStatus = useAppStore((state) => state.setAuthBootstrapStatus);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
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
        const payload = (await res.json().catch((err: unknown) => {
          if (controller.signal.aborted) return null;
          if (err instanceof DOMException && err.name === "AbortError") return null;
          return null;
        })) as MeResponse | null;
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
        if (payload.user.language) {
          setLanguage(payload.user.language);
        }
        logClientAuthEvent("bootstrap_applied_workspace", {
          pathname,
          userId: payload.user.id,
          membershipCount: businesses.length,
          activeBusinessId: payload.activeBusinessId ?? null,
        });
      } catch (error: unknown) {
        if (!mounted || controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
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
    void load().catch(() => {});
    return () => {
      mounted = false;
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };
  }, [hasHydrated, pathname, setAuthBootstrapStatus, setLanguage]);

  return null;
}
