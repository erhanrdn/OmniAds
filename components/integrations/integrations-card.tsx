"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderLabel } from "@/components/integrations/oauth";
import {
  GoogleAdsSyncProgress,
  GoogleAdsSyncProgressSkeleton,
  shouldRenderGoogleAdsSyncProgress,
} from "@/components/google-ads/google-ads-sync-progress";
import {
  MetaSyncProgress,
  MetaSyncProgressSkeleton,
  shouldRenderMetaSyncProgress,
} from "@/components/meta/meta-sync-progress";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import type { MetaStatusResponse } from "@/lib/meta/status-types";
import { cn } from "@/lib/utils";
import {
  IntegrationProvider,
  ProviderViewState,
} from "@/store/integrations-store";
import { Loader2 } from "lucide-react";
import Image from "next/image";

interface IntegrationsCardProps {
  provider: IntegrationProvider;
  description: string;
  view: ProviderViewState;
  language?: "en" | "tr";
  syncNotice?: string | null;
  syncNoticeTone?: "info" | "warning" | "error";
  metaSyncStatus?: MetaStatusResponse | null;
  metaSyncLoading?: boolean;
  googleSyncStatus?: GoogleAdsStatusResponse | null;
  googleSyncLoading?: boolean;
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
  view,
  language = "en",
  syncNotice,
  syncNoticeTone = "info",
  metaSyncStatus,
  metaSyncLoading = false,
  googleSyncStatus,
  googleSyncLoading = false,
  onConnect,
  onReconnect,
  onRetry,
  onCancel,
  onDisconnect,
  onOpenAssignments,
}: IntegrationsCardProps) {
  const providerLabel = getProviderLabel(provider);
  const isDisconnected = view.status === "disconnected";
  const isLoading = view.status === "loading_data";
  const isNeedsAssignment = view.status === "needs_assignment";
  const isReady = view.status === "ready";
  const isDegraded = view.status === "degraded";
  const isActionRequired = view.status === "action_required";
  const isShopify = provider === "shopify";
  const logoSrc = getProviderLogo(provider);
  const shouldShowMetaProgress =
    provider === "meta" && shouldRenderMetaSyncProgress(metaSyncStatus);
  const shouldShowGoogleProgress =
    provider === "google" && shouldRenderGoogleAdsSyncProgress(googleSyncStatus, "compact");
  const syncNoticeClasses =
    syncNoticeTone === "warning"
      ? "border-amber-300/40 bg-amber-50 text-amber-800"
      : syncNoticeTone === "error"
        ? "border-rose-300/40 bg-rose-50 text-rose-800"
        : "border-blue-300/30 bg-blue-50 text-blue-800";

  return (
    <div
      className={cn(
        "group flex h-full flex-col rounded-xl border bg-card/95 p-3 shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        isReady || isDegraded
          ? "border-emerald-200/70 bg-gradient-to-br from-card via-card to-emerald-50/50"
          : isLoading || isNeedsAssignment
            ? "border-sky-200/80 bg-gradient-to-br from-card via-card to-sky-50/50"
            : isActionRequired
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
        <StatusBadge status={view.status} />
      </div>

      <div className="mt-3 grid gap-x-3 gap-y-2 sm:grid-cols-2">
        <CompactMetaRow label="Connection" value={view.connectionLabel} />
        <CompactMetaRow label={view.detailLabel} value={view.detailValue} />
        <CompactMetaRow label={view.lastSyncLabel} value={formatDisplayValue(view.lastSyncValue)} />
        <CompactMetaRow label={view.accountLabel} value={view.accountValue} />
      </div>

      {view.notice ? (
        <p className="mt-2 rounded-lg border border-sky-300/30 bg-sky-50 px-2.5 py-2 text-[11px] leading-4 text-sky-800">
          {view.notice}
        </p>
      ) : null}

      {provider === "meta" && metaSyncLoading ? (
        <div className="mt-2">
          <MetaSyncProgressSkeleton variant="compact" />
        </div>
      ) : shouldShowMetaProgress && metaSyncStatus ? (
        <div className="mt-2">
          <MetaSyncProgress
            status={metaSyncStatus}
            language={language}
            variant="compact"
          />
        </div>
      ) : shouldShowGoogleProgress && googleSyncStatus ? (
        <div className="mt-2">
          <GoogleAdsSyncProgress status={googleSyncStatus} variant="compact" />
        </div>
      ) : provider === "google" && googleSyncLoading ? (
        <div className="mt-2">
          <GoogleAdsSyncProgressSkeleton variant="compact" />
        </div>
      ) : syncNotice ? (
        <p className={cn("mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-4", syncNoticeClasses)}>
          {syncNotice}
        </p>
      ) : null}

      {isNeedsAssignment ? (
        <p className="mt-2 rounded-lg border border-sky-300/30 bg-sky-50 px-2.5 py-2 text-[11px] leading-4 text-sky-800">
          {view.assignedSummary}
        </p>
      ) : null}

      {isActionRequired && view.errorMessage ? (
        <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
          {view.errorMessage}
        </p>
      ) : null}

      <div className="mt-3 border-t border-border/70 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {isDisconnected ? (
            <Button size="sm" className="min-w-[104px]" onClick={() => onConnect(provider)}>
              {view.primaryActionLabel}
            </Button>
          ) : null}

          {isLoading ? (
            <>
              <Button size="sm" className="min-w-[118px] cursor-default" tabIndex={-1}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading data...
              </Button>
              <Button size="sm" variant="outline" onClick={() => onCancel(provider)}>
                Cancel
              </Button>
            </>
          ) : null}

          {view.isConnected && !isLoading && !isActionRequired ? (
            <>
              <Button
                size="sm"
                className="min-w-[126px]"
                disabled={isShopify}
                tabIndex={isShopify ? -1 : undefined}
                onClick={() => onOpenAssignments(provider)}
              >
                {view.primaryActionLabel}
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

          {isActionRequired ? (
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
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderViewState["status"] }) {
  if (status === "ready") {
    return (
      <Badge className="border border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
        Connected
      </Badge>
    );
  }
  if (status === "degraded") {
    return <Badge className="border border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">Degraded</Badge>;
  }
  if (status === "loading_data") {
    return <Badge className="border border-sky-200 bg-sky-50 text-[10px] text-sky-700">Loading</Badge>;
  }
  if (status === "needs_assignment") {
    return <Badge className="border border-sky-200 bg-sky-50 text-[10px] text-sky-700">Needs setup</Badge>;
  }
  if (status === "action_required") {
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

function formatDisplayValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function getProviderLogo(provider: IntegrationProvider): string | null {
  switch (provider) {
    case "meta": return "/platform-logos/Meta.png";
    case "google": return "/platform-logos/googleAds.svg";
    case "ga4": return "/platform-logos/GA4.svg";
    case "search_console": return "/platform-logos/searchconsole.svg";
    case "shopify": return "/platform-logos/shopify_glyph.svg";
    case "tiktok": return "/platform-logos/tiktok.svg";
    case "pinterest": return "/platform-logos/Pinterest.svg";
    case "snapchat": return "/platform-logos/snapchat.svg";
    case "klaviyo": return "/platform-logos/Klaviyo.svg";
    default: return null;
  }
}
