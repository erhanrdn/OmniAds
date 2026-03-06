"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderLabel } from "@/components/integrations/oauth";
import { IntegrationProvider, IntegrationState } from "@/store/integrations-store";
import { Loader2, Plug } from "lucide-react";

interface IntegrationsCardProps {
  provider: IntegrationProvider;
  description: string;
  state: IntegrationState;
  isExpanded: boolean;
  simpleActions?: boolean;
  connectedDetailText?: string;
  onConnect: (provider: IntegrationProvider) => void;
  onReconnect: (provider: IntegrationProvider) => void;
  onRetry: (provider: IntegrationProvider) => void;
  onCancel: (provider: IntegrationProvider) => void;
  onDisconnect: (provider: IntegrationProvider) => void;
  onToggleManage: (provider: IntegrationProvider) => void;
  onToggleAccount: (provider: IntegrationProvider, accountId: string) => void;
}

export function IntegrationsCard({
  provider,
  description,
  state,
  isExpanded,
  simpleActions = false,
  connectedDetailText,
  onConnect,
  onReconnect,
  onRetry,
  onCancel,
  onDisconnect,
  onToggleManage,
  onToggleAccount,
}: IntegrationsCardProps) {
  const providerLabel = getProviderLabel(provider);
  const isDisconnected = state.status === "disconnected";
  const isConnected = state.status === "connected";
  const isConnecting = state.status === "connecting";
  const isError = state.status === "error";
  const isTimeout = state.status === "timeout";

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
      {connectedDetailText && isConnected && (
        <p className="mb-3 text-xs text-muted-foreground">{connectedDetailText}</p>
      )}

      {isError && state.errorMessage && (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {state.errorMessage}
        </p>
      )}

      {isTimeout && state.errorMessage && (
        <p className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700">
          {state.errorMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {isDisconnected && (
          <Button className="flex-1" onClick={() => onConnect(provider)}>
            Connect
          </Button>
        )}

        {isConnecting && (
          <>
            <Button className="flex-1 cursor-default" tabIndex={-1}>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </Button>
            <Button variant="outline" onClick={() => onCancel(provider)}>
              Cancel
            </Button>
          </>
        )}

        {isConnected && !simpleActions && (
          <>
            <Button className="flex-1" onClick={() => onToggleManage(provider)}>
              {isExpanded ? "Hide Manage" : "Manage"}
            </Button>
            <Button variant="outline" onClick={() => onReconnect(provider)}>
              Reconnect
            </Button>
          </>
        )}

        {isConnected && simpleActions && (
          <Button variant="outline" onClick={() => onDisconnect(provider)}>
            Disconnect
          </Button>
        )}

        {isError && (
          <>
            <Button className="flex-1" onClick={() => onRetry(provider)}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => onDisconnect(provider)}>
              Disconnect
            </Button>
          </>
        )}

        {isTimeout && (
          <>
            <Button className="flex-1" onClick={() => onRetry(provider)}>
              Retry connection
            </Button>
            <Button variant="outline" onClick={() => onDisconnect(provider)}>
              Disconnect
            </Button>
          </>
        )}

        {!simpleActions && !isDisconnected && !isConnecting && !isError && !isTimeout && (
          <Button variant="outline" onClick={() => onDisconnect(provider)}>
            Disconnect
          </Button>
        )}
      </div>

      {isConnected && isExpanded && !simpleActions && (
        <div className="mt-4 rounded-lg border bg-muted/20 p-3">
          <h3 className="text-sm font-semibold">Ad Accounts</h3>
          <div className="mt-2 space-y-2">
            {state.accounts.map((account) => (
              <label
                key={account.id}
                className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
              >
                <span>{account.name}</span>
                <input
                  type="checkbox"
                  checked={account.enabled}
                  onChange={() => onToggleAccount(provider, account.id)}
                />
              </label>
            ))}
          </div>
        </div>
      )}
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
