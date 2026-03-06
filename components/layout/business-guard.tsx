"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";

export function BusinessGuard({ children }: { children: React.ReactNode }) {
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const router = useRouter();
  const pathname = usePathname();
  const isBusinessSetupRoute =
    pathname === "/select-business" || pathname === "/businesses/new";
  const hasSelectedBusiness = businesses.some((business) => business.id === selectedBusinessId);

  useEffect(() => {
    if ((!selectedBusinessId || !hasSelectedBusiness) && !isBusinessSetupRoute) {
      router.replace(businesses.length > 0 ? "/select-business" : "/businesses/new");
    }
  }, [selectedBusinessId, pathname, router, businesses.length, isBusinessSetupRoute, hasSelectedBusiness]);

  if ((!selectedBusinessId || !hasSelectedBusiness) && !isBusinessSetupRoute) {
    return null;
  }

  return <>{children}</>;
}
