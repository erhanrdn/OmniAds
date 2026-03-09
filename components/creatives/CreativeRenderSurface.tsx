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
  className?: string;
  badgeClassName?: string;
  size?: "thumb" | "card" | "large";
};

const SIZE_MAP: Record<NonNullable<CreativeRenderSurfaceProps["size"]>, string> = {
  thumb: "h-10 w-10 rounded",
  card: "aspect-[4/5] w-full",
  large: "aspect-[4/5] w-full rounded-lg",
};

let renderLogCount = 0;
const RENDER_LOG_LIMIT = 5;

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
  className,
  badgeClassName,
  size = "card",
}: CreativeRenderSurfaceProps) {
  useRenderDebugLog(id, name, preview);
  const frameClass = cn("relative overflow-hidden bg-muted/30", SIZE_MAP[size], className);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const fallback = (
    <div className={cn(frameClass, "flex items-center justify-center text-[11px] text-muted-foreground")}>
      {preview.is_catalog ? "Catalog" : "Preview unavailable"}
    </div>
  );

  if (preview.render_mode === "html_preview" && preview.html) {
    return (
      <div className={frameClass}>
        <iframe
          ref={iframeRef}
          title={`Creative preview ${id ?? name}`}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={preview.html}
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
