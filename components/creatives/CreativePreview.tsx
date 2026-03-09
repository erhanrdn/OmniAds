"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CreativePreviewProps = {
  name: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  format?: "image" | "video" | "catalog";
  isCatalog?: boolean;
  className?: string;
  size?: "card" | "thumb";
};

const SIZE_MAP: Record<NonNullable<CreativePreviewProps["size"]>, string> = {
  card: "aspect-[4/5] w-full rounded-lg",
  thumb: "h-12 w-12 rounded",
};

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function CreativePreview({
  name,
  thumbnailUrl,
  imageUrl,
  previewUrl,
  format = "image",
  isCatalog = false,
  className,
  size = "card",
}: CreativePreviewProps) {
  const source = normalizeUrl(thumbnailUrl) ?? normalizeUrl(imageUrl) ?? normalizeUrl(previewUrl) ?? null;

  if (!source) {
    return (
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-muted text-[11px] text-muted-foreground",
          SIZE_MAP[size],
          className
        )}
      >
        {isCatalog ? "Catalog" : "Preview unavailable"}
      </div>
    );
  }

  const badgeLabel = isCatalog ? "Catalog" : format === "video" ? "Video" : "Feed";

  return (
    <div className={cn("relative overflow-hidden bg-muted", SIZE_MAP[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] opacity-90">
        {badgeLabel}
      </Badge>
    </div>
  );
}
