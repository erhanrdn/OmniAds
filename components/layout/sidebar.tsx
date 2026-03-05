"use client";

import { useAppStore } from "@/store/app-store";
import { SidebarContent } from "./sidebar-content";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function DesktopSidebar() {
  const open = useAppStore((s) => s.desktopSidebarOpen);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-background transition-all duration-300 shrink-0",
        open ? "w-60" : "w-0 overflow-hidden border-r-0"
      )}
    >
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar() {
  const open = useAppStore((s) => s.mobileSidebarOpen);
  const setOpen = useAppStore((s) => s.setMobileSidebarOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="p-0 w-60">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
