"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderLabel } from "@/components/integrations/oauth";
import {
  IntegrationProvider,
  IntegrationState,
} from "@/store/integrations-store";
import { Loader2, Plug } from "lucide-react";

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

  const statusText = isConnected
    ? hasAssignments
      ? `Connected, ${assignedCount} accounts assigned`
      : "Connected, no accounts assigned"
    : isDisconnected
      ? "Disconnected"
      : undefined;

  const assignedPreview = state.accounts
    .filter((account) => assignedAccountIds.includes(account.id))
    .slice(0, 2)
    .map((account) => account.name);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Plug className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">{providerLabel}</h2>
        </div>
        <StatusBadge status={state.status} />
      </div>

      <p className="mb-3 text-sm text-muted-foreground">{description}</p>

      {statusText ? (
        <p className="mb-2 text-xs text-muted-foreground">{statusText}</p>
      ) : null}

      {state.connectedAt && isConnected && (
        <p className="mb-1 text-xs text-muted-foreground">
          Connected at: {new Date(state.connectedAt).toLocaleString()}
        </p>
      )}
      {state.lastSyncAt && isConnected && (
        <p className="mb-1 text-xs text-muted-foreground">
          Last sync: {new Date(state.lastSyncAt).toLocaleString()}
        </p>
      )}
      {isConnected ? (
        <p className="mb-1 text-xs text-muted-foreground">
          Assigned accounts: {assignedCount}
        </p>
      ) : null}
      {assignedPreview.length > 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {assignedPreview.join(", ")}
          {assignedCount > assignedPreview.length
            ? ` +${assignedCount - assignedPreview.length}`
            : ""}
        </p>
      ) : null}
      {connectedDetailText && isConnected ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {connectedDetailText}
        </p>
      ) : null}

      {isError && state.errorMessage ? (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {state.errorMessage}
        </p>
      ) : null}

      {isTimeout && state.errorMessage ? (
        <p className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700">
          {state.errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isDisconnected ? (
          <Button className="flex-1" onClick={() => onConnect(provider)}>
            Connect
          </Button>
        ) : null}

        {isConnecting ? (
          <>
            <Button className="flex-1 cursor-default" tabIndex={-1}>
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
            <Button className="flex-1" onClick={() => onOpenAssignments(provider)}>
              {connectedActionLabel ??
                (hasAssignments ? "Manage assignments" : "Assign accounts")}
            </Button>
            <Button variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
            <Button variant="outline" onClick={() => onDisconnect(provider)}>
              Disconnect
            </Button>
          </>
        ) : null}

        {isError ? (
          <>
            <Button className="flex-1" onClick={() => onRetry(provider)}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => onDisconnect(provider)}>
              Disconnect
            </Button>
          </>
        ) : null}

        {isTimeout ? (
          <>
            <Button className="flex-1" onClick={() => onRetry(provider)}>
              Retry connection
            </Button>
            <Button variant="outline" onClick={() => onDisconnect(provider)}>
              Disconnect
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: IntegrationState["status"] }) {
  if (status === "connected") {
    return <Badge className="bg-green-600 text-white">connected</Badge>;
  }
  if (status === "connecting") {
    return <Badge className="bg-blue-600 text-white">connecting</Badge>;
  }
  if (status === "error") {
    return <Badge variant="destructive">error</Badge>;
  }
  if (status === "timeout") {
    return <Badge className="bg-yellow-500 text-white">timeout</Badge>;
  }
  return <Badge variant="secondary">disconnected</Badge>;
}
