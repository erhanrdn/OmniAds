"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";

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
  const setBusinessesFromServer = useAppStore((state) => state.setBusinessesFromServer);
  const clearWorkspaceState = useAppStore((state) => state.clearWorkspaceState);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
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
    }
    load();
    return () => {
      mounted = false;
    };
  }, [clearWorkspaceState, setBusinessesFromServer]);

  return null;
}

