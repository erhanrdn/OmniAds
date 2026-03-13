import { useAppStore, type Business } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";

export const AUTH_BOOTSTRAP_CACHE_KEY = "omniads_auth_bootstrap_at";

interface WorkspacePayload {
  userId: string;
  businesses: Business[];
  activeBusinessId: string | null;
}

export function clearAuthScopedClientState() {
  useAppStore.getState().clearWorkspaceState();
  useIntegrationsStore.getState().clearAllState();

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(AUTH_BOOTSTRAP_CACHE_KEY);
  }
}

export function applyAuthenticatedWorkspace(payload: WorkspacePayload) {
  const currentOwnerId = useAppStore.getState().workspaceOwnerId;
  if (currentOwnerId && currentOwnerId !== payload.userId) {
    useIntegrationsStore.getState().clearAllState();
  }
  useAppStore
    .getState()
    .setWorkspaceSnapshot(payload.userId, payload.businesses, payload.activeBusinessId);
}

export function replaceAuthenticatedWorkspace(payload: WorkspacePayload) {
  clearAuthScopedClientState();
  useAppStore
    .getState()
    .setWorkspaceSnapshot(payload.userId, payload.businesses, payload.activeBusinessId);
}
