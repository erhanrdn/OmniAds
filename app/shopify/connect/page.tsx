import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth-routing";
import { ShopifyConnectClientPage } from "@/components/shopify/shopify-connect-client-page";

interface ShopifyConnectPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export default async function ShopifyConnectPage({
  searchParams,
}: ShopifyConnectPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const shop = getSingleParam(resolvedSearchParams.shop)?.trim() ?? "";
  const hmac = getSingleParam(resolvedSearchParams.hmac)?.trim() ?? "";
  const host = getSingleParam(resolvedSearchParams.host)?.trim() ?? "";
  const embedded =
    getSingleParam(resolvedSearchParams.embedded)?.trim() ?? "";
  const timestamp =
    getSingleParam(resolvedSearchParams.timestamp)?.trim() ?? "";
  const returnTo = sanitizeNextPath(
    getSingleParam(resolvedSearchParams.returnTo),
  );

  // App Store installs first land on the app URL with signed shop context.
  // Redirect straight into OAuth so merchants never interact with the UI pre-auth.
  if (shop && hmac && timestamp) {
    const startUrl = new URL("/api/oauth/shopify/start", "http://localhost");
    startUrl.searchParams.set("shop", shop);
    startUrl.searchParams.set("hmac", hmac);
    startUrl.searchParams.set("timestamp", timestamp);
    if (host) startUrl.searchParams.set("host", host);
    if (embedded) startUrl.searchParams.set("embedded", embedded);
    if (returnTo) startUrl.searchParams.set("returnTo", returnTo);
    redirect(`${startUrl.pathname}?${startUrl.searchParams.toString()}`);
  }

  return <ShopifyConnectClientPage />;
}
