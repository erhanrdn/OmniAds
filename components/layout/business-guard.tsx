"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";
import { useAppStore } from "@/store/app-store";

export function BusinessGuard({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const authBootstrapStatus = useAppStore((s) => s.authBootstrapStatus);
  const workspaceResolved = useAppStore((s) => s.workspaceResolved);
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const router = useRouter();
  const pathname = usePathname();
  const isBusinessSetupRoute =
    pathname === "/select-business" || pathname === "/businesses/new";
  const hasSelectedBusiness = businesses.some((business) => business.id === selectedBusinessId);
  const hasBusinesses = businesses.length > 0;
  const isReady = hasHydrated && authBootstrapStatus === "ready" && workspaceResolved;
  const shouldGoToCreate = isReady && !hasBusinesses && pathname !== "/businesses/new";
  const shouldGoToSelect =
    isReady &&
    hasBusinesses &&
    !hasSelectedBusiness &&
    pathname !== "/select-business" &&
    pathname !== "/businesses/new";

  useEffect(() => {
    if (!isReady) return;
    if (shouldGoToCreate) {
      logClientAuthEvent("business_guard_redirect", {
        pathname,
        reason: "no_businesses",
      });
      router.replace("/businesses/new");
      return;
    }
    if (shouldGoToSelect) {
      logClientAuthEvent("business_guard_redirect", {
        pathname,
        reason: "missing_active_business",
        businessCount: businesses.length,
      });
      router.replace("/select-business");
    }
  }, [businesses.length, isReady, pathname, router, shouldGoToCreate, shouldGoToSelect]);

  if (!hasHydrated || authBootstrapStatus !== "ready" || !workspaceResolved) {
    return null;
  }

  if ((shouldGoToCreate || shouldGoToSelect) && !isBusinessSetupRoute) {
    return null;
  }

  return <>{children}</>;
}
