"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LockedFeatureCardProps {
  providerLabel: string;
  description?: string;
}

export function LockedFeatureCard({ providerLabel, description }: LockedFeatureCardProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed bg-muted/20 px-5 py-4">
      <div className="flex items-center gap-3">
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {description ??
            `Connect ${providerLabel} to view creative performance and sharing tools.`}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => router.push("/integrations")}>
        Open Integrations
      </Button>
    </div>
  );
}
