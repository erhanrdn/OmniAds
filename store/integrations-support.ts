import type {
  AssignedAccountsByBusiness,
  IntegrationAdAccount,
  IntegrationProvider,
  IntegrationState,
} from "@/store/integrations-store";

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  "shopify",
  "meta",
  "google",
  "search_console",
  "tiktok",
  "pinterest",
  "snapchat",
  "ga4",
  "klaviyo",
];

export const DEFAULT_INTEGRATION_ACCOUNTS: Record<IntegrationProvider, IntegrationAdAccount[]> = {
  shopify: [],
  meta: [],
  google: [],
  search_console: [],
  tiktok: [],
  pinterest: [],
  snapchat: [],
  ga4: [],
  klaviyo: [],
};

export function isLegacyMockAccount(account: IntegrationAdAccount) {
  return (
    account.id.startsWith("meta-acct-") ||
    account.id.startsWith("google-acct-") ||
    account.id.startsWith("shopify-acct-") ||
    account.id === "ga4-property-1" ||
    account.id.startsWith("klaviyo-list-")
  );
}

export function buildDefaultIntegrations(): Record<IntegrationProvider, IntegrationState> {
  return INTEGRATION_PROVIDERS.reduce<Record<IntegrationProvider, IntegrationState>>(
    (acc, provider) => {
      acc[provider] = {
        provider,
        status: "disconnected",
        accounts: [],
      };
      return acc;
    },
    {} as Record<IntegrationProvider, IntegrationState>
  );
}

export function normalizeBusinessIntegrations(
  current?: Partial<Record<IntegrationProvider, IntegrationState>>
): Record<IntegrationProvider, IntegrationState> {
  const defaults = buildDefaultIntegrations();
  if (!current) return defaults;

  return INTEGRATION_PROVIDERS.reduce<Record<IntegrationProvider, IntegrationState>>(
    (acc, provider) => {
      const existing = current[provider];
      acc[provider] = existing
        ? {
            provider,
            status: existing.status,
            errorMessage: existing.errorMessage,
            connectedAt: existing.connectedAt,
            lastSyncAt: existing.lastSyncAt,
            integrationId: existing.integrationId,
            providerAccountId: existing.providerAccountId,
            providerAccountName: existing.providerAccountName,
            accounts: (existing.accounts ?? []).filter(
              (account) => !isLegacyMockAccount(account)
            ),
          }
        : defaults[provider];
      return acc;
    },
    {} as Record<IntegrationProvider, IntegrationState>
  );
}

export function normalizeAssignedAccounts(
  businessId: string,
  assignedAccountsByBusiness: AssignedAccountsByBusiness,
  byBusinessId: Record<string, Record<IntegrationProvider, IntegrationState>>
): Partial<Record<IntegrationProvider, string[]>> {
  const existing = assignedAccountsByBusiness[businessId];
  if (existing) return existing;

  const integrations = byBusinessId[businessId];
  if (!integrations) return {};

  return INTEGRATION_PROVIDERS.reduce<Partial<Record<IntegrationProvider, string[]>>>(
    (acc, provider) => {
      acc[provider] = (integrations[provider]?.accounts ?? [])
        .filter((account) => account.enabled)
        .map((account) => account.id);
      return acc;
    },
    {}
  );
}

export function withAssignedAccountFlags(
  accounts: Array<{ id: string; name: string }>,
  assignedIds: string[]
) {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    enabled: assignedIds.includes(account.id),
  }));
}

export function updateEnabledAccounts(
  accounts: IntegrationAdAccount[],
  accountIds: string[]
) {
  return accounts.map((account) =>
    accountIds.includes(account.id)
      ? { ...account, enabled: true }
      : { ...account, enabled: false }
  );
}
