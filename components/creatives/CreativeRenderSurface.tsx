"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Try to extract the primary media `src` from preview HTML.
 * This avoids rendering the full ad chrome (sponsor header, CTA, reactions)
 * while still recovering the creative asset when no other URL is available.
 */
function extractImageSrcFromHtml(html: string): string | null {
  // Look for og:image meta first (often present in ad preview HTML)
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) return normalizeUrl(ogMatch[1]);

  // Look for the largest/most prominent <img> src — skip tiny icons/avatars
  // Prioritize images that are NOT profile pictures or icons
  const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
  for (const match of imgMatches) {
    const src = match[1];
    // Skip common avatar/icon patterns
    if (/profile|avatar|icon|emoji|1x1|pixel/i.test(src)) continue;
    // Skip data URIs and very short URLs (likely tracking pixels)
    if (src.startsWith("data:") || src.length < 20) continue;
    const normalized = normalizeUrl(src);
    if (normalized) return normalized;
  }

  // Fallback: try any img src
  const firstImg = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (firstImg?.[1]) return normalizeUrl(firstImg[1]);

  return null;
}

/**
 * Resolve the best image URL for asset mode rendering.
 * Priority: image_url → poster_url → assetFallbacks → extracted from HTML
 */
function resolveAssetSrc(
  preview: CreativeRenderPayload,
  assetFallbacks?: (string | null | undefined)[]
): { src: string | null; source: string } {
  const imageUrl = normalizeUrl(preview.image_url);
  if (imageUrl) return { src: imageUrl, source: "image_url" };

  const posterUrl = normalizeUrl(preview.poster_url);
  if (posterUrl) return { src: posterUrl, source: "poster_url" };

  // Try explicit fallback URLs (thumbnailUrl, imageUrl, previewUrl from row)
  if (assetFallbacks) {
    for (let i = 0; i < assetFallbacks.length; i++) {
      const url = normalizeUrl(assetFallbacks[i]);
      if (url) return { src: url, source: `fallback_${i}` };
    }
  }

  // Last resort: extract from HTML if available
  if (preview.html) {
    const extracted = extractImageSrcFromHtml(preview.html);
    if (extracted) return { src: extracted, source: "extracted_from_html" };
  }

  return { src: null, source: "none" };
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
      const resolved = resolveAssetSrc(preview, assetFallbacks);
      console.log("[creative-render] ASSET mode", {
        id: id ?? null,
        name,
        render_mode: preview.render_mode,
        chosen_src: resolved.src?.slice(0, 80) ?? null,
        source_type: resolved.source,
        had_html: Boolean(preview.html),
        is_direct_media: resolved.source !== "extracted_from_html" && resolved.source !== "none",
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

  const badgeLabel = preview.is_catalog ? "Catalog" : preview.render_mode === "video" ? "Video" : "Feed";

  const fallback = (
    <div className={cn(frameClass, "flex items-center justify-center text-[11px] text-muted-foreground")}>
      {preview.is_catalog ? "Catalog" : "Preview unavailable"}
    </div>
  );

  // ─── ASSET MODE ───────────────────────────────────────────────
  // Never render HTML iframes. Show only the creative media surface.
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
  // Render the full ad preview including HTML iframes.

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
          <Badge variant="secondary" className={cn("absolute bottom-1 left-1 text-[10px] opacity-90", badgeClassName)}>
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
          <Badge variant="secondary" className={cn("absolute bottom-1 left-1 text-[10px] opacity-90", badgeClassName)}>
            Catalog
          </Badge>
        ) : null}
        <Badge variant="secondary" className={cn("absolute bottom-1 right-1 text-[10px] opacity-90", badgeClassName)}>
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
          <Badge variant="secondary" className={cn("absolute bottom-1 left-1 text-[10px] opacity-90", badgeClassName)}>
            Catalog
          </Badge>
        ) : null}
      </div>
    );
  }

  return fallback;
}

// ─── Asset-only image renderer ──────────────────────────────────
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
  const resolved = resolveAssetSrc(preview, assetFallbacks);
  const [failed, setFailed] = useState(false);

  // Reset failed state when src changes
  useEffect(() => {
    setFailed(false);
  }, [resolved.src]);

  if (!resolved.src || failed) {
    return <>{fallback}</>;
  }

  return (
    <div className={frameClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolved.src}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
        {badgeLabel}
      </span>
    </div>
  );
}
