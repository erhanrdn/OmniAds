"use client";

import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function SelectBusinessPage() {
  const router = useRouter();
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const selectBusiness = useAppStore((state) => state.selectBusiness);

  function handleSelect(id: string) {
    selectBusiness(id);
    router.push("/overview");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Select business</h2>
        <p className="text-sm text-muted-foreground">
          Pick a business to continue with integrations and linked accounts.
        </p>
      </div>

      {businesses.length > 0 ? (
        <div className="grid gap-3">
          {businesses.map((business) => {
            const isSelected = business.id === selectedBusinessId;

            return (
              <button
                key={business.id}
                onClick={() => handleSelect(business.id)}
                className={cn(
                  "flex items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:border-border hover:bg-accent"
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {business.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? "")
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{business.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {business.timezone} • {business.currency}
                  </p>
                </div>
                {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center">
          <h3 className="text-base font-semibold">No businesses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first business to start integrations.
          </p>
        </div>
      )}

      <Button variant="outline" className="gap-2" onClick={() => router.push("/businesses/new")}>
        <Plus className="h-4 w-4" />
        Create new business
      </Button>
    </div>
  );
}
