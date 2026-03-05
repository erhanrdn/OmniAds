"use client";

import { useAppStore, BUSINESSES } from "@/store/app-store";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SelectBusinessPage() {
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const setSelectedBusinessId = useAppStore((s) => s.setSelectedBusinessId);
  const router = useRouter();

  function handleSelect(id: string) {
    setSelectedBusinessId(id);
    router.push("/overview");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Select a Business</h2>
        <p className="text-muted-foreground text-sm">
          Choose the business account you want to manage.
        </p>
      </div>

      <div className="grid gap-3 w-full max-w-sm">
        {BUSINESSES.map((biz) => {
          const isSelected = biz.id === selectedBusinessId;
          return (
            <button
              key={biz.id}
              onClick={() => handleSelect(biz.id)}
              className={cn(
                "flex items-center gap-4 p-4 rounded-xl border bg-card text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent hover:border-border"
              )}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {biz.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{biz.name}</p>
                <p className="text-xs text-muted-foreground">{biz.industry}</p>
              </div>
              {isSelected && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
