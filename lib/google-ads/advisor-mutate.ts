import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import { refreshGoogleAccessToken } from "@/lib/google-ads-accounts";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";

type MutateHttpMethod = "POST";

export interface AddNegativeKeywordPayload {
  campaignId: string;
  negativeKeywords: string[];
  matchType: "EXACT";
}

export interface PauseAssetPayload {
  assetId: string;
  assetGroupId: string;
  fieldType: string;
}

export interface PauseAdPayload {
  adId: string;
}

export interface CampaignBudgetMutationOperation {
  campaignId: string;
  campaignBudgetResourceName: string;
  previousAmount: number;
  proposedAmount: number;
  deltaPercent: number;
}

export interface AdjustCampaignBudgetPayload extends CampaignBudgetMutationOperation {
  operations?: CampaignBudgetMutationOperation[];
}

export type AdvisorMutatePayload =
  | { actionType: "add_negative_keyword"; payload: AddNegativeKeywordPayload }
  | { actionType: "pause_asset"; payload: PauseAssetPayload }
  | { actionType: "pause_ad"; payload: PauseAdPayload }
  | { actionType: "adjust_campaign_budget"; payload: AdjustCampaignBudgetPayload }
  | { actionType: "adjust_shared_budget"; payload: AdjustCampaignBudgetPayload };

export interface AdvisorMutationResult {
  actionType: AdvisorMutatePayload["actionType"];
  resourceNames: string[];
  rawResponse: Record<string, unknown>;
}

function normalizeCustomerId(value: string) {
  return value.replace(/^customers\//, "").replace(/\D/g, "");
}

async function resolveGoogleAccessToken(businessId: string) {
  const integration = await getIntegration(businessId, "google");
  if (!integration?.access_token) {
    throw new Error("Google Ads integration not found or not connected.");
  }

  let accessToken = integration.access_token;
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    if (new Date() >= expiresAt && integration.refresh_token) {
      const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
      await upsertIntegration({
        businessId,
        provider: "google",
        status: "connected",
        accessToken: refreshed.accessToken,
        refreshToken: integration.refresh_token,
        tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      });
      accessToken = refreshed.accessToken;
    }
  }

  return accessToken;
}

async function loginCustomerIdCandidates(businessId: string, accountId: string) {
  const snapshot = await readProviderAccountSnapshot({
    businessId,
    provider: "google",
  }).catch(() => null);
  const normalized = normalizeCustomerId(accountId);
  const managers = (snapshot?.accounts ?? [])
    .filter((account) => account.isManager)
    .map((account) => normalizeCustomerId(account.id))
    .filter((candidate) => candidate && candidate !== normalized);
  return [undefined, ...Array.from(new Set(managers)).slice(0, 3)];
}

async function googleAdsMutateRequest(input: {
  businessId: string;
  accountId: string;
  path: string;
  body: Record<string, unknown>;
  validateOnly?: boolean;
}) {
  const accessToken = await resolveGoogleAccessToken(input.businessId);
  const accountId = normalizeCustomerId(input.accountId);
  const url = `${GOOGLE_CONFIG.adsApiBase}/customers/${accountId}/${input.path}`;
  let lastError: string | null = null;

  for (const loginCustomerId of await loginCustomerIdCandidates(input.businessId, accountId)) {
    const response = await fetch(url, {
      method: "POST" satisfies MutateHttpMethod,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": GOOGLE_CONFIG.developerToken,
        "content-type": "application/json",
        Accept: "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify(input.body),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && payload) {
      return payload;
    }
    lastError =
      String(
        payload?.error && typeof payload.error === "object"
          ? (payload.error as Record<string, unknown>).message ?? response.statusText
          : response.statusText
      ) || (input.validateOnly ? "Google Ads validate-only request failed." : "Google Ads mutate request failed.");
  }

  throw new Error(lastError ?? (input.validateOnly ? "Google Ads validate-only request failed." : "Google Ads mutate request failed."));
}

async function googleAdsSearchRequest(input: {
  businessId: string;
  accountId: string;
  query: string;
}) {
  const accessToken = await resolveGoogleAccessToken(input.businessId);
  const accountId = normalizeCustomerId(input.accountId);
  const url = `${GOOGLE_CONFIG.adsApiBase}/customers/${accountId}/googleAds:search`;
  let lastError: string | null = null;

  for (const loginCustomerId of await loginCustomerIdCandidates(input.businessId, accountId)) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": GOOGLE_CONFIG.developerToken,
        "content-type": "application/json",
        Accept: "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({ query: input.query }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && payload) {
      return payload;
    }
    lastError =
      String(
        payload?.error && typeof payload.error === "object"
          ? (payload.error as Record<string, unknown>).message ?? response.statusText
          : response.statusText
      ) || "Google Ads search request failed.";
  }

  throw new Error(lastError ?? "Google Ads search request failed.");
}

function escapeGaqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function budgetOperationsFromPayload(payload: AdjustCampaignBudgetPayload) {
  const operations = Array.isArray(payload.operations) && payload.operations.length > 0
    ? payload.operations
    : [payload];
  return operations.filter(
    (entry) =>
      Boolean(entry.campaignBudgetResourceName) &&
      Number.isFinite(Number(entry.previousAmount)) &&
      Number.isFinite(Number(entry.proposedAmount))
  );
}

export async function validateAdvisorMutation(input: {
  businessId: string;
  accountId: string;
  action: AdvisorMutatePayload;
}) {
  switch (input.action.actionType) {
    case "add_negative_keyword": {
      const actionPayload = input.action.payload;
      await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignCriteria:mutate",
        validateOnly: true,
        body: {
          validateOnly: true,
          operations: actionPayload.negativeKeywords.map((keyword) => ({
            create: {
              campaign: `customers/${normalizeCustomerId(input.accountId)}/campaigns/${actionPayload.campaignId}`,
              negative: true,
              keyword: {
                text: keyword,
                matchType: actionPayload.matchType,
              },
            },
          })),
        },
      });
      return;
    }
    case "pause_asset": {
      const actionPayload = input.action.payload;
      const resourceName = `customers/${normalizeCustomerId(input.accountId)}/assetGroupAssets/${actionPayload.assetGroupId}~${actionPayload.assetId}~${actionPayload.fieldType}`;
      await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "assetGroupAssets:mutate",
        validateOnly: true,
        body: {
          validateOnly: true,
          operations: [
            {
              update: {
                resourceName,
                status: "PAUSED",
              },
              updateMask: "status",
            },
          ],
        },
      });
      return;
    }
    case "pause_ad":
      throw new Error("Pause ad mutate is not enabled in Wave 10.");
    case "adjust_campaign_budget":
    case "adjust_shared_budget": {
      const operations = budgetOperationsFromPayload(input.action.payload);
      await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignBudgets:mutate",
        validateOnly: true,
        body: {
          validateOnly: true,
          operations: operations.map((operation) => ({
            update: {
              resourceName: operation.campaignBudgetResourceName,
              amountMicros: Math.round(operation.proposedAmount * 1_000_000),
            },
            updateMask: "amount_micros",
          })),
        },
      });
      return;
    }
  }
}

