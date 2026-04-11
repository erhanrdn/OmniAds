"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_LANGUAGE, syncLanguageCookie } from "@/lib/i18n";
import { sanitizeNextPath } from "@/lib/auth-routing";

function resolveDestination(nextPath: string | null) {
  const sanitized = sanitizeNextPath(nextPath);
  if (
    !sanitized ||
    sanitized === "/" ||
    sanitized.startsWith("/login") ||
    sanitized.startsWith("/signup") ||
    sanitized.startsWith("/select-language") ||
    sanitized.startsWith("/select-business")
  ) {
    return "/overview";
  }
  return sanitized;
}

export default function SelectLanguagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = useMemo(
    () => resolveDestination(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    syncLanguageCookie(DEFAULT_LANGUAGE);
    router.replace(destination);
    router.refresh();
  }, [destination, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        Applying language preference...
      </div>
    </div>
  );
}
