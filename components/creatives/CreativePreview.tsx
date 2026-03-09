"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type PreviewState = "preview" | "catalog" | "unavailable";

export interface PreviewableCreative {
  id?: string;
  name: string;
  isCatalog: boolean;
  previewState?: PreviewState;
  previewUrl: string | null | undefined;
  imageUrl?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
}

/**
 * Collect all non-empty URL candidates in priority order:
 *   previewUrl → thumbnailUrl → imageUrl
 * Returns de-duplicated list so the fallback hook can try the next one on error.
 */
function resolvePreviewUrls(c: PreviewableCreative): string[] {
  return Array.from(
    new Set(
      [c.previewUrl, c.thumbnailUrl, c.imageUrl]
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
  source: "previewUrl" | "thumbnailUrl" | "imageUrl" | null;
  markFailed: (failedUrl?: string | null) => void;
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
  const source: "previewUrl" | "thumbnailUrl" | "imageUrl" | null = useMemo(() => {
    if (!url) return null;
    const normalized = url.trim();
    if (typeof creative.previewUrl === "string" && creative.previewUrl.trim() === normalized) return "previewUrl";
    if (typeof creative.thumbnailUrl === "string" && creative.thumbnailUrl.trim() === normalized) return "thumbnailUrl";
    if (typeof creative.imageUrl === "string" && creative.imageUrl.trim() === normalized) return "imageUrl";
    return null;
  }, [creative.imageUrl, creative.previewUrl, creative.thumbnailUrl, url]);

  const previousUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const prev = previousUrlRef.current;
    if (prev && url && prev !== url) {
      console.warn("[creative-preview] fallback source transition", {
        id: creative.id ?? null,
        name: creative.name,
        fromSource: resolveSourceFromUrl(creative, prev),
        toSource: source,
        fromUrl: prev,
        toUrl: url,
      });
    }
    previousUrlRef.current = url;
  }, [creative.id, creative.imageUrl, creative.name, creative.previewUrl, creative.thumbnailUrl, source, url]);

  return {
    url,
    source,
    markFailed: (failedUrl?: string | null) => {
      const activeUrl = typeof failedUrl === "string" && failedUrl.trim().length > 0 ? failedUrl : url;
      if (!activeUrl) return;
      const activeSource = resolveSourceFromUrl(creative, activeUrl);
      if (process.env.NODE_ENV !== "production") {
        console.warn("[creative-preview] image load failed, trying next candidate", {
          id: creative.id ?? null,
          name: creative.name,
          source: activeSource,
          failedUrl: activeUrl,
          remaining: candidates.filter((c) => c !== activeUrl && !failedUrls.includes(c)).length,
        });
      }
      setFailedUrls((prev) => (prev.includes(activeUrl) ? prev : [...prev, activeUrl]));
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
  const { url, source, markFailed } = useResolvedPreviewUrl(creative);
  const resolvedState = resolvePreviewState(creative);
  const mediaUrl = toRenderablePreviewUrl(url);
  const aspectClass = aspectRatio === "square" ? "aspect-square" : "aspect-video";
  usePreviewDebugLog("card", creative, url, mediaUrl, source, resolvedState);

  // No URL at all → placeholder
  if (!mediaUrl) {
    return (
      <div className={cn("w-full", className)}>
        <div className={`flex ${aspectClass} w-full items-center justify-center bg-muted/40`}>
          <span className="text-xs text-muted-foreground">
            {creative.isCatalog ? "Catalog ad" : "Preview unavailable"}
          </span>
        </div>
        <PreviewDebugLine creative={creative} source={source} resolvedState={resolvedState} url={url} mediaUrl={null} />
      </div>
    );
  }

  // URL exists → always render the image
  return (
    <div className={cn("w-full", className)}>
      <div className={cn(`relative ${aspectClass} w-full overflow-hidden`)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={creative.name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onLoad={() => {
            if (process.env.NODE_ENV !== "production") {
              console.info("[creative-preview] image load success", {
                id: creative.id ?? null,
                name: creative.name,
                source,
                url,
                mediaUrl,
              });
            }
          }}
          onError={() => {
            if (process.env.NODE_ENV !== "production") {
              console.error("[creative-preview] image load failed", {
                id: creative.id ?? null,
                name: creative.name,
                source,
                url,
                mediaUrl,
              });
            }
            markFailed(url);
          }}
        />
        {creative.isCatalog && (
          <span className="absolute bottom-1 left-1 z-10">
            <Badge variant="secondary" className="text-[10px] opacity-90">
              Catalog
            </Badge>
          </span>
        )}
      </div>
      <PreviewDebugLine creative={creative} source={source} resolvedState={resolvedState} url={url} mediaUrl={mediaUrl} />
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
  const { url, source, markFailed } = useResolvedPreviewUrl(creative);
  const resolvedState = resolvePreviewState(creative);
  const mediaUrl = toRenderablePreviewUrl(url);
  const sizeClass = `${width} ${height}`;
  usePreviewDebugLog("inline", creative, url, mediaUrl, source, resolvedState);

  if (!mediaUrl) {
    return (
      <div className={cn("w-fit", className)}>
        <div
          className={cn(
            `flex ${sizeClass} items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground`
          )}
        >
          {creative.isCatalog ? "Catalog ad" : "Preview unavailable"}
        </div>
        <PreviewDebugLine creative={creative} source={source} resolvedState={resolvedState} url={url} mediaUrl={null} compact />
      </div>
    );
  }

  return (
    <div className={cn("w-fit", className)}>
      <div className={cn(`relative ${sizeClass} overflow-hidden rounded-md`)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={creative.name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onLoad={() => {
            if (process.env.NODE_ENV !== "production") {
              console.info("[creative-preview] image load success", {
                id: creative.id ?? null,
                name: creative.name,
                source,
                url,
                mediaUrl,
              });
            }
          }}
          onError={() => {
            if (process.env.NODE_ENV !== "production") {
              console.error("[creative-preview] image load failed", {
                id: creative.id ?? null,
                name: creative.name,
                source,
                url,
                mediaUrl,
              });
            }
            markFailed(url);
          }}
        />
        {creative.isCatalog && (
          <span className="absolute bottom-0.5 left-0.5 z-10">
            <Badge variant="secondary" className="text-[10px] opacity-90">
              Catalog
            </Badge>
          </span>
        )}
      </div>
      <PreviewDebugLine creative={creative} source={source} resolvedState={resolvedState} url={url} mediaUrl={mediaUrl} compact />
    </div>
  );
}

let previewDebugCount = 0;
const PREVIEW_DEBUG_LIMIT = 12;

function usePreviewDebugLog(
  surface: "card" | "inline",
  creative: PreviewableCreative,
  chosenUrl: string | null,
  mediaUrl: string | null,
  source: "previewUrl" | "thumbnailUrl" | "imageUrl" | null,
  resolvedState: PreviewState
) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (previewDebugCount >= PREVIEW_DEBUG_LIMIT) return;
    previewDebugCount += 1;
    console.log("[creative-preview] render sample", {
      surface,
      id: creative.id ?? null,
      name: creative.name,
      previewUrl: creative.previewUrl ?? null,
      thumbnailUrl: creative.thumbnailUrl ?? null,
      imageUrl: creative.imageUrl ?? null,
      chosenSource: source,
      chosenUrl,
      mediaUrl,
      previewState: creative.previewState ?? null,
      resolvedState,
      isCatalog: creative.isCatalog,
    });
  }, [
    chosenUrl,
    creative.id,
    creative.imageUrl,
    creative.isCatalog,
    creative.name,
    creative.previewState,
    creative.previewUrl,
    creative.thumbnailUrl,
    mediaUrl,
    resolvedState,
    source,
    surface,
  ]);
}

function resolveSourceFromUrl(
  creative: PreviewableCreative,
  url: string | null
): "previewUrl" | "thumbnailUrl" | "imageUrl" | null {
  if (!url) return null;
  const normalized = url.trim();
  if (typeof creative.previewUrl === "string" && creative.previewUrl.trim() === normalized) return "previewUrl";
  if (typeof creative.thumbnailUrl === "string" && creative.thumbnailUrl.trim() === normalized) return "thumbnailUrl";
  if (typeof creative.imageUrl === "string" && creative.imageUrl.trim() === normalized) return "imageUrl";
  return null;
}

function isMetaPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fbcdn.net" ||
    host.endsWith(".fbcdn.net") ||
    host === "fbsbx.com" ||
    host.endsWith(".fbsbx.com") ||
    host === "cdninstagram.com" ||
    host.endsWith(".cdninstagram.com")
  );
}

function toRenderablePreviewUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!isMetaPreviewHost(parsed.hostname)) return url;
    return `/api/media/meta-preview?src=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

function PreviewDebugLine({
  creative,
  source,
  resolvedState,
  url,
  mediaUrl,
  compact = false,
}: {
  creative: PreviewableCreative;
  source: "previewUrl" | "thumbnailUrl" | "imageUrl" | null;
  resolvedState: PreviewState;
  url: string | null;
  mediaUrl: string | null;
  compact?: boolean;
}) {
  if (process.env.NODE_ENV === "production") return null;
  const clippedUrl = (url ?? "none").slice(0, 80);
  const details = `source:${source ?? "none"} state:${resolvedState} catalog:${String(creative.isCatalog)} url:${clippedUrl}`;
  const proxyFlag = mediaUrl && url && mediaUrl !== url ? " proxy:on" : " proxy:off";
  return (
    <p
      className={cn(
        "mt-1 whitespace-pre-wrap break-all rounded bg-amber-50 px-1.5 py-1 font-mono text-[9px] leading-tight text-amber-900",
        compact ? "max-w-72" : "w-full"
      )}
    >
      {details}
      {proxyFlag}
    </p>
  );
}
