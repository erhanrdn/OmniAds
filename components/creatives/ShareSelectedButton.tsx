"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareSelectedButtonProps {
  selectedCount: number;
  onClick: () => void;
}

export function ShareSelectedButton({ selectedCount, onClick }: ShareSelectedButtonProps) {
  if (selectedCount === 0) return null;

  return (
    <Button size="sm" onClick={onClick} className="gap-1.5">
      <Share2 className="h-4 w-4" />
      Share selected
      <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold">
        {selectedCount}
      </span>
    </Button>
  );
}
