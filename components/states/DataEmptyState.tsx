"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface DataEmptyStateProps {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function DataEmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: DataEmptyStateProps) {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {ctaLabel && ctaHref ? (
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => router.push(ctaHref)}
        >
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
