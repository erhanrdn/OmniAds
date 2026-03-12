"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function BusinessSelector() {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const selectBusiness = useAppStore((state) => state.selectBusiness);

  const selectedBusiness =
    businesses.find((item) => item.id === selectedBusinessId) ?? null;
  const isDemoOnlyWorkspace = businesses.length === 1 && Boolean(businesses[0]?.isDemoBusiness);

  function handleSelect(businessId: string) {
    selectBusiness(businessId);
    fetch("/api/auth/switch-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    }).catch(() => null);
    router.push("/overview");
  }

  if (!hasHydrated) {
    return null;
  }

  if (businesses.length === 0) {
    return (
      <Button variant="outline" className="h-9 gap-2" onClick={() => router.push("/businesses/new")}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Create business</span>
      </Button>
    );
  }

  if (isDemoOnlyWorkspace && selectedBusiness) {
    return (
      <Button variant="outline" className="h-9 max-w-[220px] gap-2 px-3 text-sm" disabled>
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
          {getInitials(selectedBusiness.name)}
        </div>
        <span className="truncate hidden sm:block">{selectedBusiness.name}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 max-w-[220px] gap-2 px-3 text-sm">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
            {selectedBusiness ? getInitials(selectedBusiness.name) : "SB"}
          </div>
          <span className="truncate hidden sm:block">
            {selectedBusiness?.name ?? "Select business"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Switch business
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {businesses.map((business) => (
          <DropdownMenuItem
            key={business.id}
            onClick={() => handleSelect(business.id)}
            className="cursor-pointer gap-2"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
              {getInitials(business.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{business.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {business.timezone} • {business.currency}
              </p>
            </div>
            <Check
              className={cn(
                "h-4 w-4 shrink-0",
                business.id === selectedBusinessId ? "opacity-100" : "opacity-0"
              )}
            />
          </DropdownMenuItem>
        ))}
        {!isDemoOnlyWorkspace ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/select-business")}
              className="cursor-pointer gap-2 text-muted-foreground"
            >
              <Building2 className="h-4 w-4" />
              Manage businesses
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push("/businesses/new")}
              className="cursor-pointer gap-2"
            >
              <Plus className="h-4 w-4" />
              Create new business
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
