"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import {
  IntegrationProvider,
  IntegrationState,
  useIntegrationsStore,
} from "@/store/integrations-store";
import { IntegrationsCard } from "@/components/integrations/integrations-card";
import { ConnectModal } from "@/components/integrations/connect-modal";
import { useIntegrationConnection } from "@/hooks/use-integration-connection";
import { ProviderAssignmentDrawer } from "@/components/integrations/provider-assignment-drawer";
import { GA4PropertyPicker } from "@/components/integrations/ga4-property-picker";

/** Providers that have real backend OAuth (not mock) */
const REAL_PROVIDERS: IntegrationProvider[] = [
  "shopify",
  "meta",
  "google",
  "ga4",
  "search_console",
];

const DISPLAY_PROVIDERS: IntegrationProvider[] = [
  "meta",
  "google",
  "ga4",
  "search_console",
  "shopify",
  "tiktok",
  "pinterest",
  "snapchat",
];

const DESCRIPTIONS: Record<IntegrationProvider, string> = {
  shopify: "Sync storefront events and conversion data for attribution.",
  meta: "Connect Ads Manager to import campaigns, ad sets, and spend.",
  google: "Link Google Ads to track performance and sync account data.",
  search_console:
    "Connect Google Search Console to analyze organic search performance and keyword visibility.",
  tiktok: "Pull campaign metrics from TikTok Ads into your dashboard.",
  pinterest: "Import Pinterest Ads performance and audience insights.",
  snapchat: "Connect Snapchat Ads for campaign and creative reporting.",
  ga4: "Connect Google Analytics 4 to enrich landing page and conversion insights.",
};

interface SearchConsoleProperty {
  siteUrl: string;
  permissionLevel?: string;
  siteType?: "domain" | "url-prefix";
}

