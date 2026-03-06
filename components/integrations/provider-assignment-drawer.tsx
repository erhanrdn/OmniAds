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
import {
  IntegrationAdAccount,
  IntegrationProvider,
} from "@/store/integrations-store";
import { getProviderLabel } from "@/components/integrations/oauth";

interface ProviderAssignmentDrawerProps {
  open: boolean;
  provider: IntegrationProvider | null;
  accounts: IntegrationAdAccount[];
  assignedAccountIds: string[];
  onClose: () => void;
  onSave: (provider: IntegrationProvider, accountIds: string[]) => void;
}

function getTitle(provider: IntegrationProvider | null) {
  if (!provider) return "Assign accounts";
  if (provider === "meta") {
    return "Assign Meta ad accounts to this business";
  }
  if (provider === "google") return "Assign Google Ads customer accounts to this business";
  if (provider === "ga4") return "Assign GA4 properties to this business";
  if (provider === "shopify") return "Assign Shopify stores to this business";
  return `Assign ${getProviderLabel(provider)} accounts to this business`;
}

export function ProviderAssignmentDrawer({
  open,
  provider,
  accounts,
  assignedAccountIds,
  onClose,
  onSave,
}: ProviderAssignmentDrawerProps) {
  const [draftIds, setDraftIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraftIds(assignedAccountIds);
  }, [open, assignedAccountIds]);

  const normalizedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        ...account,
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

  function handleSave() {
    if (!provider) return;
    onSave(provider, draftIds);
    onClose();
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
          {normalizedAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No accounts found yet for this provider.
            </div>
          ) : (
            normalizedAccounts.map((account) => {
              const checked = draftIds.includes(account.id);
              return (
                <label
                  key={account.id}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Account ID: {account.externalId}
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
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save assignments</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
