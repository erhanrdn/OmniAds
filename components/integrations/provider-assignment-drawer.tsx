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

interface ProviderErrorBody {
  error?: string;
  message?: string;
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

type FetchState = "idle" | "loading" | "success" | "empty" | "error";

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

function getMetaFetchPath(businessId: string) {
  return `/integrations/meta/ad-accounts?businessId=${encodeURIComponent(businessId)}`;
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
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isMeta = provider === "meta";

  const loadAccounts = useMemo(
    () => async () => {
      if (!open || !provider) return;
      if (!isMeta) {
        setAccounts([]);
        setFetchState("empty");
        setErrorMessage(null);
        return;
      }

      setDraftIds(assignedAccountIds);
      setAccounts([]);
      setFetchState("loading");
      setErrorMessage(null);
      try {
        const response = await fetch(getMetaFetchPath(businessId), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        const payload = (await response.json().catch(() => null)) as
          | ProviderErrorBody
          | { data?: ProviderAccountRow[] }
          | null;

        if (!response.ok) {
          setErrorMessage(
            payload?.message ??
              "We couldn't fetch accessible Meta ad accounts for this connection."
          );
          setFetchState("error");
          return;
        }

        const list = payload?.data;
        if (!Array.isArray(list)) {
          setErrorMessage("Invalid ad account response received from backend.");
          setFetchState("error");
          return;
        }

        setAccounts(list);
        setFetchState(list.length > 0 ? "success" : "empty");
      } catch {
        setErrorMessage("We couldn't fetch accessible Meta ad accounts for this connection.");
        setFetchState("error");
      }
    },
    [assignedAccountIds, businessId, isMeta, open, provider]
  );

  useEffect(() => {
    if (!open || !provider) return;
    let isCancelled = false;

    (async () => {
      if (isCancelled) return;
      await loadAccounts();
    })();

    return () => {
      isCancelled = true;
    };
  }, [open, provider, loadAccounts]);

  useEffect(() => {
    if (!open) {
      setAccounts([]);
      setFetchState("idle");
      setErrorMessage(null);
      setDraftIds([]);
      setIsSaving(false);
    }
  }, [open]);

  const normalizedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
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
    if (!provider || !isMeta) return;

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
          {fetchState === "loading" ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Loading ad accounts...
            </div>
          ) : null}

          {fetchState === "error" ? (
            <DataEmptyState
              title="Could not load ad accounts"
              description={
                errorMessage ??
                "We couldn't fetch accessible Meta ad accounts for this connection."
              }
            />
          ) : null}

          {fetchState === "error" ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={loadAccounts}>
                Retry
              </Button>
            </div>
          ) : null}

          {fetchState === "empty" ? (
            <DataEmptyState
              title="No ad accounts found"
              description="No Meta ad accounts are available for this login or the required permissions are missing."
            />
          ) : null}

          {fetchState === "success"
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
                        {account.currency ? ` • ${account.currency}` : ""}
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
          <Button
            onClick={handleSave}
            disabled={isSaving || fetchState !== "success" || !provider || !isMeta}
          >
            {isSaving ? "Saving..." : "Save assignments"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
