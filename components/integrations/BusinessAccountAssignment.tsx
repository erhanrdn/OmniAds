"use client";

import { IntegrationProvider, IntegrationState } from "@/store/integrations-store";
import { getProviderLabel } from "@/components/integrations/oauth";

interface BusinessAccountAssignmentProps {
  provider: IntegrationProvider;
  state: IntegrationState;
  onToggleAccount: (provider: IntegrationProvider, accountId: string) => void;
}

export function BusinessAccountAssignment({
  provider,
  state,
  onToggleAccount,
}: BusinessAccountAssignmentProps) {
  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-3">
      <h3 className="text-sm font-semibold">Assign accounts to this business</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Enable the {getProviderLabel(provider)} accounts that should be active for this business.
      </p>

      <div className="mt-3 space-y-2">
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
  );
}
