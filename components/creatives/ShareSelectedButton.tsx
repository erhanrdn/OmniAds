"use client";

import { memo } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareSelectedButtonProps {
  selectedCount: number;
  onClick: () => void;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export const ShareSelectedButton = memo(function ShareSelectedButton({ selectedCount, onClick }: ShareSelectedButtonProps) {
  const count = normalizeCount(selectedCount);

  // Do not render the button if nothing is selected
  if (!count) return null;

  const label = `Share ${count} selected creative${count === 1 ? "" : "s"}`;

  return (
    <Button
      size="sm"
      onClick={onClick}
      className="gap-1.5"
      aria-label={label}
      title={label}
    >
      <Share2 className="h-4 w-4" />
      Share ({count})
    </Button>
  );
});
