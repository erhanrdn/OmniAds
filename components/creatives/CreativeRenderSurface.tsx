"use client";

import { useEffect, useRef } from "react";
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
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  compactImageFirst?: boolean;
  className?: string;
  badgeClassName?: string;
  size?: "thumb" | "card" | "large";
};

const SIZE_MAP: Record<NonNullable<CreativeRenderSurfaceProps["size"]>, string> = {
  thumb: "h-10 w-10 rounded",
  card: "aspect-square w-full",
  large: "aspect-video w-full rounded-md",
};

let renderLogCount = 0;
const RENDER_LOG_LIMIT = 5;

function classifyHtmlPreviewFrame(
  html: string,
  size: NonNullable<CreativeRenderSurfaceProps["size"]>
): { scale: number; translateYPercent: number } {
  const lowered = html.toLowerCase();
  const mediaMatch = lowered.match(/<(img|video|source)\b/g);
  const firstMediaIndex = lowered.search(/<(img|video|source)\b/);
  const hasMedia = firstMediaIndex >= 0;
  const textOnly = lowered.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const textDensity = textOnly.length / Math.max(1, lowered.length);

  let translateYPercent = -8;
  if (!hasMedia) translateYPercent = -12;
  else {
    const mediaDepth = firstMediaIndex / Math.max(1, lowered.length);
    if (mediaDepth > 0.35) translateYPercent = -30;
    else if (mediaDepth > 0.22) translateYPercent = -22;
    else if (mediaDepth > 0.12) translateYPercent = -14;
  }

  if (textDensity > 0.35) translateYPercent -= 6;
  if ((mediaMatch?.length ?? 0) <= 1) translateYPercent -= 2;

  const baseScale = size === "thumb" ? 1.18 : size === "card" ? 1.1 : 1.04;
  return { scale: baseScale, translateYPercent };
}

function buildFramedHtml(
  rawHtml: string,
  frame: { scale: number; translateYPercent: number }
): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        width: 100% !important;
        height: 100% !important;
        background: transparent !important;
        scrollbar-width: none !important;
      }
      body::-webkit-scrollbar { display: none !important; }
      #codex-preview-frame {
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
      }
      #codex-preview-crop {
        transform: translateY(${frame.translateYPercent}%) scale(${frame.scale});
        transform-origin: top center;
        width: 100%;
        min-height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="codex-preview-frame">
      <div id="codex-preview-crop">${rawHtml}</div>
    </div>
  </body>
</html>`;
}

function useRenderDebugLog(id: string | undefined, name: string, preview: CreativeRenderPayload) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (renderLogCount >= RENDER_LOG_LIMIT) return;
    renderLogCount += 1;
    console.log("[creative-render-surface] render", {
      id: id ?? null,
      name,
      render_mode: preview.render_mode,
      source: preview.source,
      has_html: Boolean(preview.html),
      has_video: Boolean(preview.video_url),
      has_image: Boolean(preview.image_url || preview.poster_url),
      is_catalog: preview.is_catalog,
    });
  }, [id, name, preview]);
}

export function CreativeRenderSurface({
  id,
  name,
  preview,
  thumbnailUrl = null,
  imageUrl = null,
  previewUrl = null,
  compactImageFirst = false,
  className,
  badgeClassName,
  size = "card",
}: CreativeRenderSurfaceProps) {
  useRenderDebugLog(id, name, preview);
  const frameClass = cn("relative overflow-hidden bg-muted/30", SIZE_MAP[size], className);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlFrame = preview.html ? classifyHtmlPreviewFrame(preview.html, size) : null;
  const framedHtml = preview.html && htmlFrame ? buildFramedHtml(preview.html, htmlFrame) : null;

  const fallback = (
    <div className={cn(frameClass, "flex items-center justify-center text-[11px] text-muted-foreground")}>
      {preview.is_catalog ? "Catalog" : "Preview unavailable"}
    </div>
  );

  const normalize = (value: string | null | undefined): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  };
  const isLikelyDirectImageUrl = (value: string | null): boolean => {
    if (!value) return false;
    const lower = value.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)(\?|$)/i.test(lower)) return true;
    return lower.includes("fbcdn") || lower.includes("scontent") || lower.includes("cdninstagram");
  };

  if (compactImageFirst) {
    const thumb = normalize(thumbnailUrl);
    const image = normalize(imageUrl);
    const previewFallback = normalize(previewUrl);
    const compactSrc =
      thumb ??
      image ??
      (isLikelyDirectImageUrl(previewFallback) ? previewFallback : null) ??
      preview.image_url ??
      preview.poster_url ??
      null;

    if (!compactSrc) return fallback;
    return (
      <div className={frameClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={compactSrc}
          alt={name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
        {preview.is_catalog ? (
          <Badge variant="secondary" className={cn("absolute bottom-1 left-1 text-[10px] opacity-90", badgeClassName)}>
            Catalog
          </Badge>
        ) : null}
        {preview.render_mode === "video" ? (
          <Badge variant="secondary" className={cn("absolute bottom-1 right-1 text-[10px] opacity-90", badgeClassName)}>
            Video
          </Badge>
        ) : null}
      </div>
    );
  }

  if (preview.render_mode === "html_preview" && framedHtml) {
    return (
      <div className={frameClass}>
        <iframe
          ref={iframeRef}
          title={`Creative preview ${id ?? name}`}
          sandbox="allow-scripts allow-same-origin"
          scrolling="no"
          srcDoc={framedHtml}
          className="h-full w-full border-0"
          onLoad={() => {
            if (process.env.NODE_ENV !== "production") {
              console.log("[creative-render-surface] iframe loaded", {
                id: id ?? null,
                render_mode: preview.render_mode,
              });
            }
          }}
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
    const coverSrc = preview.poster_url ?? preview.image_url ?? null;
    if (size !== "large" && coverSrc) {
      return (
        <div className={frameClass}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt={name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onLoad={() => {
              if (process.env.NODE_ENV !== "production") {
                console.log("[creative-render-surface] video poster loaded", {
                  id: id ?? null,
                  render_mode: preview.render_mode,
                });
              }
            }}
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
          onLoadedData={() => {
            if (process.env.NODE_ENV !== "production") {
              console.log("[creative-render-surface] video loaded", {
                id: id ?? null,
                render_mode: preview.render_mode,
              });
            }
          }}
          onError={() => {
            if (process.env.NODE_ENV !== "production") {
              console.error("[creative-render-surface] video failed", {
                id: id ?? null,
                render_mode: preview.render_mode,
              });
            }
          }}
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
          onLoad={() => {
            if (process.env.NODE_ENV !== "production") {
              console.log("[creative-render-surface] image loaded", {
                id: id ?? null,
                render_mode: preview.render_mode,
              });
            }
          }}
          onError={() => {
            if (process.env.NODE_ENV !== "production") {
              console.error("[creative-render-surface] image failed", {
                id: id ?? null,
                render_mode: preview.render_mode,
                src,
              });
            }
          }}
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
