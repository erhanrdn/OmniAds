"use client";

import { useAppStore, BUSINESSES } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, Bell, ChevronDown, Building2, ChevronsUpDown, Check } from "lucide-react";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function getPageTitle(pathname: string): string {
  const item = navItems.find((n) => n.href === pathname);
  if (item) return item.label;
  if (pathname === "/select-business") return "Select Business";
  return "OmniAds";
}

function BusinessSwitcher() {
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const setSelectedBusinessId = useAppStore((s) => s.setSelectedBusinessId);
  const router = useRouter();

  const selected = BUSINESSES.find((b) => b.id === selectedBusinessId);

  function handleSelect(id: string) {
    setSelectedBusinessId(id);
    router.push("/overview");
  }

  function handleManage() {
    router.push("/select-business");
  }

  if (!selected) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 text-sm h-9 px-3 max-w-[200px]">
          <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
            {selected.initials}
          </div>
          <span className="truncate hidden sm:block">{selected.name}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch Business
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BUSINESSES.map((biz) => (
          <DropdownMenuItem
            key={biz.id}
            onClick={() => handleSelect(biz.id)}
            className="gap-2 cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
              {biz.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{biz.name}</p>
              <p className="text-xs text-muted-foreground truncate">{biz.industry}</p>
            </div>
            <Check
              className={cn(
                "w-4 h-4 shrink-0",
                biz.id === selectedBusinessId ? "opacity-100" : "opacity-0"
              )}
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleManage} className="gap-2 cursor-pointer text-muted-foreground">
          <Building2 className="w-4 h-4" />
          Manage Businesses
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
        <BusinessSwitcher />

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
