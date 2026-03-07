"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * preview_state resolution priority:
 *   1. If previewState is provided by backend, use it.
 *   2. Else if is_catalog → "catalog"
 *   3. Else if any url (previewUrl → imageUrl → thumbnailUrl) exists → "preview"
 *   4. Else → "unavailable"
 *
 * Catalog and unavailable are two distinct states and must never be confused.
 */
export type PreviewState = "preview" | "catalog" | "unavailable";

export interface PreviewableCreative {
  name: string;
  /** Catalog / DPA ad (DYNAMIC object_type). Must be checked before URL fallbacks. */
  isCatalog: boolean;
  previewState?: PreviewState;
  previewUrl: string | null | undefined;
  imageUrl?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
}

export function resolvePreviewState(c: PreviewableCreative): PreviewState {
  if (c.previewState) return c.previewState;
  // Catalog detection takes priority — never show a raw image for catalog ads
  if (c.isCatalog) return "catalog";
  // Try all available URL fallbacks in order
  const url = c.previewUrl ?? c.imageUrl ?? c.thumbnailUrl;
  return url ? "preview" : "unavailable";
}

export function resolvePreviewUrl(c: PreviewableCreative): string | null {
  if (c.previewState) {
    return c.previewState === "preview" ? c.previewUrl ?? null : null;
  }
  if (c.isCatalog) return null;
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

  if (state === "preview" && url) {
    return (
      <div className={cn(`${aspectClass} w-full overflow-hidden`, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={creative.name} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (state === "catalog") {
    return (
      <div
        className={cn(
          `flex ${aspectClass} w-full flex-col items-center justify-center gap-2 bg-muted/60`,
          className
        )}
      >
        <Badge variant="secondary" className="text-[10px]">
          Catalog ad
        </Badge>
        <span className="text-xs text-muted-foreground">Dynamic product creative</span>
      </div>
    );
  }

  // state === "unavailable"
  return (
    <div
      className={cn(
        `flex ${aspectClass} w-full items-center justify-center bg-muted/40`,
        className
      )}
    >
      <span className="text-xs text-muted-foreground">Preview unavailable</span>
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

  if (state === "preview" && url) {
    return (
      <div className={cn(`${sizeClass} overflow-hidden rounded-md`, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={creative.name} className="h-full w-full object-cover" />
      </div>
    );
  }

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
