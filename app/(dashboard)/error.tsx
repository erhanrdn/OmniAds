"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error]", {
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">This page is temporarily unavailable</h2>
      <p className="text-sm text-muted-foreground">
        We could not load this section right now. Please try again.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/overview")}>
          Back to overview
        </Button>
      </div>
    </div>
  );
}
