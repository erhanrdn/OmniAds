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
      Share ({selectedCount})
    </Button>
  );
}
