"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getOAuthStartUrl,
  getProviderLabel,
  OAUTH_PERMISSIONS,
} from "@/components/integrations/oauth";
import { IntegrationProvider } from "@/store/integrations-store";
import { X } from "lucide-react";

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
  const [shopDomain, setShopDomain] = useState("");
  const [shopError, setShopError] = useState<string | null>(null);

  if (!provider) return null;

  // Local const so TypeScript narrows the type inside closures too.
  const activeProvider: IntegrationProvider = provider;

  const isShopify = activeProvider === "shopify";
  const providerLabel = getProviderLabel(activeProvider);
  const permissions = OAUTH_PERMISSIONS[activeProvider];
  const returnTo = `/integrations/callback/${activeProvider}?businessId=${encodeURIComponent(
    businessId,
  )}`;

  function handleContinue() {
    if (isShopify) {
      const trimmed = shopDomain.trim();
      if (!trimmed) {
        setShopError("Please enter your Shopify store name.");
        return;
      }
      setShopError(null);
    }
    const startUrl = getOAuthStartUrl(
      activeProvider,
      businessId,
      returnTo,
      isShopify ? { shop: shopDomain.trim() } : undefined,
    );
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
                ? "Enter your Shopify store name to connect."
                : `You will be redirected to ${providerLabel} to authorize your account.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            onClick={() => {
              setShopDomain("");
              setShopError(null);
              onClose();
            }}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isShopify && (
          <div className="mb-4">
            <label
              htmlFor="shop-domain"
              className="mb-1.5 block text-sm font-medium"
            >
              Store name
            </label>
            <div className="flex items-center gap-0">
              <input
                id="shop-domain"
                type="text"
                placeholder="mystore"
                value={shopDomain}
                onChange={(e) => {
                  setShopDomain(e.target.value);
                  if (shopError) setShopError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleContinue();
                }}
                className="flex-1 rounded-l-md border border-r-0 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="inline-flex items-center rounded-r-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                .myshopify.com
              </span>
            </div>
            {shopError && (
              <p className="mt-1 text-xs text-destructive">{shopError}</p>
            )}
          </div>
        )}

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

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShopDomain("");
              setShopError(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleContinue}>Continue</Button>
        </div>
      </div>
    </div>
  );
}