export async function preflightAdvisorMutation(input: {
  businessId: string;
  accountId: string;
  action: AdvisorMutatePayload;
}) {
  await validateAdvisorMutation(input);

  switch (input.action.actionType) {
    case "add_negative_keyword":
      return { ok: true as const };
    case "pause_asset": {
      const actionPayload = input.action.payload;
      const resourceName = `customers/${normalizeCustomerId(input.accountId)}/assetGroupAssets/${actionPayload.assetGroupId}~${actionPayload.assetId}~${actionPayload.fieldType}`;
      const response = await googleAdsSearchRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        query: `SELECT asset_group_asset.resource_name, asset_group_asset.status FROM asset_group_asset WHERE asset_group_asset.resource_name = '${escapeGaqlLiteral(resourceName)}' LIMIT 1`,
      });
      const row = Array.isArray(response.results) ? response.results[0] : null;
      const assetGroupAsset =
        row && typeof row === "object" && row !== null
          ? (row as Record<string, unknown>).assetGroupAsset ?? (row as Record<string, unknown>).asset_group_asset
          : null;
      const status =
        assetGroupAsset && typeof assetGroupAsset === "object"
          ? String((assetGroupAsset as Record<string, unknown>).status ?? "")
          : "";
      if (!status) {
        throw new Error("preflight_drift: asset state could not be verified before mutate.");
      }
      if (status === "PAUSED") {
        throw new Error("preflight_drift: asset is already paused.");
      }
      return { ok: true as const };
    }
    case "pause_ad":
      throw new Error("Pause ad mutate is not enabled in Wave 10.");
    case "adjust_campaign_budget":
    case "adjust_shared_budget": {
      const operations = budgetOperationsFromPayload(input.action.payload);
      for (const operation of operations) {
        const response = await googleAdsSearchRequest({
          businessId: input.businessId,
          accountId: input.accountId,
          query: `SELECT campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign_budget WHERE campaign_budget.resource_name = '${escapeGaqlLiteral(operation.campaignBudgetResourceName)}' LIMIT 1`,
        });
        const row = Array.isArray(response.results) ? response.results[0] : null;
        const campaignBudget =
          row && typeof row === "object" && row !== null
            ? (row as Record<string, unknown>).campaignBudget ?? (row as Record<string, unknown>).campaign_budget
            : null;
        const amountMicros =
          campaignBudget && typeof campaignBudget === "object"
            ? Number((campaignBudget as Record<string, unknown>).amountMicros ?? (campaignBudget as Record<string, unknown>).amount_micros ?? NaN)
            : NaN;
        const currentAmount = amountMicros / 1_000_000;
        if (!Number.isFinite(currentAmount)) {
          throw new Error("preflight_drift: current budget amount could not be verified before mutate.");
        }
        if (Math.abs(currentAmount - Number(operation.previousAmount)) > 0.009) {
          throw new Error(
            `preflight_drift: current budget ${currentAmount.toFixed(2)} no longer matches expected baseline ${Number(operation.previousAmount).toFixed(2)}.`
          );
        }
      }
      return { ok: true as const };
    }
  }
}

export async function executeAdvisorMutation(input: {
  businessId: string;
  accountId: string;
  action: AdvisorMutatePayload;
}) {
  switch (input.action.actionType) {
    case "add_negative_keyword": {
      const actionPayload = input.action.payload;
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignCriteria:mutate",
        body: {
          operations: actionPayload.negativeKeywords.map((keyword) => ({
            create: {
              campaign: `customers/${normalizeCustomerId(input.accountId)}/campaigns/${actionPayload.campaignId}`,
              negative: true,
              keyword: {
                text: keyword,
                matchType: actionPayload.matchType,
              },
            },
          })),
        },
      });
      const results = Array.isArray(payload.results) ? payload.results : [];
      const resourceNames = results
        .map((entry) =>
          entry && typeof entry === "object"
            ? String((entry as Record<string, unknown>).resourceName ?? "")
            : ""
        )
        .filter(Boolean);
      return {
        actionType: input.action.actionType,
        resourceNames,
        rawResponse: payload,
      } satisfies AdvisorMutationResult;
    }
    case "pause_asset": {
      const actionPayload = input.action.payload;
      const resourceName = `customers/${normalizeCustomerId(input.accountId)}/assetGroupAssets/${actionPayload.assetGroupId}~${actionPayload.assetId}~${actionPayload.fieldType}`;
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "assetGroupAssets:mutate",
        body: {
          operations: [
            {
              update: {
                resourceName,
                status: "PAUSED",
              },
              updateMask: "status",
            },
          ],
        },
      });
      return {
        actionType: input.action.actionType,
        resourceNames: [resourceName],
        rawResponse: payload,
      } satisfies AdvisorMutationResult;
    }
    case "pause_ad":
      throw new Error("Pause ad mutate is not enabled in Wave 10.");
    case "adjust_campaign_budget":
    case "adjust_shared_budget": {
      const operations = budgetOperationsFromPayload(input.action.payload);
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignBudgets:mutate",
        body: {
          operations: operations.map((operation) => ({
            update: {
              resourceName: operation.campaignBudgetResourceName,
              amountMicros: Math.round(operation.proposedAmount * 1_000_000),
            },
            updateMask: "amount_micros",
          })),
        },
      });
      return {
        actionType: input.action.actionType,
        resourceNames: operations.map((operation) => operation.campaignBudgetResourceName),
        rawResponse: payload,
      } satisfies AdvisorMutationResult;
    }
  }
}

