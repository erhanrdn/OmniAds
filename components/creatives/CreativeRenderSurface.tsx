"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CreativeRenderPayload = {
  render_mode: "html_preview" | "video" | "image" | "unavailable";
  html: string | null;
  image_url: string | null;
  video_url: string | null;
  poster_url: string | null;
  source: string | null;
  is_catalog: boolean;
};

type CreativeRenderSurfaceProps = {
  id?: string;
  name: string;
  preview: CreativeRenderPayload;
  className?: string;
  badgeClassName?: string;
  size?: "thumb" | "card" | "large";
  /**
   * "asset" — render only the creative media surface (image/poster).
   *   Never render full HTML iframes. Used in top cards and table thumbnails.
   * "full" — render the full ad preview including HTML iframes.
   *   Used in the detail drawer for creative inspection.
   */
  mode?: "asset" | "full";
  /** Additional image URLs to try as fallbacks in asset mode */
  assetFallbacks?: (string | null | undefined)[];
};

const SIZE_MAP: Record<NonNullable<CreativeRenderSurfaceProps["size"]>, string> = {
  thumb: "h-10 w-10 rounded",
  card: "aspect-[4/5] w-full",
  large: "aspect-[4/5] w-full rounded-lg",
};

let assetLogCount = 0;
let fullLogCount = 0;
const LOG_LIMIT = 5;

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** Decode HTML entities the same way the server does */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Check if a URL is a Meta CDN host eligible for proxy */
function isMetaCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith(".fbcdn.net") ||
      host.endsWith(".facebook.com") ||
      host.endsWith(".fbsbx.com") ||
      host.endsWith(".cdninstagram.com")
    );
  } catch {
    return false;
  }
}

/** Wrap a Meta CDN URL through our proxy to avoid CORS/referrer issues */
function proxyUrl(src: string): string {
  return `/api/media/meta-preview?src=${encodeURIComponent(src)}`;
}

/**
 * Extract the primary media image from preview HTML.
 * Mirrors the server-side extractPreviewMediaFromHtml logic:
 * decodes entities first, then looks for video poster, img src.
 */
