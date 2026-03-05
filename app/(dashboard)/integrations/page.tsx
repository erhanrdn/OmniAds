"use client";

import { useEffect, useMemo, useState } from "react";
import { BUSINESSES, useAppStore } from "@/store/app-store";
import {
  INTEGRATION_PROVIDERS,
  IntegrationProvider,
  useIntegrationsStore,
} from "@/store/integrations-store";
import { IntegrationsCard } from "@/components/integrations/integrations-card";
import { ConnectModal } from "@/components/integrations/connect-modal";

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
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? BUSINESSES[0].id;

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const startConnecting = useIntegrationsStore((state) => state.startConnecting);
  const setConnected = useIntegrationsStore((state) => state.setConnected);
  const disconnect = useIntegrationsStore((state) => state.disconnect);
  const toggleAccount = useIntegrationsStore((state) => state.toggleAccount);
  const toast = useIntegrationsStore((state) => state.toast);
  const setToast = useIntegrationsStore((state) => state.setToast);
  const clearToast = useIntegrationsStore((state) => state.clearToast);

  const [activeProvider, setActiveProvider] = useState<IntegrationProvider | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<IntegrationProvider | null>(null);

  useEffect(() => {
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => clearToast(), 3000);
    return () => clearTimeout(timeout);
  }, [toast, clearToast]);

  const integrations = useMemo(() => {
    return byBusinessId[businessId];
  }, [byBusinessId, businessId]);

  if (!integrations) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Manage OAuth connections and ad account selections.
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
        {INTEGRATION_PROVIDERS.map((provider) => (
          <IntegrationsCard
            key={provider}
            provider={provider}
            description={DESCRIPTIONS[provider]}
            state={integrations[provider]}
            isExpanded={expandedProvider === provider}
            simpleActions={provider === "ga4"}
            connectedDetailText={
              provider === "ga4" && integrations.ga4.status === "connected"
                ? "Property: GA4 Demo Property"
                : undefined
            }
            onConnect={(nextProvider) => {
              if (nextProvider === "ga4") {
                setConnected(businessId, "ga4", "ga4-demo-property");
                setToast({
                  type: "success",
                  message: "GA4 OAuth flow will be handled by backend.",
                });
                return;
              }
              setActiveProvider(nextProvider);
            }}
            onReconnect={(nextProvider) => {
              if (nextProvider === "ga4") {
                setConnected(businessId, "ga4", "ga4-demo-property");
                setToast({
                  type: "success",
                  message: "GA4 OAuth flow will be handled by backend.",
                });
                return;
              }
              setActiveProvider(nextProvider);
            }}
            onRetry={(nextProvider) => {
              if (nextProvider === "ga4") {
                setConnected(businessId, "ga4", "ga4-demo-property");
                setToast({
                  type: "success",
                  message: "GA4 OAuth flow will be handled by backend.",
                });
                return;
              }
              setActiveProvider(nextProvider);
            }}
            onDisconnect={(nextProvider) => {
              disconnect(businessId, nextProvider);
              if (expandedProvider === nextProvider) {
                setExpandedProvider(null);
              }
            }}
            onToggleManage={(nextProvider) =>
              setExpandedProvider((prev) => (prev === nextProvider ? null : nextProvider))
            }
            onToggleAccount={(nextProvider, accountId) =>
              toggleAccount(businessId, nextProvider, accountId)
            }
          />
        ))}
      </div>

      <ConnectModal
        provider={activeProvider}
        businessId={businessId}
        onClose={() => setActiveProvider(null)}
        onContinue={(provider) => {
          startConnecting(businessId, provider);
          setActiveProvider(null);
        }}
      />
    </div>
  );
}