export async function rollbackAdvisorMutation(input: {
  businessId: string;
  accountId: string;
  actionType: "remove_negative_keyword" | "enable_asset" | "enable_ad" | "restore_campaign_budget" | "restore_shared_budget";
  payload: Record<string, unknown>;
}) {
  switch (input.actionType) {
    case "remove_negative_keyword": {
      const resourceNames = Array.isArray(input.payload.resourceNames)
        ? input.payload.resourceNames.map((value) => String(value)).filter(Boolean)
        : [];
      if (resourceNames.length === 0) {
        throw new Error("No negative keyword resource names were recorded for rollback.");
      }
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignCriteria:mutate",
        body: {
          operations: resourceNames.map((resourceName) => ({
            remove: resourceName,
          })),
        },
      });
      return payload;
    }
    case "enable_asset": {
      const resourceNames = Array.isArray(input.payload.resourceNames)
        ? input.payload.resourceNames.map((value) => String(value)).filter(Boolean)
        : [];
      const singleResourceName = String(input.payload.resourceName ?? "");
      const targets = resourceNames.length > 0 ? resourceNames : singleResourceName ? [singleResourceName] : [];
      if (targets.length === 0) {
        throw new Error("No asset resource name was recorded for rollback.");
      }
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "assetGroupAssets:mutate",
        body: {
          operations: targets.map((resourceName) => ({
            update: {
              resourceName,
              status: "ENABLED",
            },
            updateMask: "status",
          })),
        },
      });
      return payload;
    }
    case "enable_ad":
      throw new Error("Enable ad rollback is not enabled in Wave 10.");
    case "restore_campaign_budget":
    case "restore_shared_budget": {
      const budgetOperations = Array.isArray(input.payload.operations)
        ? input.payload.operations
            .map((entry) => {
              const record = entry as Record<string, unknown>;
              return {
                campaignBudgetResourceName: String(record.campaignBudgetResourceName ?? ""),
                previousAmount: Number(record.previousAmount ?? NaN),
              };
            })
            .filter(
              (entry) =>
                Boolean(entry.campaignBudgetResourceName) && Number.isFinite(entry.previousAmount)
            )
        : [];
      const singleResourceName = String(input.payload.campaignBudgetResourceName ?? "");
      const singlePreviousAmount = Number(input.payload.previousAmount ?? NaN);
      const operations =
        budgetOperations.length > 0
          ? budgetOperations
          : singleResourceName && Number.isFinite(singlePreviousAmount)
            ? [{ campaignBudgetResourceName: singleResourceName, previousAmount: singlePreviousAmount }]
            : [];
      if (operations.length === 0) {
        throw new Error("Budget rollback requires the original campaign budget resource and amount.");
      }
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignBudgets:mutate",
        body: {
          operations: operations.map((operation) => ({
            update: {
              resourceName: operation.campaignBudgetResourceName,
              amountMicros: Math.round(operation.previousAmount * 1_000_000),
            },
            updateMask: "amount_micros",
          })),
        },
      });
      return payload;
    }
  }
}
