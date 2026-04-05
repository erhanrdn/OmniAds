"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Menu, Bell, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { getNavItems } from "./nav-items";
import { BusinessSelector } from "@/components/business/BusinessSelector";
import { PersonalAccountMenu } from "@/components/layout/PersonalAccountMenu";
import { TeamAccessModal } from "@/components/layout/TeamAccessModal";
import { getTranslations } from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences-store";

function getPageTitle(pathname: string, language: "en" | "tr"): string {
  const navItems = getNavItems(language);
  const t = getTranslations(language);
  const item = navItems.find((n) => n.href === pathname);
  if (item) return item.label;
  if (pathname === "/select-business") return t.navigation.selectBusiness;
  if (pathname === "/businesses/new") return t.navigation.createBusiness;
  return "Adsecute";
}

interface TopbarProps {
  userName: string;
}

export function Topbar({ userName }: TopbarProps) {
  const toggleDesktopSidebar = useAppStore((s) => s.toggleDesktopSidebar);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const language = usePreferencesStore((s) => s.language);
  const pathname = usePathname();
  const title = getPageTitle(pathname, language);
  const t = getTranslations(language).layout;
  const isOverviewPage = pathname === "/overview";
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
          aria-label={t.toggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </Button>

        <h1
          className={`min-w-0 flex-1 truncate font-semibold ${
            isOverviewPage ? "text-3xl tracking-tight" : "text-base"
          }`}
        >
          {title}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <BusinessSelector />

          <Button variant="ghost" size="icon" aria-label={t.notifications}>
            <Bell className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={t.teamAccess}
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
