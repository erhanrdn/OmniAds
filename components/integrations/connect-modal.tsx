"use client";

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
  if (!provider) return null;

  const providerLabel = getProviderLabel(provider);
  const permissions = OAUTH_PERMISSIONS[provider];
  const returnTo = `/integrations/callback/${provider}?businessId=${encodeURIComponent(
    businessId
  )}`;
  const startUrl = getOAuthStartUrl(provider, businessId, returnTo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Connect {providerLabel}</h3>
            <p className="text-sm text-muted-foreground">
              {providerLabel} hesabini baglamak icin {providerLabel} giris ekranina
              yonlendirileceksiniz.
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onContinue(provider);
              window.location.href = startUrl;
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
