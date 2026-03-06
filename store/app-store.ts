import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Business {
  id: string;
  name: string;
  timezone: string;
  currency: string;
}

interface AppState {
  desktopSidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  businesses: Business[];
  selectedBusinessId: string | null;
  hasHydrated: boolean;
  toggleDesktopSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  createBusiness: (name: string, timezone: string, currency: string) => string;
  selectBusiness: (id: string | null) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      desktopSidebarOpen: true,
      mobileSidebarOpen: false,
      businesses: [],
      selectedBusinessId: null,
      hasHydrated: false,
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
      selectBusiness: (id) => set({ selectedBusinessId: id }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "omniads-app-store-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        businesses: state.businesses,
        selectedBusinessId: state.selectedBusinessId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
