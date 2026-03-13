"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderLabel } from "@/components/integrations/oauth";
import { cn } from "@/lib/utils";
import {
  IntegrationProvider,
  IntegrationState,
} from "@/store/integrations-store";
import {
  BarChart3,
  Facebook,
  Loader2,
  PinIcon,
  Search,
  ShoppingBag,
  Sparkles,
  Target,
  WifiOff,
  Mail,
} from "lucide-react";

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

  const Icon = getProviderIcon(provider);

  return (
    <div
      className={cn(
        "group flex h-full flex-col rounded-2xl border bg-card/95 p-5 shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
        isConnected
          ? "border-emerald-200/70 bg-gradient-to-br from-card via-card to-emerald-50/50"
          : isError || isTimeout
            ? "border-amber-200/80 bg-gradient-to-br from-card via-card to-amber-50/50"
            : "border-border/70 bg-gradient-to-br from-card via-card to-muted/25",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm",
              isConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isError || isTimeout
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-border bg-muted/70 text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {providerLabel}
            </h2>
            <p className="max-w-[34ch] text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <StatusBadge status={state.status} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MetadataTile
          label="Connection"
          value={
            isConnected
              ? "Live and ready"
              : isConnecting
                ? "Connecting now"
                : isError || isTimeout
                  ? "Needs attention"
                  : "Not connected"
          }
          hint={
            isConnected
              ? state.connectedAt
                ? `Connected ${formatDateTime(state.connectedAt)}`
                : "Authorized"
              : isDisconnected
                ? "Connect to start syncing"
                : state.errorMessage ?? "Waiting for authorization"
          }
        />
        <MetadataTile
          label={providerMetaLabel}
          value={providerMetaValue}
          hint={assignedSummaryText}
        />
        <MetadataTile
          label="Last sync"
          value={
            isConnected && state.lastSyncAt
              ? formatDateTime(state.lastSyncAt)
              : isConnected
                ? "Ready to sync"
                : "Unavailable"
          }
          hint={
            isConnected
              ? "Latest provider refresh"
              : "Available after connection"
          }
        />
        <MetadataTile
          label="Linked account"
          value={
            state.providerAccountName ??
            state.providerAccountId ??
            (isConnected ? "Connected workspace" : "Not linked")
          }
          hint={
            assignedPreview.length > 0
              ? `${assignedPreview.join(", ")}${
                  assignedCount > assignedPreview.length
                    ? ` +${assignedCount - assignedPreview.length}`
                    : ""
                }`
              : isConnected
                ? "Assignments can be managed below"
                : "Will appear after connection"
          }
        />
      </div>

      {isError && state.errorMessage ? (
        <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {state.errorMessage}
        </p>
      ) : null}

      {isTimeout && state.errorMessage ? (
        <p className="mt-4 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {state.errorMessage}
        </p>
      ) : null}

      <div className="mt-5 border-t border-border/70 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Next step</p>
            <p className="text-xs text-muted-foreground">
              {isDisconnected
                ? "Connect this provider to start syncing data."
                : isConnected
                  ? "Review or update what Adsecute should use."
                  : "Resolve this connection before continuing."}
            </p>
          </div>
        </div>

      <div className="flex flex-wrap gap-2">
        {isDisconnected ? (
          <Button className="min-w-[140px] flex-1" onClick={() => onConnect(provider)}>
            {primaryActionLabel}
          </Button>
        ) : null}

        {isConnecting ? (
          <>
            <Button className="min-w-[160px] flex-1 cursor-default" tabIndex={-1}>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </Button>
            <Button variant="outline" onClick={() => onCancel(provider)}>
              Cancel
            </Button>
          </>
        ) : null}

        {isConnected ? (
          <>
            <Button
              className="min-w-[180px] flex-1"
              onClick={() => onOpenAssignments(provider)}
            >
              {primaryActionLabel}
            </Button>
            <Button variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDisconnect(provider)}
            >
              Disconnect
            </Button>
          </>
        ) : null}

        {isError ? (
          <>
            <Button className="min-w-[160px] flex-1" onClick={() => onRetry(provider)}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDisconnect(provider)}
            >
              Disconnect
            </Button>
          </>
        ) : null}

        {isTimeout ? (
          <>
            <Button className="min-w-[160px] flex-1" onClick={() => onRetry(provider)}>
              Retry connection
            </Button>
            <Button variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
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
      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
        Connected
      </Badge>
    );
  }
  if (status === "connecting") {
    return <Badge className="border border-sky-200 bg-sky-50 text-sky-700">Connecting</Badge>;
  }
  if (status === "error") {
    return <Badge className="border border-amber-200 bg-amber-50 text-amber-800">Needs attention</Badge>;
  }
  if (status === "timeout") {
    return <Badge className="border border-amber-200 bg-amber-50 text-amber-800">Timed out</Badge>;
  }
  return <Badge className="border border-border bg-muted text-muted-foreground">Not connected</Badge>;
}

function MetadataTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function getProviderIcon(provider: IntegrationProvider) {
  switch (provider) {
    case "meta":
      return Facebook;
    case "google":
      return Target;
    case "ga4":
      return BarChart3;
    case "search_console":
      return Search;
    case "shopify":
      return ShoppingBag;
    case "tiktok":
      return Sparkles;
    case "pinterest":
      return PinIcon;
    case "snapchat":
      return WifiOff;
    case "klaviyo":
      return Mail;
    default:
      return Target;
  }
}
