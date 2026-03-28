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

export interface AdjustCampaignBudgetPayload {
  campaignId: string;
  campaignBudgetResourceName: string;
  previousAmount: number;
  proposedAmount: number;
  deltaPercent: number;
}

export type AdvisorMutatePayload =
  | { actionType: "add_negative_keyword"; payload: AddNegativeKeywordPayload }
  | { actionType: "pause_asset"; payload: PauseAssetPayload }
  | { actionType: "pause_ad"; payload: PauseAdPayload }
  | { actionType: "adjust_campaign_budget"; payload: AdjustCampaignBudgetPayload };

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
      ) || "Google Ads mutate request failed.";
  }

  throw new Error(lastError ?? "Google Ads mutate request failed.");
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
      throw new Error("Pause ad mutate is not enabled in Wave 6.");
    case "adjust_campaign_budget": {
      const actionPayload = input.action.payload;
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignBudgets:mutate",
        body: {
          operations: [
            {
              update: {
                resourceName: actionPayload.campaignBudgetResourceName,
                amountMicros: Math.round(actionPayload.proposedAmount * 1_000_000),
              },
              updateMask: "amount_micros",
            },
          ],
        },
      });
      return {
        actionType: input.action.actionType,
        resourceNames: [actionPayload.campaignBudgetResourceName],
        rawResponse: payload,
      } satisfies AdvisorMutationResult;
    }
  }
}

export async function rollbackAdvisorMutation(input: {
  businessId: string;
  accountId: string;
  actionType: "remove_negative_keyword" | "enable_asset" | "enable_ad" | "restore_campaign_budget";
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
      const resourceName = String(input.payload.resourceName ?? "");
      if (!resourceName) {
        throw new Error("No asset resource name was recorded for rollback.");
      }
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "assetGroupAssets:mutate",
        body: {
          operations: [
            {
              update: {
                resourceName,
                status: "ENABLED",
              },
              updateMask: "status",
            },
          ],
        },
      });
      return payload;
    }
    case "enable_ad":
      throw new Error("Enable ad rollback is not enabled in Wave 6.");
    case "restore_campaign_budget": {
      const resourceName = String(input.payload.campaignBudgetResourceName ?? "");
      const previousAmount = Number(input.payload.previousAmount ?? NaN);
      if (!resourceName || !Number.isFinite(previousAmount)) {
        throw new Error("Budget rollback requires the original campaign budget resource and amount.");
      }
      const payload = await googleAdsMutateRequest({
        businessId: input.businessId,
        accountId: input.accountId,
        path: "campaignBudgets:mutate",
        body: {
          operations: [
            {
              update: {
                resourceName,
                amountMicros: Math.round(previousAmount * 1_000_000),
              },
              updateMask: "amount_micros",
            },
          ],
        },
      });
      return payload;
    }
  }
}