function getFallbackIntegrationState(
  provider: IntegrationProvider,
): IntegrationState {
  return {
    provider,
    status: "disconnected" as const,
    accounts: [],
  };
}

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
  const [ga4PickerOpen, setGa4PickerOpen] = useState(false);
  const [ga4PropertyInfo, setGa4PropertyInfo] = useState<{
    propertyId: string;
    propertyName: string;
  } | null>(null);

  const [isPropertySelectorOpen, setIsPropertySelectorOpen] = useState(false);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [properties, setProperties] = useState<SearchConsoleProperty[]>([]);
  const [selectedPropertyUrl, setSelectedPropertyUrl] = useState("");

  const integrations = useMemo(() => {
    if (!businessId) return null;
    return byBusinessId[businessId];
  }, [byBusinessId, businessId]);

  const ga4State = integrations?.ga4 ?? getFallbackIntegrationState("ga4");
  const searchConsoleState =
    integrations?.search_console ?? getFallbackIntegrationState("search_console");

  const closeSearchConsoleSelector = useCallback(() => {
    setIsPropertySelectorOpen(false);
    setIsLoadingProperties(false);
    setIsSavingProperty(false);
    setPropertyError(null);
    setProperties([]);
  }, []);

  const openSearchConsoleSelector = useCallback(async () => {
    if (!businessId || !integrations) return;
    setPropertyError(null);
    setIsLoadingProperties(true);
    setIsPropertySelectorOpen(true);
    try {
      const response = await fetch(
        `/api/google-search-console/sites?businessId=${encodeURIComponent(businessId)}`,
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setPropertyError(
          (payload as { message?: string } | null)?.message ??
            "Could not load Search Console properties.",
        );
        setProperties([]);
        return;
      }

      const rows = Array.isArray((payload as { sites?: unknown[] } | null)?.sites)
        ? ((payload as { sites: SearchConsoleProperty[] }).sites ?? [])
        : [];
      setProperties(rows);
      const existingProperty =
        searchConsoleState.providerAccountName ??
        searchConsoleState.providerAccountId ??
        "";
      setSelectedPropertyUrl(existingProperty || rows[0]?.siteUrl || "");
    } catch {
      setProperties([]);
      setPropertyError("Could not load Search Console properties.");
    } finally {
      setIsLoadingProperties(false);
    }
  }, [businessId, searchConsoleState]);

  const saveSearchConsoleProperty = useCallback(async () => {
    if (!businessId || !integrations || !selectedPropertyUrl) return;
    setIsSavingProperty(true);
    setPropertyError(null);
    try {
      const response = await fetch(
        `/api/google-search-console/select-site`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            siteUrl: selectedPropertyUrl,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setPropertyError(
          (payload as { message?: string } | null)?.message ??
            "Could not save selected property.",
        );
        return;
      }

      const integration = (
        payload as {
          integration?: {
            id?: string;
            connected_at?: string | null;
            updated_at?: string | null;
            provider_account_id?: string | null;
            provider_account_name?: string | null;
          };
        }
      ).integration;

      setConnected(
        businessId,
        "search_console",
        integration?.id ?? searchConsoleState.integrationId,
        {
          connectedAt:
            integration?.connected_at ?? searchConsoleState.connectedAt,
          lastSyncAt: integration?.updated_at ?? new Date().toISOString(),
          providerAccountId:
            integration?.provider_account_id ?? selectedPropertyUrl,
          providerAccountName:
            integration?.provider_account_name ?? selectedPropertyUrl,
        },
      );
      setToast({
        type: "success",
        message: "Search Console property selected.",
      });
      closeSearchConsoleSelector();
    } catch {
      setPropertyError("Could not save selected property.");
    } finally {
      setIsSavingProperty(false);
    }
  }, [
    businessId,
    closeSearchConsoleSelector,
    searchConsoleState,
    selectedPropertyUrl,
    setConnected,
    setToast,
  ]);

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
      if (provider === "ga4") {
        setGa4PropertyInfo(null);
      }
      if (assignmentProvider === provider) {
        setAssignmentProvider(null);
      }
      if (provider === "search_console") {
        closeSearchConsoleSelector();
      }
    },
    [assignmentProvider, businessId, closeSearchConsoleSelector, disconnect],
  );

  useEffect(() => {
    if (!businessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness]);

  useEffect(() => {
    if (!businessId) return;
    fetchStatuses();
  }, [businessId, fetchStatuses]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/integrations?businessId=${encodeURIComponent(businessId)}&provider=ga4`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const integration = data.integration;
        if (!integration || cancelled) return;
        const metadata = integration.metadata;
        if (metadata?.ga4PropertyId && metadata?.ga4PropertyName) {
          setGa4PropertyInfo({
            propertyId: metadata.ga4PropertyId,
            propertyName: metadata.ga4PropertyName,
          });
        } else {
          setGa4PropertyInfo(null);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => clearToast(), 3000);
    return () => clearTimeout(timeout);
  }, [toast, clearToast]);

  if (!businessId) return <BusinessEmptyState />;
  if (!integrations) return null;

  const handleConnect = (provider: IntegrationProvider) => {
    setActiveProvider(provider);
  };

  const handleRetry = (provider: IntegrationProvider) => {
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
        {DISPLAY_PROVIDERS.map((provider) => {
          const assignedIds =
            assignedAccountsByBusiness[businessId]?.[provider] ?? [];
          const state = integrations[provider] ?? getFallbackIntegrationState(provider);

          const isGa4 = provider === "ga4";
          const ga4Connected = isGa4 && ga4State.status === "connected";
          const isSearchConsole = provider === "search_console";
          const searchConsoleConnected =
            isSearchConsole && state.status === "connected";

          return (
            <IntegrationsCard
              key={provider}
              provider={provider}
              description={DESCRIPTIONS[provider]}
              state={state}
              assignedAccountIds={assignedIds}
              connectedDetailText={
                ga4Connected
                  ? ga4PropertyInfo
                    ? `Property: ${ga4PropertyInfo.propertyName}`
                    : "Connected — no property selected yet"
                  : searchConsoleConnected
                    ? `Property: ${
                        state.providerAccountName ??
                        state.providerAccountId ??
                        "Not selected"
                      }`
                    : undefined
              }
              connectedActionLabel={
                ga4Connected
                    ? ga4PropertyInfo
                      ? "Change Property"
                      : "Select Property"
                  : searchConsoleConnected
                    ? "Change Site"
                    : undefined
              }
              onConnect={handleConnect}
              onReconnect={(p) => setActiveProvider(p)}
              onRetry={handleRetry}
              onCancel={(p) => cancel(p)}
              onDisconnect={(p) => handleDisconnect(p)}
              onOpenAssignments={(p) => {
                if (p === "ga4") {
                  setGa4PickerOpen(true);
                  return;
                }
                if (p === "search_console") {
                  void openSearchConsoleSelector();
                  return;
                }
                setAssignmentProvider(p);
              }}
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

      <GA4PropertyPicker
        open={ga4PickerOpen}
        businessId={businessId}
        currentPropertyId={ga4PropertyInfo?.propertyId ?? null}
        onClose={() => setGa4PickerOpen(false)}
        onSave={(property) => {
          setGa4PropertyInfo({
            propertyId: property.propertyId,
            propertyName: property.propertyName,
          });
          setToast({
            type: "success",
            message: `GA4 property "${property.propertyName}" linked.`,
          });
        }}
      />

      {isPropertySelectorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border bg-background p-5 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">
                Select Search Console Property
              </h3>
              <p className="text-sm text-muted-foreground">
                Choose the property Adsecute should use for Search Console sync.
              </p>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-lg border p-3">
              {isLoadingProperties ? (
                <p className="text-sm text-muted-foreground">
                  Loading properties...
                </p>
              ) : properties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Search Console properties found for this connection.
                </p>
              ) : (
                properties.map((property) => (
                  <label
                    key={property.siteUrl}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <input
                      type="radio"
                      name="search-console-property"
                      checked={selectedPropertyUrl === property.siteUrl}
                      onChange={() => setSelectedPropertyUrl(property.siteUrl)}
                    />
                    <span className="font-medium">{property.siteUrl}</span>
                  </label>
                ))
              )}
            </div>

            {propertyError ? (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {propertyError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={closeSearchConsoleSelector}
                disabled={isSavingProperty}
              >
                Cancel
              </Button>
              <Button
                onClick={saveSearchConsoleProperty}
                disabled={
                  isLoadingProperties || isSavingProperty || !selectedPropertyUrl
                }
              >
                {isSavingProperty ? "Saving..." : "Save Property"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
