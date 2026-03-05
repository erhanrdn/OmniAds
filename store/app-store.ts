import { create } from "zustand";

export interface Business {
  id: string;
  name: string;
  industry: string;
  initials: string;
}

export const BUSINESSES: Business[] = [
  { id: "1", name: "Acme Corp", industry: "E-commerce", initials: "AC" },
  { id: "2", name: "Globex Media", industry: "Media & Advertising", initials: "GM" },
  { id: "3", name: "Initech Solutions", industry: "SaaS", initials: "IS" },
];

interface AppState {
  desktopSidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  selectedBusinessId: string | null;
  toggleDesktopSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSelectedBusinessId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  desktopSidebarOpen: true,
  mobileSidebarOpen: false,
  selectedBusinessId: null,
  toggleDesktopSidebar: () =>
    set((state) => ({ desktopSidebarOpen: !state.desktopSidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setSelectedBusinessId: (id) => set({ selectedBusinessId: id }),
}));
