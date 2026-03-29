import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const APP_STORE_PERSIST_KEY = "omniads-app-store-v2";

export interface Business {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  isDemoBusiness?: boolean;
  industry?: string;
  platform?: string;
}

interface AppState {
  desktopSidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  businesses: Business[];
  selectedBusinessId: string | null;
  workspaceOwnerId: string | null;
  hasHydrated: boolean;
  authBootstrapStatus: "idle" | "loading" | "ready";
  workspaceResolved: boolean;
  toggleDesktopSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  createBusiness: (name: string, timezone: string, currency: string) => string;
  deleteBusiness: (id: string) => string | null;
  setWorkspaceSnapshot: (
    workspaceOwnerId: string,
    businesses: Business[],
    selectedBusinessId: string | null
  ) => void;
  selectBusiness: (id: string | null) => void;
  clearWorkspaceState: () => void;
  setHasHydrated: (value: boolean) => void;
  setAuthBootstrapStatus: (value: "idle" | "loading" | "ready") => void;
  setWorkspaceResolved: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      desktopSidebarOpen: true,
      mobileSidebarOpen: false,
      businesses: [],
      selectedBusinessId: null,
      workspaceOwnerId: null,
      hasHydrated: false,
      authBootstrapStatus: "idle",
      workspaceResolved: false,
      toggleDesktopSidebar: () =>
        set((state) => ({ desktopSidebarOpen: !state.desktopSidebarOpen })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      createBusiness: (name, timezone, currency) => {
        const id = crypto.randomUUID();
        set((state) => ({
          businesses: [
            ...state.businesses,
            {
              id,
              name: name.trim(),
              timezone,
              currency,
            },
          ],
          selectedBusinessId: id,
        }));
        return id;
      },
      deleteBusiness: (id) => {
        let nextSelected: string | null = null;
        set((state) => {
          const remaining = state.businesses.filter((business) => business.id !== id);
          if (state.selectedBusinessId === id) {
            nextSelected = remaining[0]?.id ?? null;
          } else {
            nextSelected = state.selectedBusinessId;
          }
          return {
            businesses: remaining,
            selectedBusinessId: nextSelected,
          };
        });
        return nextSelected;
      },
      setWorkspaceSnapshot: (workspaceOwnerId, businesses, selectedBusinessId) =>
        set({
          workspaceOwnerId,
          businesses,
          selectedBusinessId:
            selectedBusinessId && businesses.some((item) => item.id === selectedBusinessId)
              ? selectedBusinessId
              : businesses[0]?.id ?? null,
          workspaceResolved: true,
        }),
      selectBusiness: (id) =>
        set((state) => ({
          selectedBusinessId: id && state.businesses.some((item) => item.id === id) ? id : null,
        })),
      clearWorkspaceState: () =>
        set({
          businesses: [],
          selectedBusinessId: null,
          workspaceOwnerId: null,
          workspaceResolved: false,
        }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setAuthBootstrapStatus: (value) => set({ authBootstrapStatus: value }),
      setWorkspaceResolved: (value) => set({ workspaceResolved: value }),
    }),
    {
      name: APP_STORE_PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        desktopSidebarOpen: state.desktopSidebarOpen,
        businesses: state.businesses,
        selectedBusinessId: state.selectedBusinessId,
        workspaceOwnerId: state.workspaceOwnerId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        state?.setWorkspaceResolved(Boolean(state?.businesses.length));
      },
    }
  )
);
