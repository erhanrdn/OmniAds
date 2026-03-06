"use client";

import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntegrationStatus } from "@/store/integrations-store";

interface IntegrationEmptyStateProps {
  providerLabel: string;
  status?: IntegrationStatus;
  title?: string;
  description?: string;
}

export function IntegrationEmptyState({
  providerLabel,
  status,
  title,
  description,
}: IntegrationEmptyStateProps) {
  const router = useRouter();

  const resolvedTitle =
    title ??
    (status === "error" || status === "timeout"
      ? `${providerLabel} connection failed`
      : `Connect ${providerLabel} to unlock campaign performance`);

  const resolvedDescription =
    description ??
    (status === "error" || status === "timeout"
      ? `Your ${providerLabel} connection encountered an issue. Go to Integrations to reconnect.`
      : `View campaigns, ad sets, ads, and creative insights once your ${providerLabel} account is connected.`);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Plug className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{resolvedTitle}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{resolvedDescription}</p>
      <Button className="mt-6" onClick={() => router.push("/integrations")}>
        Open Integrations
      </Button>
    </div>
  );
}
