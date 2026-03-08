"use client";

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
  const url = c.previewUrl ?? c.imageUrl ?? c.thumbnailUrl;
  return url ? "preview" : "unavailable";
}

/**
 * Returns the best available URL. Catalog ads may have a URL (static thumbnail
 * from the catalog feed) — we now expose it so the UI can show it with a badge.
 */
export function resolvePreviewUrl(c: PreviewableCreative): string | null {
  return c.previewUrl ?? c.imageUrl ?? c.thumbnailUrl ?? null;
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
  const url = resolvePreviewUrl(creative);
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
      <img src={url} alt={creative.name} className="h-full w-full object-cover" />
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
  const url = resolvePreviewUrl(creative);
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
      <img src={url} alt={creative.name} className="h-full w-full object-cover" />
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
