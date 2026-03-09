"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type CreativePreviewProps = {
  id?: string;
  name: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  format?: "image" | "video" | "catalog";
  isCatalog?: boolean;
  debugScope?: "top-grid" | "table-thumb" | "other";
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

const compactPreviewDebugCountByScope: Record<string, number> = {};

export function CreativePreview({
  id,
  name,
  thumbnailUrl,
  imageUrl,
  previewUrl,
  format = "image",
  isCatalog = false,
  debugScope = "other",
  className,
  size = "card",
}: CreativePreviewProps) {
  const sources = useMemo(
    () =>
      [normalizeUrl(thumbnailUrl), normalizeUrl(imageUrl), normalizeUrl(previewUrl)].filter(
        (value): value is string => Boolean(value)
      ),
    [thumbnailUrl, imageUrl, previewUrl]
  );

  const [sourceIndex, setSourceIndex] = useState(0);
  const compactPreviewSrc = sources[sourceIndex] ?? null;

  useEffect(() => {
    setSourceIndex(0);
  }, [id, thumbnailUrl, imageUrl, previewUrl]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const count = compactPreviewDebugCountByScope[debugScope] ?? 0;
    if (count >= 5) return;
    compactPreviewDebugCountByScope[debugScope] = count + 1;
    console.log("[compact-preview] source pick", {
      scope: debugScope,
      id: id ?? null,
      name,
      thumbnailUrl: thumbnailUrl ?? null,
      imageUrl: imageUrl ?? null,
      previewUrl: previewUrl ?? null,
      chosen: compactPreviewSrc,
    });
  }, [compactPreviewSrc, debugScope, id, imageUrl, name, previewUrl, thumbnailUrl]);

  if (!compactPreviewSrc) {
    return (
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-muted text-[11px] text-muted-foreground",
          SIZE_MAP[size],
          className
        )}
      >
        Preview unavailable
      </div>
    );
  }

  const badgeLabel = isCatalog ? "Catalog" : format === "video" ? "Video" : "Feed";

  return (
    <div className={cn("relative overflow-hidden bg-muted", SIZE_MAP[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={compactPreviewSrc}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (sourceIndex < sources.length - 1) {
            setSourceIndex((current) => current + 1);
          }
        }}
      />
      <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] opacity-90">
        {badgeLabel}
      </Badge>
    </div>
  );
}
