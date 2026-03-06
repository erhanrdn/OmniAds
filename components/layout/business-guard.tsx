"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";

export function BusinessGuard({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const router = useRouter();
  const pathname = usePathname();
  const isBusinessSetupRoute =
    pathname === "/select-business" || pathname === "/businesses/new";
  const hasSelectedBusiness = businesses.some((business) => business.id === selectedBusinessId);
  const hasBusinesses = businesses.length > 0;
  const shouldGoToCreate = hasHydrated && !hasBusinesses && pathname !== "/businesses/new";
  const shouldGoToSelect =
    hasHydrated &&
    hasBusinesses &&
    !hasSelectedBusiness &&
    pathname !== "/select-business" &&
    pathname !== "/businesses/new";

  useEffect(() => {
    if (!hasHydrated) return;
    if (shouldGoToCreate) {
      router.replace("/businesses/new");
      return;
    }
    if (shouldGoToSelect) {
      router.replace("/select-business");
    }
  }, [hasHydrated, router, shouldGoToCreate, shouldGoToSelect]);

  if (!hasHydrated) {
    return null;
  }

  if ((shouldGoToCreate || shouldGoToSelect) && !isBusinessSetupRoute) {
    return null;
  }

  return <>{children}</>;
}
