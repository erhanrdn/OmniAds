"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Menu, Bell, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";
import { BusinessSelector } from "@/components/business/BusinessSelector";
import { PersonalAccountMenu } from "@/components/layout/PersonalAccountMenu";
import { TeamAccessModal } from "@/components/layout/TeamAccessModal";

function getPageTitle(pathname: string): string {
  const item = navItems.find((n) => n.href === pathname);
  if (item) return item.label;
  if (pathname === "/select-business") return "Select Business";
  if (pathname === "/businesses/new") return "Create Business";
  return "Adsecute";
}

interface TopbarProps {
  userName: string;
}

export function Topbar({ userName }: TopbarProps) {
  const toggleDesktopSidebar = useAppStore((s) => s.toggleDesktopSidebar);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  function handleMenuClick() {
    if (window.innerWidth >= 768) {
      toggleDesktopSidebar();
    } else {
      setMobileSidebarOpen(true);
    }
  }

  return (
    <header className="border-b bg-background shrink-0">
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMenuClick}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <h1 className="min-w-0 flex-1 truncate font-semibold text-base">{title}</h1>

        <div className="flex flex-wrap items-center gap-2">
          <BusinessSelector />

          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Team access"
            onClick={() => setTeamModalOpen(true)}
          >
            <Users className="w-5 h-5" />
          </Button>

          <PersonalAccountMenu userName={userName} />
        </div>
      </div>

      <TeamAccessModal open={teamModalOpen} onOpenChange={setTeamModalOpen} />
    </header>
  );
}
