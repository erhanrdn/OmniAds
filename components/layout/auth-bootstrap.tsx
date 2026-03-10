"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { usePathname } from "next/navigation";

interface MeResponse {
  authenticated: boolean;
  businesses?: Array<{
    id: string;
    name: string;
    timezone: string;
    currency: string;
  }>;
  activeBusinessId?: string | null;
}

export function AuthBootstrap() {
  const pathname = usePathname();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const setBusinessesFromServer = useAppStore((state) => state.setBusinessesFromServer);
  const clearWorkspaceState = useAppStore((state) => state.clearWorkspaceState);

  useEffect(() => {
    if (!hasHydrated) return;
    const isDashboardRoute = pathname.startsWith("/");
    if (!isDashboardRoute) return;

    const hasLocalWorkspace =
      businesses.length > 0 &&
      typeof selectedBusinessId === "string" &&
      businesses.some((business) => business.id === selectedBusinessId);

    const BOOTSTRAP_CACHE_KEY = "omniads_auth_bootstrap_at";
    const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
    const lastBootstrapAt = Number(sessionStorage.getItem(BOOTSTRAP_CACHE_KEY) ?? "0");
    if (hasLocalWorkspace && Number.isFinite(lastBootstrapAt) && Date.now() - lastBootstrapAt < BOOTSTRAP_TTL_MS) {
      return;
    }

    let mounted = true;
    const controller = new AbortController();
    async function load() {
      const res = await fetch("/api/auth/me", { cache: "no-store", signal: controller.signal });
      const payload = (await res.json().catch(() => null)) as MeResponse | null;
      if (!mounted) return;
      if (!res.ok || !payload?.authenticated) {
        clearWorkspaceState();
        return;
      }
      const businesses = (payload.businesses ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        timezone: item.timezone,
        currency: item.currency,
      }));
      setBusinessesFromServer(businesses, payload.activeBusinessId ?? null);
      sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, String(Date.now()));
    }
    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    businesses,
    clearWorkspaceState,
    hasHydrated,
    pathname,
    selectedBusinessId,
    setBusinessesFromServer,
  ]);

  return null;
}
