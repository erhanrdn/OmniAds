"use client";

import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { KlaviyoDashboard } from "@/components/klaviyo/KlaviyoDashboard";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { buildDefaultProviderDomains, deriveProviderViewState } from "@/store/integrations-support";
import { useBusinessIntegrationsBootstrap } from "@/hooks/use-business-integrations-bootstrap";
import { PlanGate } from "@/components/pricing/PlanGate";

export default function KlaviyoPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const domains = useIntegrationsStore((state) =>
    selectedBusinessId ? state.domainsByBusinessId[selectedBusinessId] : undefined
  );

  const businessId = selectedBusinessId ?? "";
  const { isBootstrapping, bootstrapStatus } = useBusinessIntegrationsBootstrap(
    selectedBusinessId ?? null
  );

  if (!selectedBusinessId) {
    return <BusinessEmptyState />;
  }

  const klaviyoView = deriveProviderViewState(
    "klaviyo",
    domains?.klaviyo ?? buildDefaultProviderDomains().klaviyo
  );
  const isConnected = klaviyoView.isConnected;
  const showBootstrapGuard =
    isBootstrapping ||
    klaviyoView.status === "loading_data" ||
    (bootstrapStatus !== "ready" && !klaviyoView.isConnected);

  if (showBootstrapGuard) {
    return (
      <div className="p-6">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="p-6">
        <IntegrationEmptyState
          providerLabel="Klaviyo"
          status={klaviyoView.status === "action_required" ? "error" : "disconnected"}
          title="Connect Klaviyo to unlock lifecycle intelligence"
          description="Link Klaviyo to monitor flow revenue, benchmark engagement quality, compare campaign periods, and surface retention recommendations."
        />
      </div>
    );
  }

  return (
    <PlanGate requiredPlan="pro">
      <div className="h-full overflow-auto p-6">
        <KlaviyoDashboard businessId={businessId} />
      </div>
    </PlanGate>
  );
}
