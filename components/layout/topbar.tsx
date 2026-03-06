"use client";

import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Menu, Bell, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";
import { BusinessSelector } from "@/components/business/BusinessSelector";

function getPageTitle(pathname: string): string {
  const item = navItems.find((n) => n.href === pathname);
  if (item) return item.label;
  if (pathname === "/select-business") return "Select Business";
  if (pathname === "/businesses/new") return "Create Business";
  return "OmniAds";
}

export function Topbar() {
  const toggleDesktopSidebar = useAppStore((s) => s.toggleDesktopSidebar);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  function handleMenuClick() {
    if (window.innerWidth >= 768) {
      toggleDesktopSidebar();
    } else {
      setMobileSidebarOpen(true);
    }
  }

  return (
    <header className="h-14 border-b bg-background flex items-center px-4 gap-3 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleMenuClick}
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <h1 className="font-semibold text-base flex-1">{title}</h1>

      <div className="flex items-center gap-2">
        <BusinessSelector />

        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="w-5 h-5" />
        </Button>

        <Button variant="ghost" className="gap-2 text-sm">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            A
          </div>
          <span className="hidden sm:inline">Admin</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
