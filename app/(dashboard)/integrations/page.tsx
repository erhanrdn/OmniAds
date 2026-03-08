"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import {
  INTEGRATION_PROVIDERS,
  IntegrationProvider,
  useIntegrationsStore,
} from "@/store/integrations-store";
import { IntegrationsCard } from "@/components/integrations/integrations-card";
import { ConnectModal } from "@/components/integrations/connect-modal";
import { useIntegrationConnection } from "@/hooks/use-integration-connection";
import { ProviderAssignmentDrawer } from "@/components/integrations/provider-assignment-drawer";

/** Providers that have real backend OAuth (not mock) */
const REAL_PROVIDERS: IntegrationProvider[] = ["meta", "google"];

const DESCRIPTIONS: Record<IntegrationProvider, string> = {
  shopify: "Sync storefront events and conversion data for attribution.",
  meta: "Connect Ads Manager to import campaigns, ad sets, and spend.",
  google: "Link Google Ads to track performance and sync account data.",
  tiktok: "Pull campaign metrics from TikTok Ads into your dashboard.",
  pinterest: "Import Pinterest Ads performance and audience insights.",
  snapchat: "Connect Snapchat Ads for campaign and creative reporting.",
  ga4: "Connect Google Analytics 4 to enrich landing page and conversion insights.",
};

export default function IntegrationsPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId;
  const activeBusiness =
    businesses.find((item) => item.id === businessId) ?? null;

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const assignedAccountsByBusiness = useIntegrationsStore(
    (state) => state.assignedAccountsByBusiness,
  );
  const setConnected = useIntegrationsStore((state) => state.setConnected);
  const disconnect = useIntegrationsStore((state) => state.disconnect);
  const setAssignedAccounts = useIntegrationsStore(
    (state) => state.setAssignedAccounts,
  );
  const setProviderAccounts = useIntegrationsStore(
    (state) => state.setProviderAccounts,
  );
  const toast = useIntegrationsStore((state) => state.toast);
  const setToast = useIntegrationsStore((state) => state.setToast);
  const clearToast = useIntegrationsStore((state) => state.clearToast);

  const { connect, cancel, retry, fetchStatuses } = useIntegrationConnection(
    businessId ?? "",
  );

  const [activeProvider, setActiveProvider] =
    useState<IntegrationProvider | null>(null);
  const [assignmentProvider, setAssignmentProvider] =
    useState<IntegrationProvider | null>(null);

  /** Disconnect: calls backend API for real providers, then updates local store */
  const handleDisconnect = useCallback(
    async (provider: IntegrationProvider) => {
      if (!businessId) return;
      if (REAL_PROVIDERS.includes(provider)) {
        try {
          await fetch(
            `/api/integrations?businessId=${encodeURIComponent(businessId)}&provider=${provider}`,
            { method: "DELETE" },
          );
        } catch {
          // best effort — still disconnect locally
        }
      }
      disconnect(businessId, provider);
      if (assignmentProvider === provider) {
        setAssignmentProvider(null);
      }
    },
    [assignmentProvider, businessId, disconnect],
  );

  useEffect(() => {
    if (!businessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness]);

  // On mount: fetch real statuses from backend so stale "connecting" state is corrected.
  useEffect(() => {
    if (!businessId) return;
    fetchStatuses();
  }, [businessId, fetchStatuses]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => clearToast(), 3000);
    return () => clearTimeout(timeout);
  }, [toast, clearToast]);

  const integrations = useMemo(() => {
    if (!businessId) return null;
    return byBusinessId[businessId];
  }, [byBusinessId, businessId]);

  if (!businessId) return <BusinessEmptyState />;
  if (!integrations) return null;

  const handleConnect = (provider: IntegrationProvider) => {
    if (provider === "ga4") {
      setConnected(businessId, "ga4", "ga4-demo-property");
      setToast({
        type: "success",
        message: "GA4 OAuth flow will be handled by backend.",
      });
      return;
    }
    setActiveProvider(provider);
  };

  const handleRetry = (provider: IntegrationProvider) => {
    if (provider === "ga4") {
      setConnected(businessId, "ga4", "ga4-demo-property");
      setToast({
        type: "success",
        message: "GA4 OAuth flow will be handled by backend.",
      });
      return;
    }
    retry(provider);
    setActiveProvider(provider);
  };

  const assignedIdsForDrawer = assignmentProvider
    ? (assignedAccountsByBusiness[businessId]?.[assignmentProvider] ?? [])
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Manage OAuth connections and account assignments for the active
          business.
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          Active business:{" "}
          <span className="text-foreground">
            {activeBusiness?.name ?? "Unknown"}
          </span>
        </p>
      </div>

      {toast && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-700"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATION_PROVIDERS.map((provider) => {
          const assignedIds =
            assignedAccountsByBusiness[businessId]?.[provider] ?? [];

          return (
            <IntegrationsCard
              key={provider}
              provider={provider}
              description={DESCRIPTIONS[provider]}
              state={integrations[provider]}
              assignedAccountIds={assignedIds}
              connectedDetailText={
                provider === "ga4" && integrations.ga4.status === "connected"
                  ? "Property integration connected"
                  : undefined
              }
              onConnect={handleConnect}
              onReconnect={(p) => setActiveProvider(p)}
              onRetry={handleRetry}
              onCancel={(p) => cancel(p)}
              onDisconnect={(p) => handleDisconnect(p)}
              onOpenAssignments={(p) => setAssignmentProvider(p)}
            />
          );
        })}
      </div>

      <ConnectModal
        provider={activeProvider}
        businessId={businessId}
        onClose={() => setActiveProvider(null)}
        onContinue={(provider) => {
          connect(provider);
          setActiveProvider(null);
        }}
      />

      <ProviderAssignmentDrawer
        open={Boolean(assignmentProvider)}
        provider={assignmentProvider}
        businessId={businessId}
        assignedAccountIds={assignedIdsForDrawer}
        onClose={() => setAssignmentProvider(null)}
        onSave={(provider, accountIds, accounts) => {
          setProviderAccounts(
            businessId,
            provider,
            accounts.map((account) => ({ id: account.id, name: account.name })),
          );
          setAssignedAccounts(businessId, provider, accountIds);
          setToast({
            type: "success",
            message:
              accountIds.length > 0
                ? `Assignments saved (${accountIds.length}).`
                : "Assignments cleared for this provider.",
          });
        }}
      />
    </div>
  );
}
