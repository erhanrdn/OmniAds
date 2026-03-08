"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * preview_state resolution priority:
 *   1. If previewState is provided by backend, trust it.
 *   2. Else if isCatalog → "catalog"
 *   3. Else if any url exists → "preview"
 *   4. Else → "unavailable"
 *
 * Catalog ads with a real preview URL show the image with a "Catalog ad"
 * badge overlay. Catalog ads without any URL show a text placeholder.
 */
export type PreviewState = "preview" | "catalog" | "unavailable";

export interface PreviewableCreative {
  name: string;
  /** Catalog / DPA ad (DYNAMIC object_type). Must be checked before rendering state. */
  isCatalog: boolean;
  previewState?: PreviewState;
  previewUrl: string | null | undefined;
  imageUrl?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
}

export function resolvePreviewState(c: PreviewableCreative): PreviewState {
  if (c.previewState) return c.previewState;
  if (c.isCatalog) return "catalog";
  const urls = resolvePreviewUrls(c);
  return urls.length > 0 ? "preview" : "unavailable";
}

function resolvePreviewUrls(c: PreviewableCreative): string[] {
  const urls = [c.previewUrl, c.imageUrl, c.thumbnailUrl]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(urls));
}

/**
 * Returns the best available URL. Catalog ads may have a URL (static thumbnail
 * from the catalog feed) — we now expose it so the UI can show it with a badge.
 */
export function resolvePreviewUrl(c: PreviewableCreative): string | null {
  return resolvePreviewUrls(c)[0] ?? null;
}

function useResolvedPreviewUrl(creative: PreviewableCreative): {
  url: string | null;
  markFailed: () => void;
} {
  const candidates = useMemo(
    () => resolvePreviewUrls(creative),
    [creative.previewUrl, creative.imageUrl, creative.thumbnailUrl]
  );
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  useEffect(() => {
    setFailedUrls([]);
  }, [candidates.join("|")]);

  const url = candidates.find((candidate) => !failedUrls.includes(candidate)) ?? null;

  return {
    url,
    markFailed: () => {
      if (!url) return;
      setFailedUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
    },
  };
}

interface CreativePreviewProps {
  creative: PreviewableCreative;
  /** "square" (default) or "video" aspect ratio */
  aspectRatio?: "square" | "video";
  /** Extra classes applied to the outer wrapper */
  className?: string;
}

export function CreativePreview({
  creative,
  aspectRatio = "square",
  className,
}: CreativePreviewProps) {
  const state = resolvePreviewState(creative);
  const { url, markFailed } = useResolvedPreviewUrl(creative);
  const aspectClass = aspectRatio === "square" ? "aspect-square" : "aspect-video";

  if (state === "unavailable" || !url) {
    // True unavailable — no URL at all
    return (
      <div
        className={cn(
          `flex ${aspectClass} w-full items-center justify-center bg-muted/40`,
          className
        )}
      >
        <span className="text-xs text-muted-foreground">
          {state === "catalog" ? "Catalog ad" : "Preview unavailable"}
        </span>
      </div>
    );
  }

  // Both "preview" and "catalog" with a URL: show the image.
  // For catalog ads, overlay a badge so viewers know it's a DPA/dynamic creative.
  return (
    <div className={cn(`relative ${aspectClass} w-full overflow-hidden`, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={creative.name} className="h-full w-full object-cover" onError={markFailed} />
      {state === "catalog" && (
        <span className="absolute bottom-1 left-1 z-10">
          <Badge variant="secondary" className="text-[10px] opacity-90">
            Catalog
          </Badge>
        </span>
      )}
    </div>
  );
}

/** Compact inline preview for use in drawers / thumbnails */
interface CreativePreviewInlineProps {
  creative: PreviewableCreative;
  width?: string;
  height?: string;
  className?: string;
}

export function CreativePreviewInline({
  creative,
  width = "w-36",
  height = "h-20",
  className,
}: CreativePreviewInlineProps) {
  const state = resolvePreviewState(creative);
  const { url, markFailed } = useResolvedPreviewUrl(creative);
  const sizeClass = `${width} ${height}`;

  if (!url) {
    return (
      <div
        className={cn(
          `flex ${sizeClass} items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground`,
          className
        )}
      >
        {state === "catalog" ? "Catalog ad" : "Preview unavailable"}
      </div>
    );
  }

  return (
    <div className={cn(`relative ${sizeClass} overflow-hidden rounded-md`, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={creative.name} className="h-full w-full object-cover" onError={markFailed} />
      {state === "catalog" && (
        <span className="absolute bottom-0.5 left-0.5 z-10">
          <Badge variant="secondary" className="text-[10px] opacity-90">
            Catalog
          </Badge>
        </span>
      )}
    </div>
  );
}
