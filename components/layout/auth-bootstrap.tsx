"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
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

  useEffect(() => {
    if (!hasHydrated) return;

    let mounted = true;
    const controller = new AbortController();
    async function load() {
      const res = await fetch("/api/auth/me", { cache: "no-store", signal: controller.signal });
      const payload = (await res.json().catch(() => null)) as MeResponse | null;
      if (!mounted) return;
      if (!res.ok || !payload?.authenticated || !payload.user?.id) {
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
    }
    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [hasHydrated]);

  return null;
}
