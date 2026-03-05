"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";

export function BusinessGuard({ children }: { children: React.ReactNode }) {
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!selectedBusinessId && pathname !== "/select-business") {
      router.replace("/select-business");
    }
  }, [selectedBusinessId, pathname, router]);

  if (!selectedBusinessId && pathname !== "/select-business") {
    return null;
  }

  return <>{children}</>;
}
