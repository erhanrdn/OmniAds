"use client";

import { useEffect, useState } from "react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { KlaviyoDashboard } from "@/components/klaviyo/KlaviyoDashboard";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";

export default function KlaviyoPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const setConnected = useIntegrationsStore((state) => state.setConnected);
  const disconnect = useIntegrationsStore((state) => state.disconnect);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);

  const businessId = selectedBusinessId ?? "";

  useEffect(() => {
    if (!businessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setIsCheckingConnection(true);

    void fetch(
      `/api/integrations?businessId=${encodeURIComponent(businessId)}&provider=klaviyo`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        const integration = (payload as { integration?: Record<string, unknown> | null } | null)
          ?.integration;
        if (response.ok && integration && integration.status === "connected") {
          setConnected(
            businessId,
            "klaviyo",
            typeof integration.id === "string" ? integration.id : undefined,
            {
              connectedAt:
                typeof integration.connected_at === "string"
                  ? integration.connected_at
                  : undefined,
              lastSyncAt:
                typeof integration.updated_at === "string"
                  ? integration.updated_at
                  : undefined,
              providerAccountId:
                typeof integration.provider_account_id === "string"
                  ? integration.provider_account_id
                  : undefined,
              providerAccountName:
                typeof integration.provider_account_name === "string"
                  ? integration.provider_account_name
                  : undefined,
            },
          );
          return;
        }
        disconnect(businessId, "klaviyo");
      })
      .catch(() => {
        if (!cancelled) {
          disconnect(businessId, "klaviyo");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingConnection(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, disconnect, setConnected]);

  if (!selectedBusinessId) {
    return <BusinessEmptyState />;
  }

  const status = byBusinessId[businessId]?.klaviyo?.status;
  const isConnected = status === "connected";

  if (isCheckingConnection && !isConnected) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Checking Klaviyo connection...
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="p-6">
        <IntegrationEmptyState
          providerLabel="Klaviyo"
          title="Connect Klaviyo to unlock lifecycle intelligence"
          description="Link Klaviyo to monitor flow revenue, benchmark engagement quality, compare campaign periods, and surface retention recommendations."
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <KlaviyoDashboard businessId={businessId} />
    </div>
  );
}
