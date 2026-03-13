"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchProviderAccountSnapshot,
  type ProviderAccountSnapshot,
  ProviderAccountSnapshotMissingError,
  warmProviderAccountSnapshot,
} from "@/lib/provider-account-client";
import { Loader2, RefreshCw } from "lucide-react";

interface ProviderAccountRow {
  id: string;
  name: string;
  currency?: string;
  timezone?: string;
  isManager?: boolean;
  assigned?: boolean;
}

interface ProviderErrorBody {
  error?: string;
  message?: string;
}

interface SaveSuccessBody {
  success?: boolean;
  assigned_accounts?: string[];
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
    accounts: ProviderAccountRow[],
  ) => void;
}

type FetchState = "idle" | "loading" | "success" | "empty" | "error";

function getTitle(provider: IntegrationProvider | null) {
  if (!provider) return "Assign accounts";
  if (provider === "meta") {
    return "Assign Meta ad accounts to this business";
  }
  if (provider === "google")
    return "Assign Google Ads customer accounts to this business";
  if (provider === "ga4") return "Assign GA4 properties to this business";
  if (provider === "shopify") return "Assign Shopify stores to this business";
  return `Assign ${provider} accounts to this business`;
}

function getMetaFetchPath(businessId: string) {
  return `/integrations/meta/ad-accounts?businessId=${encodeURIComponent(businessId)}`;
}

function getGoogleFetchPath(businessId: string) {
  return `/api/google/accessible-accounts?businessId=${encodeURIComponent(businessId)}`;
}

function getFetchPath(provider: IntegrationProvider, businessId: string) {
  if (provider === "meta") return getMetaFetchPath(businessId);
  if (provider === "google") return getGoogleFetchPath(businessId);
  return null;
}

function getSavePath(provider: IntegrationProvider, businessId: string) {
  if (provider === "meta") {
    return `/businesses/${encodeURIComponent(businessId)}/meta/assign-accounts`;
  }
  return `/businesses/${encodeURIComponent(businessId)}/${provider}/assign-accounts`;
}

function hasErrorMessage(payload: unknown): payload is ProviderErrorBody {
  if (!payload || typeof payload !== "object") return false;
  return "message" in payload && typeof payload.message === "string";
}

