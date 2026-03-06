import { create } from "zustand";
import { persist } from "zustand/middleware";

export type IntegrationProvider =
  | "shopify"
  | "meta"
  | "google"
  | "tiktok"
  | "pinterest"
  | "snapchat"
  | "ga4";

export type IntegrationStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "timeout";

export interface IntegrationAdAccount {
  id: string;
  name: string;
  enabled: boolean;
}

export interface IntegrationState {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  errorMessage?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  integrationId?: string;
  accounts: IntegrationAdAccount[];
}

export interface IntegrationToast {
  type: "success" | "error";
  message: string;
}

const PROVIDERS: IntegrationProvider[] = [
  "shopify",
  "meta",
  "google",
  "tiktok",
  "pinterest",
  "snapchat",
  "ga4",
];

const DEFAULT_ACCOUNTS: Record<IntegrationProvider, IntegrationAdAccount[]> = {
  shopify: [
    { id: "shopify-acct-1", name: "Main Store", enabled: true },
    { id: "shopify-acct-2", name: "EU Store", enabled: false },
  ],
  meta: [
    { id: "meta-acct-1", name: "Meta Ads - Main", enabled: true },
    { id: "meta-acct-2", name: "Meta Ads - Prospecting", enabled: true },
  ],
  google: [
    { id: "google-acct-1", name: "Google Ads - Search", enabled: true },
    { id: "google-acct-2", name: "Google Ads - PMax", enabled: true },
  ],
  tiktok: [
    { id: "tiktok-acct-1", name: "TikTok Ads - Global", enabled: true },
    { id: "tiktok-acct-2", name: "TikTok Ads - DACH", enabled: false },
  ],
  pinterest: [
    { id: "pinterest-acct-1", name: "Pinterest Ads - Main", enabled: true },
    { id: "pinterest-acct-2", name: "Pinterest Ads - Seasonal", enabled: false },
  ],
  snapchat: [
    { id: "snapchat-acct-1", name: "Snapchat Ads - Main", enabled: true },
    { id: "snapchat-acct-2", name: "Snapchat Ads - Creator", enabled: false },
  ],
  ga4: [{ id: "ga4-property-1", name: "GA4 Demo Property", enabled: true }],
};

const buildDefaultIntegrations = (): Record<IntegrationProvider, IntegrationState> =>
  PROVIDERS.reduce<Record<IntegrationProvider, IntegrationState>>((acc, provider) => {
    acc[provider] = {
      provider,
      status: "disconnected",
      accounts: [],
    };
    return acc;
  }, {} as Record<IntegrationProvider, IntegrationState>);

const normalizeBusinessIntegrations = (
  current?: Partial<Record<IntegrationProvider, IntegrationState>>
): Record<IntegrationProvider, IntegrationState> => {
  const defaults = buildDefaultIntegrations();
  if (!current) return defaults;

  return PROVIDERS.reduce<Record<IntegrationProvider, IntegrationState>>((acc, provider) => {
    const existing = current[provider];
    acc[provider] = existing
      ? {
          provider,
          status: existing.status,
          errorMessage: existing.errorMessage,
          connectedAt: existing.connectedAt,
          lastSyncAt: existing.lastSyncAt,
          integrationId: existing.integrationId,
          accounts: existing.accounts ?? [],
        }
      : defaults[provider];
    return acc;
  }, {} as Record<IntegrationProvider, IntegrationState>);
};

interface IntegrationsStore {
  byBusinessId: Record<string, Record<IntegrationProvider, IntegrationState>>;
  toast: IntegrationToast | null;
  ensureBusiness: (businessId: string) => void;
  startConnecting: (businessId: string, provider: IntegrationProvider) => void;
  setConnected: (
    businessId: string,
    provider: IntegrationProvider,
    integrationId?: string
  ) => void;
  setError: (
    businessId: string,
    provider: IntegrationProvider,
    errorMessage: string
  ) => void;
  setTimedOut: (businessId: string, provider: IntegrationProvider) => void;
  disconnect: (businessId: string, provider: IntegrationProvider) => void;
  toggleAccount: (
    businessId: string,
    provider: IntegrationProvider,
    accountId: string
  ) => void;
  setToast: (toast: IntegrationToast) => void;
  clearToast: () => void;
}

export const useIntegrationsStore = create<IntegrationsStore>()(
  persist(
    (set, get) => ({
      byBusinessId: {},
      toast: null,
      ensureBusiness: (businessId) => {
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: normalizeBusinessIntegrations(state.byBusinessId[businessId]),
          },
        }));
      },
      startConnecting: (businessId, provider) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: {
              ...state.byBusinessId[businessId],
              [provider]: {
                ...state.byBusinessId[businessId][provider],
                status: "connecting",
                errorMessage: undefined,
              },
            },
          },
        }));
      },
      setConnected: (businessId, provider, integrationId) => {
        get().ensureBusiness(businessId);
        set((state) => {
          const existing = state.byBusinessId[businessId][provider];
          const now = new Date().toISOString();
          return {
            byBusinessId: {
              ...state.byBusinessId,
              [businessId]: {
                ...state.byBusinessId[businessId],
                [provider]: {
                  ...existing,
                  status: "connected",
                  errorMessage: undefined,
                  connectedAt: existing.connectedAt ?? now,
                  lastSyncAt: now,
                  integrationId,
                  accounts:
                    existing.accounts.length > 0
                      ? existing.accounts
                      : DEFAULT_ACCOUNTS[provider].map((item) => ({ ...item })),
                },
              },
            },
          };
        });
      },
      setError: (businessId, provider, errorMessage) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: {
              ...state.byBusinessId[businessId],
              [provider]: {
                ...state.byBusinessId[businessId][provider],
                status: "error",
                errorMessage,
              },
            },
          },
        }));
      },
      setTimedOut: (businessId, provider) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: {
              ...state.byBusinessId[businessId],
              [provider]: {
                ...state.byBusinessId[businessId][provider],
                status: "timeout",
                errorMessage: "Connection timed out. Please try again.",
              },
            },
          },
        }));
      },
      disconnect: (businessId, provider) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: {
              ...state.byBusinessId[businessId],
              [provider]: {
                provider,
                status: "disconnected",
                accounts: [],
              },
            },
          },
        }));
      },
      toggleAccount: (businessId, provider, accountId) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: {
              ...state.byBusinessId[businessId],
              [provider]: {
                ...state.byBusinessId[businessId][provider],
                accounts: state.byBusinessId[businessId][provider].accounts.map((account) =>
                  account.id === accountId
                    ? { ...account, enabled: !account.enabled }
                    : account
                ),
              },
            },
          },
        }));
      },
      setToast: (toast) => set({ toast }),
      clearToast: () => set({ toast: null }),
    }),
    {
      name: "omniads-integrations-store-v1",
      partialize: (state) => ({
        byBusinessId: state.byBusinessId,
      }),
    }
  )
);

export const INTEGRATION_PROVIDERS = PROVIDERS;