function extractImageSrcFromHtml(html: string): string | null {
  const decoded = decodeHtmlEntities(html);

  // 1. Video poster (often the creative asset for video ads)
  const posterMatch = decoded.match(/<video[^>]*poster=["']([^"']+)["']/i);
  if (posterMatch?.[1]) {
    const url = normalizeUrl(posterMatch[1]);
    if (url) return url;
  }

  // 2. All img tags — skip avatars, icons, tracking pixels
  const imgMatches = [...decoded.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
  for (const match of imgMatches) {
    const src = match[1];
    if (!src || src.length < 20) continue;
    if (src.startsWith("data:")) continue;
    if (/profile|avatar|icon|emoji|1x1|pixel|spacer/i.test(src)) continue;
    const url = normalizeUrl(src);
    if (url) return url;
  }

  // 3. Any img src as last resort
  const fallbackImg = decoded.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (fallbackImg?.[1]) return normalizeUrl(fallbackImg[1]);

  return null;
}

/**
 * Resolve all possible image sources for asset mode, ordered by priority.
 * Returns an array so the component can fall through on load errors.
 */
function resolveAssetSources(
  preview: CreativeRenderPayload,
  assetFallbacks?: (string | null | undefined)[]
): Array<{ src: string; source: string }> {
  const sources: Array<{ src: string; source: string }> = [];
  const seen = new Set<string>();

  const push = (url: string | null, source: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({ src: url, source });
  };

  // Priority 1: preview.image_url (server already extracted this)
  push(normalizeUrl(preview.image_url), "preview.image_url");

  // Priority 2: preview.poster_url
  push(normalizeUrl(preview.poster_url), "preview.poster_url");

  // Priority 3: explicit fallback URLs from row (thumbnailUrl, imageUrl, previewUrl)
  if (assetFallbacks) {
    for (let i = 0; i < assetFallbacks.length; i++) {
      push(normalizeUrl(assetFallbacks[i]), `fallback_${i}`);
    }
  }

  // Priority 4: extract from preview HTML
  if (preview.html) {
    push(extractImageSrcFromHtml(preview.html), "extracted_from_html");
  }

  return sources;
}

export function CreativeRenderSurface({
  id,
  name,
  preview,
  className,
  badgeClassName,
  size = "card",
  mode = "full",
  assetFallbacks,
}: CreativeRenderSurfaceProps) {
  const frameClass = cn("relative overflow-hidden bg-muted/30", SIZE_MAP[size], className);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Debug logging
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (mode === "asset") {
      if (assetLogCount >= LOG_LIMIT) return;
      assetLogCount += 1;
      const sources = resolveAssetSources(preview, assetFallbacks);
      console.log("[creative-render] ASSET mode", {
        id: id ?? null,
        name: name.slice(0, 40),
        render_mode: preview.render_mode,
        sources_count: sources.length,
        first_source: sources[0]
          ? { src: sources[0].src.slice(0, 80), type: sources[0].source }
          : null,
        had_html: Boolean(preview.html),
        all_sources: sources.map((s) => ({
          src: s.src.slice(0, 60) + '...',
          source: s.source,
        })),
        DIAGNOSTIC_preview_fields: {
          image_url: preview.image_url ?? "NULL",
          poster_url: preview.poster_url ?? "NULL",
          video_url: preview.video_url ?? "NULL",
        },
        DIAGNOSTIC_assetFallbacks: assetFallbacks?.map((f, i) => 
          f ? `fallback_${i}: ${String(f).slice(0, 60)}...` : `fallback_${i}: NULL`
        ) ?? "NONE",
      });
    } else {
      if (fullLogCount >= LOG_LIMIT) return;
      fullLogCount += 1;
      console.log("[creative-render] FULL mode", {
        id: id ?? null,
        name,
        render_mode: preview.render_mode,
        has_html: Boolean(preview.html),
        has_video: Boolean(preview.video_url),
        has_image: Boolean(preview.image_url || preview.poster_url),
        is_catalog: preview.is_catalog,
      });
    }
  }, [id, name, preview, mode, assetFallbacks]);

  const badgeLabel = preview.is_catalog
    ? "Catalog"
    : preview.render_mode === "video"
      ? "Video"
      : "Feed";

  const fallback = (
    <div
      className={cn(
        frameClass,
        "flex items-center justify-center text-[11px] text-muted-foreground"
      )}
    >
      {preview.is_catalog ? "Catalog" : "Preview unavailable"}
    </div>
  );

  // ─── ASSET MODE ───────────────────────────────────────────────
  if (mode === "asset") {
    return (
      <AssetImage
        preview={preview}
        assetFallbacks={assetFallbacks}
        name={name}
        frameClass={frameClass}
        badgeLabel={badgeLabel}
        fallback={fallback}
      />
    );
  }

  // ─── FULL MODE ────────────────────────────────────────────────

  if (preview.render_mode === "html_preview" && preview.html) {
    return (
      <div className={frameClass}>
        <iframe
          ref={iframeRef}
          title={`Creative preview ${id ?? name}`}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={preview.html}
          className="h-full w-full border-0"
        />
        {preview.is_catalog ? (
          <Badge
            variant="secondary"
            className={cn(
              "absolute bottom-1 left-1 text-[10px] opacity-90",
              badgeClassName
            )}
          >
            Catalog
          </Badge>
        ) : null}
      </div>
    );
  }

  if (preview.render_mode === "video" && preview.video_url) {
    return (
      <div className={frameClass}>
        <video
          src={preview.video_url}
          poster={preview.poster_url ?? undefined}
          controls
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
        {preview.is_catalog ? (
          <Badge
            variant="secondary"
            className={cn(
              "absolute bottom-1 left-1 text-[10px] opacity-90",
              badgeClassName
            )}
          >
            Catalog
          </Badge>
        ) : null}
        <Badge
          variant="secondary"
          className={cn(
            "absolute bottom-1 right-1 text-[10px] opacity-90",
            badgeClassName
          )}
        >
          Video
        </Badge>
      </div>
    );
  }

  if (preview.render_mode === "image") {
    const src = preview.image_url ?? preview.poster_url ?? null;
    if (!src) return fallback;
    return (
      <div className={frameClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
        {preview.is_catalog ? (
          <Badge
            variant="secondary"
            className={cn(
              "absolute bottom-1 left-1 text-[10px] opacity-90",
              badgeClassName
            )}
          >
            Catalog
          </Badge>
        ) : null}
      </div>
    );
  }

  return fallback;
}

// ─── Asset-only image renderer with multi-source fallback + proxy ───
function AssetImage({
  preview,
  assetFallbacks,
  name,
  frameClass,
  badgeLabel,
  fallback,
}: {
  preview: CreativeRenderPayload;
  assetFallbacks?: (string | null | undefined)[];
  name: string;
  frameClass: string;
  badgeLabel: string;
  fallback: React.ReactNode;
}) {
  const sources = useMemo(
    () => resolveAssetSources(preview, assetFallbacks),
    [preview, assetFallbacks]
  );

  const [sourceIndex, setSourceIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(false);

  // Reset when sources change
  useEffect(() => {
    setSourceIndex(0);
    setUseProxy(false);
  }, [sources]);

  const current = sources[sourceIndex];

  if (!current) {
    return <>{fallback}</>;
  }

  // If direct load failed and URL is a Meta CDN URL, try via proxy
  const imgSrc = useProxy && isMetaCdnUrl(current.src)
    ? proxyUrl(current.src)
    : current.src;

  const handleError = () => {
    // First: try proxy for current source if it's a Meta CDN URL
    if (!useProxy && isMetaCdnUrl(current.src)) {
      setUseProxy(true);
      return;
    }
    // Second: try next source
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((prev) => prev + 1);
      setUseProxy(false);
    }
  };

  return (
    <div className={frameClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${sourceIndex}_${useProxy}`}
        src={imgSrc}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={handleError}
      />
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
        {badgeLabel}
      </span>
    </div>
  );
}