function hasAssignedAccounts(payload: unknown): payload is SaveSuccessBody {
  if (!payload || typeof payload !== "object") return false;
  if (!("assigned_accounts" in payload)) return false;
  const maybeIds = payload.assigned_accounts;
  return (
    Array.isArray(maybeIds) && maybeIds.every((id) => typeof id === "string")
  );
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
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const isMeta = provider === "meta";
  const isGoogle = provider === "google";
  const isSupportedProvider = isMeta || isGoogle;
  const initializedForOpenRef = useRef<string | null>(null);
  const latestAssignedAccountIdsRef = useRef<string[]>(assignedAccountIds);

  useEffect(() => {
    latestAssignedAccountIdsRef.current = assignedAccountIds;
  }, [assignedAccountIds]);

  const applySnapshotResult = useCallback(
    (snapshot: ProviderAccountSnapshot) => {
      const list = snapshot.accounts.map((account) => ({
        ...account,
        assigned: snapshot.assignedAccountIds.includes(account.id),
      }));

      console.log("[assignment-modal] ✓ VALID DATA RECEIVED", {
        accountCount: list.length,
        assignedAccounts: list.filter((a) => a.assigned).length,
      });

      setAccounts(list);
      setNoticeMessage(snapshot.notice);
      const hasAssignedFlag = list.some((account) => typeof account.assigned === "boolean");
      const serverAssignedIds = hasAssignedFlag
        ? list.filter((account) => account.assigned === true).map((account) => account.id)
        : latestAssignedAccountIdsRef.current;
      setDraftIds((prev) =>
        initializedForOpenRef.current === `${businessId}:${provider}`
          ? prev
          : serverAssignedIds
      );
      initializedForOpenRef.current = `${businessId}:${provider}`;
      setFetchState(list.length > 0 ? "success" : "empty");
    },
    [businessId, provider]
  );

  const loadAccounts = useCallback(
    async (options?: { preserveExisting?: boolean }) => {
      if (!open || !provider) return;
      if (!isSupportedProvider) {
        setAccounts([]);
        setFetchState("empty");
        setErrorMessage(null);
        setNoticeMessage(null);
        return;
      }

      if (!getFetchPath(provider, businessId)) {
        setAccounts([]);
        setFetchState("empty");
        setErrorMessage(null);
        setNoticeMessage(null);
        return;
      }

      const preserveExisting = options?.preserveExisting === true;
      if (!preserveExisting) {
        setAccounts([]);
        setFetchState("loading");
      } else {
        setIsRefreshing(true);
      }
      setErrorMessage(null);
      setNoticeMessage(null);
      setSaveErrorMessage(null);

      console.log("[assignment-modal] 🔹 FETCH STARTED", {
        provider,
        businessId,
        mode: options?.preserveExisting ? "refresh" : "initial",
      });

      try {
        const snapshot = await fetchProviderAccountSnapshot(provider, businessId);
        applySnapshotResult(snapshot);
      } catch (err) {
        if (err instanceof ProviderAccountSnapshotMissingError) {
          setFetchState("loading");
          setErrorMessage(null);
          setNoticeMessage(
            provider === "google"
              ? "Loading Google Ads accounts..."
              : "Loading ad accounts..."
          );
          try {
            const warmedSnapshot = await warmProviderAccountSnapshot(provider, businessId);
            applySnapshotResult(warmedSnapshot);
            return;
          } catch (warmError) {
            console.error("[assignment-modal] ❌ WARM FETCH EXCEPTION", {
              error: warmError instanceof Error ? warmError.message : String(warmError),
              stack: warmError instanceof Error ? warmError.stack : undefined,
            });
            setErrorMessage(
              provider === "google"
                ? "Unable to retrieve Google Ads accounts. Retry."
                : "Unable to retrieve Meta ad accounts. Retry."
            );
            setFetchState("error");
            return;
          }
        }

        console.error("[assignment-modal] ❌ FETCH EXCEPTION", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        setErrorMessage(
          `We couldn't fetch accessible ${provider === "google" ? "Google Ads" : "Meta"} ad accounts for this connection.`,
        );
        setFetchState("error");
      } finally {
        setIsRefreshing(false);
      }
    },
    [applySnapshotResult, businessId, isSupportedProvider, open, provider],
  );

  useEffect(() => {
    if (!open || !provider) return;
    void loadAccounts();
  }, [businessId, open, provider, loadAccounts]);

  useEffect(() => {
    if (!open) {
      setAccounts([]);
      setFetchState("idle");
      setErrorMessage(null);
      setSaveErrorMessage(null);
      setDraftIds([]);
      setIsSaving(false);
      setIsRefreshing(false);
      setNoticeMessage(null);
      setSearchQuery("");
      initializedForOpenRef.current = null;
    }
  }, [open]);

  const normalizedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone,
        externalId: account.id,
      })),
    [accounts],
  );

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return normalizedAccounts;
    return normalizedAccounts.filter((account) => {
      const byName = account.name.toLowerCase().includes(query);
      const byId = account.externalId.toLowerCase().includes(query);
      return byName || byId;
    });
  }, [normalizedAccounts, searchQuery]);

  function toggleAccount(accountId: string) {
    setDraftIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((item) => item !== accountId)
        : [...prev, accountId],
    );
  }

  async function handleSave() {
    if (!provider || !isSupportedProvider) return;

    setIsSaving(true);
    setSaveErrorMessage(null);
    try {
      const response = await fetch(getSavePath(provider, businessId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ account_ids: draftIds }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setSaveErrorMessage(
          (hasErrorMessage(payload) ? payload.message : null) ??
            "Could not save account assignments.",
        );
        return;
      }

      const savedIds = hasAssignedAccounts(payload)
        ? (payload.assigned_accounts ?? draftIds)
        : draftIds;
      onSave(provider, savedIds, accounts);
      onClose();
    } catch {
      setSaveErrorMessage("Could not save account assignments.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col p-0 sm:max-w-xl"
      >
        <div className="shrink-0 border-b px-6 py-6">
          <SheetHeader className="space-y-2">
            <SheetTitle>{getTitle(provider)}</SheetTitle>
            <SheetDescription>
              Select the accounts Adsecute should use when syncing data for this
              business.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
          {noticeMessage ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <div className="flex items-center justify-between gap-3">
                <span>{noticeMessage}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  onClick={() =>
                    void loadAccounts({ preserveExisting: accounts.length > 0 })
                  }
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          {fetchState === "success" ? (
            <div className="shrink-0 pb-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search ad accounts..."
                  aria-label="Search ad accounts by name"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadAccounts({ preserveExisting: true })}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3">
            {fetchState === "loading" ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {provider === "google"
                    ? "Loading Google Ads accounts..."
                    : "Loading ad accounts..."}
                </span>
              </div>
            ) : null}

            {fetchState === "error" ? (
              <DataEmptyState
                title="Could not load ad accounts"
                description={
                  errorMessage ??
                  `Unable to retrieve ${provider === "google" ? "Google Ads" : "Meta"} accounts. Retry.`
                }
              />
            ) : null}

            {fetchState === "error" ? (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => void loadAccounts()}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : null}

            {fetchState === "empty" ? (
              <DataEmptyState
                title="No ad accounts found"
                description={`No ${provider === "google" ? "Google Ads" : "Meta"} ad accounts are available for this login or the required permissions are missing.`}
              />
            ) : null}

              {fetchState === "success"
                ? filteredAccounts.map((account) => {
                  const checked = draftIds.includes(account.id);
                  return (
                    <label
                      key={account.id}
                      className="flex items-start justify-between gap-4 rounded-lg border bg-background px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {account.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {account.externalId}
                          {account.currency ? ` • ${account.currency}` : ""}
                          {account.timezone ? ` • ${account.timezone}` : ""}
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

              {fetchState === "success" && filteredAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p>No ad accounts found</p>
                  <p className="mt-1 text-xs">Try a different account name</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t px-6 py-6">
          {saveErrorMessage ? (
            <p className="mb-3 text-sm text-destructive">{saveErrorMessage}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                fetchState !== "success" ||
                !provider ||
                !isSupportedProvider
              }
            >
              {isSaving ? "Saving..." : "Save assignments"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
