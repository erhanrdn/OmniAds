import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoIntegrations } from "@/lib/demo-business";
import {
  getIntegrationsByBusiness,
  type IntegrationProviderType,
} from "@/lib/integrations";

const PROVIDERS = [
  "meta",
  "google",
  "tiktok",
  "pinterest",
  "snapchat",
  "klaviyo",
  "shopify",
  "ga4",
  "search_console",
] as const satisfies readonly IntegrationProviderType[];

export type IntegrationStatusResponse = Record<
  (typeof PROVIDERS)[number],
  boolean
>;

export async function getIntegrationStatusByBusiness(
  businessId: string
): Promise<IntegrationStatusResponse> {
  const integrations = (await isDemoBusiness(businessId))
    ? getDemoIntegrations()
    : await getIntegrationsByBusiness(businessId);

  return Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      integrations.some(
        (integration) =>
          integration.provider === provider && integration.status === "connected"
      ),
    ])
  ) as IntegrationStatusResponse;
}
