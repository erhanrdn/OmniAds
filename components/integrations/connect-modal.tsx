"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getOAuthStartUrl,
  getProviderLabel,
  OAUTH_PERMISSIONS,
} from "@/components/integrations/oauth";
import { IntegrationProvider } from "@/store/integrations-store";
import { ExternalLink, X } from "lucide-react";

interface ConnectModalProps {
  provider: IntegrationProvider | null;
  businessId: string;
  onClose: () => void;
  onContinue: (provider: IntegrationProvider) => void;
}

export function ConnectModal({
  provider,
  businessId,
  onClose,
  onContinue,
}: ConnectModalProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!provider) return null;

  // Local const so TypeScript narrows the type inside closures too.
  const activeProvider: IntegrationProvider = provider;

  const isShopify = activeProvider === "shopify";
  const providerLabel = getProviderLabel(activeProvider);
  const permissions = OAUTH_PERMISSIONS[activeProvider];
  const currentSearch = searchParams.toString();
  const returnTo =
    pathname === "/"
      ? "/integrations"
      : `${pathname}${currentSearch ? `?${currentSearch}` : ""}`;

  function handleContinue() {
    const startUrl = getOAuthStartUrl(activeProvider, businessId, returnTo);
    onContinue(activeProvider);
    window.location.href = startUrl;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Connect {providerLabel}</h3>
            <p className="text-sm text-muted-foreground">
              {isShopify
                ? "Install Adsecute from the Shopify App Store to connect your store."
                : `You will be redirected to ${providerLabel} to authorize your account.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isShopify ? (
          <div className="mb-4 rounded-lg border bg-muted/25 p-4">
            <p className="text-sm font-medium">How to connect Shopify</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Shopify connections must be initiated from the Shopify App Store.
              Click the button below to open the Adsecute listing, then click{" "}
              <strong>Install</strong> in Shopify to complete the connection.
            </p>
            <a
              href="https://apps.shopify.com/adsecute"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Open Shopify App Store
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/25 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Requested permissions
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {permissions.map((permission) => (
                <li key={permission}>- {permission}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!isShopify && (
            <Button onClick={handleContinue}>Continue</Button>
          )}
        </div>
      </div>
    </div>
  );
}
