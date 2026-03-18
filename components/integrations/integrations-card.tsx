"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderLabel } from "@/components/integrations/oauth";
import { cn } from "@/lib/utils";
import {
  IntegrationProvider,
  IntegrationState,
} from "@/store/integrations-store";
import { Loader2 } from "lucide-react";
import Image from "next/image";

interface IntegrationsCardProps {
  provider: IntegrationProvider;
  description: string;
  state: IntegrationState;
  connectedDetailText?: string;
  connectedActionLabel?: string;
  assignedAccountIds: string[];
  onConnect: (provider: IntegrationProvider) => void;
  onReconnect: (provider: IntegrationProvider) => void;
  onRetry: (provider: IntegrationProvider) => void;
  onCancel: (provider: IntegrationProvider) => void;
  onDisconnect: (provider: IntegrationProvider) => void;
  onOpenAssignments: (provider: IntegrationProvider) => void;
}

export function IntegrationsCard({
  provider,
  description,
  state,
  connectedDetailText,
  connectedActionLabel,
  assignedAccountIds,
  onConnect,
  onReconnect,
  onRetry,
  onCancel,
  onDisconnect,
  onOpenAssignments,
}: IntegrationsCardProps) {
  const providerLabel = getProviderLabel(provider);
  const isDisconnected = state.status === "disconnected";
  const isConnected = state.status === "connected";
  const isConnecting = state.status === "connecting";
  const isError = state.status === "error";
  const isTimeout = state.status === "timeout";
  const assignedCount = assignedAccountIds.length;
  const hasAssignments = assignedCount > 0;
  const providerMetaLabel =
    provider === "ga4"
      ? "Property"
      : provider === "search_console"
        ? "Site"
        : provider === "klaviyo"
          ? "Workspace"
        : "Assigned";
  const providerMetaValue =
    isConnected && connectedDetailText
      ? connectedDetailText.replace(/^Property:\s*/i, "").replace(/^Site:\s*/i, "")
      : isConnected
        ? hasAssignments
          ? `${assignedCount} ${assignedCount === 1 ? "account" : "accounts"}`
          : "Not configured yet"
        : "Connect to begin setup";
  const primaryActionLabel = isDisconnected
    ? "Connect"
    : connectedActionLabel ??
      (hasAssignments ? "Manage assignments" : "Finish setup");
  const assignedSummaryText =
    provider === "ga4"
      ? connectedDetailText
        ? "Analytics property linked"
        : "No GA4 property selected"
      : provider === "search_console"
        ? connectedDetailText
          ? "Search Console property selected"
          : "No Search Console property selected"
        : provider === "klaviyo"
          ? connectedDetailText
            ? "Lifecycle intelligence ready"
            : "No workspace linked yet"
        : hasAssignments
          ? `${assignedCount} ${assignedCount === 1 ? "account" : "accounts"} assigned`
          : "No accounts assigned";

  const assignedPreview = state.accounts
    .filter((account) => assignedAccountIds.includes(account.id))
    .slice(0, 2)
    .map((account) => account.name);

  const logoSrc = getProviderLogo(provider);

  return (
    <div
      className={cn(
        "group flex h-full flex-col rounded-xl border bg-card/95 p-3 shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        isConnected
          ? "border-emerald-200/70 bg-gradient-to-br from-card via-card to-emerald-50/50"
          : isError || isTimeout
            ? "border-amber-200/80 bg-gradient-to-br from-card via-card to-amber-50/50"
            : "border-border/70 bg-gradient-to-br from-card via-card to-muted/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-white dark:bg-muted/50">
            {logoSrc ? (
              <Image src={logoSrc} alt={providerLabel} width={20} height={20} className="object-contain" />
            ) : null}
          </div>
          <div className="min-w-0 space-y-0.5">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {providerLabel}
            </h2>
            <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <StatusBadge status={state.status} />
      </div>

      <div className="mt-3 grid gap-x-3 gap-y-2 sm:grid-cols-2">
        <CompactMetaRow
          label="Connection"
          value={
            isConnected
              ? "Live"
              : isConnecting
                ? "Connecting"
                : isError || isTimeout
                  ? "Needs attention"
                  : "Not connected"
          }
        />
        <CompactMetaRow
          label={providerMetaLabel}
          value={
            provider === "ga4" || provider === "search_console" || provider === "klaviyo"
              ? providerMetaValue
              : hasAssignments
                ? String(assignedCount)
                : "0"
          }
        />
        <CompactMetaRow
          label="Last sync"
          value={
            isConnected && state.lastSyncAt
              ? formatShortDateTime(state.lastSyncAt)
              : isConnected
                ? "Ready"
                : "—"
          }
        />
        <CompactMetaRow
          label="Account"
          value={
            state.providerAccountName ??
            state.providerAccountId ??
            (isConnected ? "Linked workspace" : "—")
          }
        />
      </div>

      {isError && state.errorMessage ? (
        <p className="mt-2 rounded-lg border border-destructive/25 bg-destructive/8 px-2.5 py-2 text-[11px] leading-4 text-destructive">
          {state.errorMessage}
        </p>
      ) : null}

      {isTimeout && state.errorMessage ? (
        <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
          {state.errorMessage}
        </p>
      ) : null}

      <div className="mt-3 border-t border-border/70 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {isDisconnected ? (
          <Button size="sm" className="min-w-[104px]" onClick={() => onConnect(provider)}>
            {primaryActionLabel}
          </Button>
        ) : null}

        {isConnecting ? (
          <>
            <Button size="sm" className="min-w-[118px] cursor-default" tabIndex={-1}>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCancel(provider)}>
              Cancel
            </Button>
          </>
        ) : null}

        {isConnected ? (
          <>
            <Button
              size="sm"
              className="min-w-[126px]"
              onClick={() => onOpenAssignments(provider)}
            >
              {primaryActionLabel}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="px-2.5 text-muted-foreground hover:text-destructive"
              onClick={() => onDisconnect(provider)}
            >
              Disconnect
            </Button>
          </>
        ) : null}

        {isError ? (
          <>
            <Button size="sm" className="min-w-[108px]" onClick={() => onRetry(provider)}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="px-2.5 text-muted-foreground hover:text-destructive"
              onClick={() => onDisconnect(provider)}
            >
              Disconnect
            </Button>
          </>
        ) : null}

        {isTimeout ? (
          <>
            <Button size="sm" className="min-w-[124px]" onClick={() => onRetry(provider)}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="px-2.5 text-muted-foreground hover:text-destructive"
              onClick={() => onDisconnect(provider)}
            >
              Disconnect
            </Button>
          </>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: IntegrationState["status"] }) {
  if (status === "connected") {
    return (
      <Badge className="border border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
        Connected
      </Badge>
    );
  }
  if (status === "connecting") {
    return <Badge className="border border-sky-200 bg-sky-50 text-[10px] text-sky-700">Connecting</Badge>;
  }
  if (status === "error") {
    return <Badge className="border border-amber-200 bg-amber-50 text-[10px] text-amber-800">Needs setup</Badge>;
  }
  if (status === "timeout") {
    return <Badge className="border border-amber-200 bg-amber-50 text-[10px] text-amber-800">Needs setup</Badge>;
  }
  return <Badge className="border border-border bg-muted text-[10px] text-muted-foreground">Not connected</Badge>;
}

function CompactMetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-2 text-xs">
      <p className="font-medium text-muted-foreground">{label}:</p>
      <p className="truncate font-medium text-foreground">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatShortDateTime(value: string) {
  return new Date(value).toLocaleDateString();
}

function getProviderLogo(provider: IntegrationProvider): string | null {
  switch (provider) {
    case "meta": return "/platform-logos/Meta.png";
    case "google": return "/platform-logos/googleAds.svg";
    case "ga4": return "/platform-logos/GA4.svg";
    case "search_console": return "/platform-logos/searchconsole.svg";
    case "shopify": return "/platform-logos/shopify.svg";
    case "tiktok": return "/platform-logos/tiktok.svg";
    case "pinterest": return "/platform-logos/Pinterest.svg";
    case "snapchat": return "/platform-logos/snapchat.svg";
    case "klaviyo": return "/platform-logos/Klaviyo.svg";
    default: return null;
  }
}
