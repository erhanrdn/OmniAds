import {
  APP_STORE_PERSIST_KEY,
  useAppStore,
  type Business,
} from "@/store/app-store";
import {
  INTEGRATIONS_STORE_PERSIST_KEY,
  useIntegrationsStore,
} from "@/store/integrations-store";
import { clearAppQueryClient } from "@/lib/query-client";

export const AUTH_BOOTSTRAP_CACHE_KEY = "omniads_auth_bootstrap_at";

interface WorkspacePayload {
  userId: string;
  businesses: Business[];
  activeBusinessId: string | null;
}

export function clearAuthScopedClientState() {
  useAppStore.getState().clearWorkspaceState();
  useAppStore.getState().setAuthBootstrapStatus("idle");
  useIntegrationsStore.getState().clearAllState();
  clearAppQueryClient();

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(AUTH_BOOTSTRAP_CACHE_KEY);
    window.localStorage.removeItem(APP_STORE_PERSIST_KEY);
    window.localStorage.removeItem(INTEGRATIONS_STORE_PERSIST_KEY);
  }
}

export function applyAuthenticatedWorkspace(payload: WorkspacePayload) {
  const currentOwnerId = useAppStore.getState().workspaceOwnerId;
  if (currentOwnerId && currentOwnerId !== payload.userId) {
    useIntegrationsStore.getState().clearAllState();
    clearAppQueryClient();
  }
  useIntegrationsStore
    .getState()
    .retainBusinesses(payload.businesses.map((business) => business.id));
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
