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

export type AssignedAccountsByBusiness = Record<
  string,
  Partial<Record<IntegrationProvider, string[]>>
>;

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
  shopify: [],
  meta: [],
  google: [],
  tiktok: [],
  pinterest: [],
  snapchat: [],
  ga4: [],
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

const normalizeAssignedAccounts = (
  businessId: string,
  assignedAccountsByBusiness: AssignedAccountsByBusiness,
  byBusinessId: Record<string, Record<IntegrationProvider, IntegrationState>>
): Partial<Record<IntegrationProvider, string[]>> => {
  const existing = assignedAccountsByBusiness[businessId];
  if (existing) return existing;

  const integrations = byBusinessId[businessId];
  if (!integrations) return {};

  return PROVIDERS.reduce<Partial<Record<IntegrationProvider, string[]>>>((acc, provider) => {
    acc[provider] = (integrations[provider]?.accounts ?? [])
      .filter((account) => account.enabled)
      .map((account) => account.id);
    return acc;
  }, {});
};

interface IntegrationsStore {
  byBusinessId: Record<string, Record<IntegrationProvider, IntegrationState>>;
  assignedAccountsByBusiness: AssignedAccountsByBusiness;
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
  setAssignedAccounts: (
    businessId: string,
    provider: IntegrationProvider,
    accountIds: string[]
  ) => void;
  setProviderAccounts: (
    businessId: string,
    provider: IntegrationProvider,
    accounts: Array<{ id: string; name: string }>
  ) => void;
  getAssignedAccounts: (businessId: string, provider: IntegrationProvider) => string[];
  hasAssignedAccounts: (businessId: string, provider: IntegrationProvider) => boolean;
  setToast: (toast: IntegrationToast) => void;
  clearToast: () => void;
}

export const useIntegrationsStore = create<IntegrationsStore>()(
  persist(
    (set, get) => ({
      byBusinessId: {},
      assignedAccountsByBusiness: {},
      toast: null,
      ensureBusiness: (businessId) => {
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: normalizeBusinessIntegrations(state.byBusinessId[businessId]),
          },
          assignedAccountsByBusiness: {
            ...state.assignedAccountsByBusiness,
            [businessId]: normalizeAssignedAccounts(
              businessId,
              state.assignedAccountsByBusiness,
              state.byBusinessId
            ),
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
          assignedAccountsByBusiness: {
            ...state.assignedAccountsByBusiness,
            [businessId]: {
              ...state.assignedAccountsByBusiness[businessId],
              [provider]: [],
            },
          },
        }));
      },
      setAssignedAccounts: (businessId, provider, accountIds) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: {
              ...state.byBusinessId[businessId],
              [provider]: {
                ...state.byBusinessId[businessId][provider],
                accounts: state.byBusinessId[businessId][provider].accounts.map((account) =>
                  accountIds.includes(account.id)
                    ? { ...account, enabled: true }
                    : { ...account, enabled: false }
                ),
              },
            },
          },
          assignedAccountsByBusiness: {
            ...state.assignedAccountsByBusiness,
            [businessId]: {
              ...state.assignedAccountsByBusiness[businessId],
              [provider]: accountIds,
            },
          },
        }));
      },
      setProviderAccounts: (businessId, provider, accounts) => {
        get().ensureBusiness(businessId);
        set((state) => {
          const assignedIds = state.assignedAccountsByBusiness[businessId]?.[provider] ?? [];
          return {
            byBusinessId: {
              ...state.byBusinessId,
              [businessId]: {
                ...state.byBusinessId[businessId],
                [provider]: {
                  ...state.byBusinessId[businessId][provider],
                  accounts: accounts.map((account) => ({
                    id: account.id,
                    name: account.name,
                    enabled: assignedIds.includes(account.id),
                  })),
                },
              },
            },
          };
        });
      },
      getAssignedAccounts: (businessId, provider) =>
        get().assignedAccountsByBusiness[businessId]?.[provider] ?? [],
      hasAssignedAccounts: (businessId, provider) =>
        (get().assignedAccountsByBusiness[businessId]?.[provider] ?? []).length > 0,
      setToast: (toast) => set({ toast }),
      clearToast: () => set({ toast: null }),
    }),
    {
      name: "omniads-integrations-store-v1",
      partialize: (state) => ({
        byBusinessId: state.byBusinessId,
        assignedAccountsByBusiness: state.assignedAccountsByBusiness,
      }),
    }
  )
);

export const INTEGRATION_PROVIDERS = PROVIDERS;
