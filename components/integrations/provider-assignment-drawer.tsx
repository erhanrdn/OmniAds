"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IntegrationProvider } from "@/store/integrations-store";
import { DataEmptyState } from "@/components/states/DataEmptyState";

interface ProviderAccountRow {
  id: string;
  name: string;
  currency?: string;
  timezone?: string;
}

interface ProviderAssignmentDrawerProps {
  open: boolean;
  provider: IntegrationProvider | null;
  businessId: string;
  assignedAccountIds: string[];
  onClose: () => void;
  onSave: (
    provider: IntegrationProvider,
    accountIds: string[],
    accounts: ProviderAccountRow[]
  ) => void;
}

function getTitle(provider: IntegrationProvider | null) {
  if (!provider) return "Assign accounts";
  if (provider === "meta") {
    return "Assign Meta ad accounts to this business";
  }
  if (provider === "google") return "Assign Google Ads customer accounts to this business";
  if (provider === "ga4") return "Assign GA4 properties to this business";
  if (provider === "shopify") return "Assign Shopify stores to this business";
  return `Assign ${provider} accounts to this business`;
}

function getFetchPath(provider: IntegrationProvider, businessId: string) {
  if (provider === "meta") {
    return `/integrations/meta/ad-accounts?businessId=${encodeURIComponent(businessId)}`;
  }
  if (provider === "google") {
    return `/integrations/google/customer-accounts?businessId=${encodeURIComponent(businessId)}`;
  }
  if (provider === "ga4") {
    return `/integrations/ga4/properties?businessId=${encodeURIComponent(businessId)}`;
  }
  if (provider === "shopify") {
    return `/integrations/shopify/stores?businessId=${encodeURIComponent(businessId)}`;
  }
  return `/integrations/${provider}/accounts?businessId=${encodeURIComponent(businessId)}`;
}

function getSavePath(provider: IntegrationProvider, businessId: string) {
  if (provider === "meta") {
    return `/businesses/${encodeURIComponent(businessId)}/meta/assign-accounts`;
  }
  return `/businesses/${encodeURIComponent(businessId)}/${provider}/assign-accounts`;
}

export function ProviderAssignmentDrawer({
  open,
  provider,
  businessId,
  assignedAccountIds,
  onClose,
  onSave,
}: ProviderAssignmentDrawerProps) {
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<ProviderAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !provider) return;

    let isCancelled = false;

    async function fetchAccounts() {
      setIsLoading(true);
      setDraftIds(assignedAccountIds);
      try {
        const response = await fetch(getFetchPath(provider, businessId), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          if (!isCancelled) setAccounts([]);
          return;
        }

        const payload = await response.json();
        const list = Array.isArray(payload) ? payload : payload?.accounts;

        if (!isCancelled) {
          setAccounts(Array.isArray(list) ? list : []);
        }
      } catch {
        if (!isCancelled) {
          setAccounts([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchAccounts();

    return () => {
      isCancelled = true;
    };
  }, [open, provider, businessId, assignedAccountIds]);

  const normalizedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        externalId: account.id,
      })),
    [accounts]
  );

  function toggleAccount(accountId: string) {
    setDraftIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((item) => item !== accountId)
        : [...prev, accountId]
    );
  }

  async function handleSave() {
    if (!provider) return;

    setIsSaving(true);
    try {
      const response = await fetch(getSavePath(provider, businessId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ account_ids: draftIds }),
      });

      if (!response.ok) {
        return;
      }

      onSave(provider, draftIds, accounts);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="space-y-2">
          <SheetTitle>{getTitle(provider)}</SheetTitle>
          <SheetDescription>
            Select the accounts OmniAds should use when syncing data for this business.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Loading ad accounts...
            </div>
          ) : null}

          {!isLoading && normalizedAccounts.length === 0 ? (
            <DataEmptyState
              title="No ad accounts found"
              description="We could not find any Meta ad accounts accessible with your login."
            />
          ) : null}

          {!isLoading
            ? normalizedAccounts.map((account) => {
                const checked = draftIds.includes(account.id);
                return (
                  <label
                    key={account.id}
                    className="flex items-start justify-between gap-4 rounded-lg border bg-background px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{account.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account.externalId}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccount(account.id)}
                      className="mt-0.5"
                    />
                  </label>
                );
              })
            : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading || !provider}>
            {isSaving ? "Saving..." : "Save assignments"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
