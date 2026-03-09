"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type PreviewState = "preview" | "catalog" | "unavailable";

export interface PreviewableCreative {
  name: string;
  isCatalog: boolean;
  previewState?: PreviewState;
  previewUrl: string | null | undefined;
  imageUrl?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
}

/**
 * Collect all non-empty URL candidates in priority order:
 *   previewUrl → imageUrl → thumbnailUrl
 * Returns de-duplicated list so the fallback hook can try the next one on error.
 */
function resolvePreviewUrls(c: PreviewableCreative): string[] {
  return Array.from(
    new Set(
      [c.previewUrl, c.imageUrl, c.thumbnailUrl]
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    )
  );
}

/** Best single URL — kept for external consumers. */
export function resolvePreviewUrl(c: PreviewableCreative): string | null {
  return resolvePreviewUrls(c)[0] ?? null;
}

/**
 * Resolve preview state purely from URL availability + isCatalog flag.
 * Backend `previewState` is intentionally ignored here — the only source
 * of truth for "should we render an image" is whether a URL exists.
 */
export function resolvePreviewState(c: PreviewableCreative): PreviewState {
  const hasUrl = resolvePreviewUrls(c).length > 0;
  if (hasUrl) return "preview";
  if (c.isCatalog) return "catalog";
  return "unavailable";
}

/**
 * Hook that cycles through candidate URLs, skipping any that fail to load.
 * Returns the current best URL and a `markFailed` callback for <img onError>.
 */
function useResolvedPreviewUrl(creative: PreviewableCreative): {
  url: string | null;
  markFailed: () => void;
} {
  const candidates = useMemo(
    () => resolvePreviewUrls(creative),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creative.previewUrl, creative.imageUrl, creative.thumbnailUrl]
  );
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  // Reset failures when the candidate list changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setFailedUrls([]); }, [candidates.join("|")]);

  const url = candidates.find((c) => !failedUrls.includes(c)) ?? null;

  return {
    url,
    markFailed: () => {
      if (!url) return;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[creative-preview] image load failed, trying next candidate", {
          name: creative.name,
          failedUrl: url,
          remaining: candidates.filter((c) => c !== url && !failedUrls.includes(c)).length,
        });
      }
      setFailedUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
    },
  };
}

// ── Components ───────────────────────────────────────────────────────────────

interface CreativePreviewProps {
  creative: PreviewableCreative;
  aspectRatio?: "square" | "video";
  className?: string;
}

export function CreativePreview({
  creative,
  aspectRatio = "square",
  className,
}: CreativePreviewProps) {
  const { url, markFailed } = useResolvedPreviewUrl(creative);
  const aspectClass = aspectRatio === "square" ? "aspect-square" : "aspect-video";

  // No URL at all → placeholder
  if (!url) {
    return (
      <div
        className={cn(
          `flex ${aspectClass} w-full items-center justify-center bg-muted/40`,
          className
        )}
      >
        <span className="text-xs text-muted-foreground">
          {creative.isCatalog ? "Catalog ad" : "Preview unavailable"}
        </span>
      </div>
    );
  }

  // URL exists → always render the image
  return (
    <div className={cn(`relative ${aspectClass} w-full overflow-hidden`, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={creative.name}
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
        onError={markFailed}
      />
      {creative.isCatalog && (
        <span className="absolute bottom-1 left-1 z-10">
          <Badge variant="secondary" className="text-[10px] opacity-90">
            Catalog
          </Badge>
        </span>
      )}
    </div>
  );
}

// ── Inline variant (drawers / table thumbnails) ──────────────────────────────

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
        {creative.isCatalog ? "Catalog ad" : "Preview unavailable"}
      </div>
    );
  }

  return (
    <div className={cn(`relative ${sizeClass} overflow-hidden rounded-md`, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={creative.name}
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
        onError={markFailed}
      />
      {creative.isCatalog && (
        <span className="absolute bottom-0.5 left-0.5 z-10">
          <Badge variant="secondary" className="text-[10px] opacity-90">
            Catalog
          </Badge>
        </span>
      )}
    </div>
  );
}
