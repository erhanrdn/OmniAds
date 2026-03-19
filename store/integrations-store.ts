import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  buildDefaultIntegrations,
  DEFAULT_INTEGRATION_ACCOUNTS,
  INTEGRATION_PROVIDERS,
  normalizeAssignedAccounts,
  normalizeBusinessIntegrations,
  updateEnabledAccounts,
  withAssignedAccountFlags,
} from "@/store/integrations-support";

export const INTEGRATIONS_STORE_PERSIST_KEY = "omniads-integrations-store-v1";

export type IntegrationProvider =
  | "shopify"
  | "meta"
  | "google"
  | "search_console"
  | "tiktok"
  | "pinterest"
  | "snapchat"
  | "ga4"
  | "klaviyo";

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
  providerAccountId?: string;
  providerAccountName?: string;
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

interface IntegrationsStore {
  byBusinessId: Record<string, Record<IntegrationProvider, IntegrationState>>;
  assignedAccountsByBusiness: AssignedAccountsByBusiness;
  toast: IntegrationToast | null;
  clearAllState: () => void;
  ensureBusiness: (businessId: string) => void;
  startConnecting: (businessId: string, provider: IntegrationProvider) => void;
  setConnected: (
    businessId: string,
    provider: IntegrationProvider,
    integrationId?: string,
    metadata?: {
      connectedAt?: string;
      lastSyncAt?: string;
      providerAccountId?: string | null;
      providerAccountName?: string | null;
    }
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
  removeBusinessData: (businessId: string) => void;
  retainBusinesses: (businessIds: string[]) => void;
  clearProviderAccountsForBusiness: (businessId: string) => void;
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
      clearAllState: () =>
        set({
          byBusinessId: {},
          assignedAccountsByBusiness: {},
          toast: null,
        }),
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
      setConnected: (businessId, provider, integrationId, metadata) => {
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
                  connectedAt:
                    metadata?.connectedAt ??
                    existing.connectedAt ??
                    now,
                  lastSyncAt: metadata?.lastSyncAt ?? now,
                  integrationId,
                  providerAccountId:
                    metadata?.providerAccountId ??
                    existing.providerAccountId,
                  providerAccountName:
                    metadata?.providerAccountName ??
                    existing.providerAccountName,
                  accounts:
                    existing.accounts.length > 0
                      ? existing.accounts
                      : DEFAULT_INTEGRATION_ACCOUNTS[provider].map((item) => ({ ...item })),
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
                providerAccountId: undefined,
                providerAccountName: undefined,
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
                  accounts: updateEnabledAccounts(
                    state.byBusinessId[businessId][provider].accounts,
                    accountIds
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
                  accounts: withAssignedAccountFlags(accounts, assignedIds),
                },
              },
            },
          };
        });
      },
      removeBusinessData: (businessId) => {
        set((state) => {
          const nextByBusinessId = { ...state.byBusinessId };
          const nextAssigned = { ...state.assignedAccountsByBusiness };
          delete nextByBusinessId[businessId];
          delete nextAssigned[businessId];
          return {
            byBusinessId: nextByBusinessId,
            assignedAccountsByBusiness: nextAssigned,
          };
        });
      },
      retainBusinesses: (businessIds) => {
        const allowed = new Set(businessIds);
        set((state) => ({
          byBusinessId: Object.fromEntries(
            Object.entries(state.byBusinessId).filter(([businessId]) => allowed.has(businessId))
          ),
          assignedAccountsByBusiness: Object.fromEntries(
            Object.entries(state.assignedAccountsByBusiness).filter(([businessId]) =>
              allowed.has(businessId)
            )
          ),
        }));
      },
      clearProviderAccountsForBusiness: (businessId) => {
        get().ensureBusiness(businessId);
        set((state) => ({
          byBusinessId: {
            ...state.byBusinessId,
            [businessId]: INTEGRATION_PROVIDERS.reduce<Record<IntegrationProvider, IntegrationState>>(
              (acc, provider) => {
                acc[provider] = {
                  ...state.byBusinessId[businessId][provider],
                  accounts: [],
                };
                return acc;
              },
              {} as Record<IntegrationProvider, IntegrationState>
            ),
          },
          assignedAccountsByBusiness: {
            ...state.assignedAccountsByBusiness,
            [businessId]: {},
          },
        }));
      },
      getAssignedAccounts: (businessId, provider) =>
        get().assignedAccountsByBusiness[businessId]?.[provider] ?? [],
      hasAssignedAccounts: (businessId, provider) =>
        (get().assignedAccountsByBusiness[businessId]?.[provider] ?? []).length > 0,
      setToast: (toast) => set({ toast }),
      clearToast: () => set({ toast: null }),
    }),
    {
      name: INTEGRATIONS_STORE_PERSIST_KEY,
      partialize: (state) => ({
        byBusinessId: state.byBusinessId,
        assignedAccountsByBusiness: state.assignedAccountsByBusiness,
      }),
    }
  )
);

export { INTEGRATION_PROVIDERS };
