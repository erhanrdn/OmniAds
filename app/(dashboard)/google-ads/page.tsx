"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { GoogleAdsIntelligenceDashboard } from "@/components/google-ads/GoogleAdsIntelligenceDashboard";

export default function GoogleAdsPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);

  const businessId = selectedBusinessId ?? "";

  useEffect(() => {
    if (businessId) ensureBusiness(businessId);
  }, [businessId, ensureBusiness]);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const googleStatus = byBusinessId[businessId]?.google?.status;
  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const isConnected = googleStatus === "connected" || isDemoBusiness;

  if (!isConnected) {
    return (
      <div className="p-6">
        <IntegrationEmptyState
          providerLabel="Google Ads"
          title="Connect Google Ads to unlock intelligence"
          description="Link your Google Ads account to see campaign performance, search intelligence, product return, Performance Max asset coverage, budget recommendations, and diagnostics."
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <GoogleAdsIntelligenceDashboard businessId={businessId} />
    </div>
  );
}
