"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type CreativeRenderPayload = {
  render_mode: "video" | "image" | "unavailable";
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
  mode?: "asset" | "full";
  assetFallbacks?: (string | null | undefined)[];
};

type ResolvedAssetSource = {
  src: string;
  source: string;
};

const SIZE_MAP: Record<NonNullable<CreativeRenderSurfaceProps["size"]>, string> = {
  thumb: "h-10 w-10 rounded",
  card: "aspect-[4/5] w-full",
  large: "aspect-[4/5] w-full rounded-lg",
};

const LOG_LIMIT = 5;
let assetLogCount = 0;
let fullLogCount = 0;
let thumbnailRenderLogCount = 0;
let thumbnailLoadLogCount = 0;

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function isMetaCdnUrl(url: string): boolean {
  try {
    const normalized = normalizeUrl(url);
    if (!normalized || normalized.startsWith("/")) return false;
    const host = new URL(normalized).hostname.toLowerCase();
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

function proxyUrl(src: string): string {
  return `/api/media/meta-preview?src=${encodeURIComponent(src)}`;
}

function dedupeSourcesInOrder(candidates: Array<{ src: string | null; source: string }>): ResolvedAssetSource[] {
  const seen = new Set<string>();
  const resolved: ResolvedAssetSource[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate.src);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    resolved.push({
      src: normalized,
      source: candidate.source,
    });
  }

  return resolved;
}

function resolveAssetSources(
  preview: CreativeRenderPayload,
  assetFallbacks: (string | null | undefined)[] | undefined,
  _size: NonNullable<CreativeRenderSurfaceProps["size"]>
): ResolvedAssetSource[] {
  return dedupeSourcesInOrder([
    ...(assetFallbacks ?? []).map((src, index) => ({ src: src ?? null, source: `fallback_${index}` })),
    { src: preview.image_url, source: "preview.image_url" },
    { src: preview.poster_url, source: "preview.poster_url" },
  ]);
}

function PreviewFallback({ frameClass, name }: { frameClass: string; name: string }) {
  return (
    <div
      className={cn(
        frameClass,
        "flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-2 dark:from-blue-950/20 dark:to-purple-950/20"
      )}
    >
      <div className="mb-2 text-3xl opacity-40">🎨</div>
      <div className="line-clamp-2 px-1 text-center text-[10px] font-medium text-muted-foreground">
        {name}
      </div>
    </div>
  );
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

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    if (mode === "asset") {
      if (assetLogCount >= LOG_LIMIT) return;
      assetLogCount += 1;
      const sources = resolveAssetSources(preview, assetFallbacks, size);
      console.log("[creative-render] ASSET mode", {
        id: id ?? null,
        name: name.slice(0, 40),
        render_mode: preview.render_mode,
        size,
        sources_count: sources.length,
        chosen_candidate: sources[0]
          ? {
              src: sources[0].src.slice(0, 80),
              source: sources[0].source,
            }
          : null,
      });
      return;
    }

    if (fullLogCount >= LOG_LIMIT) return;
    fullLogCount += 1;
    console.log("[creative-render] FULL mode", {
      id: id ?? null,
      name,
      render_mode: preview.render_mode,
      has_video: Boolean(preview.video_url),
      has_image: Boolean(preview.image_url || preview.poster_url),
      is_catalog: preview.is_catalog,
    });
  }, [assetFallbacks, id, mode, name, preview, size]);

  if (mode === "asset") {
    return (
      <AssetImage
        id={id}
        name={name}
        preview={preview}
        assetFallbacks={assetFallbacks}
        frameClass={frameClass}
        size={size}
      />
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
        {badgeClassName ? <div className={badgeClassName} /> : null}
      </div>
    );
  }

  if (preview.render_mode === "image") {
    const src = normalizeUrl(preview.image_url) ?? normalizeUrl(preview.poster_url);
    if (!src) {
      return <PreviewFallback frameClass={frameClass} name={name} />;
    }

    return (
      <AssetFrame
        frameClass={frameClass}
        name={name}
        src={src}
        fallback={<PreviewFallback frameClass={frameClass} name={name} />}
      />
    );
  }

  return <PreviewFallback frameClass={frameClass} name={name} />;
}

function AssetImage({
  id,
  name,
  preview,
  assetFallbacks,
  frameClass,
  size,
}: {
  id?: string;
  name: string;
  preview: CreativeRenderPayload;
  assetFallbacks?: (string | null | undefined)[];
  frameClass: string;
  size: NonNullable<CreativeRenderSurfaceProps["size"]>;
}) {
  const sources = useMemo(() => resolveAssetSources(preview, assetFallbacks, size), [preview, assetFallbacks, size]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setUseProxy(false);
    setExhausted(false);
  }, [sources]);

  const current = sources[sourceIndex] ?? null;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (thumbnailRenderLogCount >= LOG_LIMIT) return;

    thumbnailRenderLogCount += 1;
    console.log("creative thumbnail render", {
      id: id ?? null,
      name,
      size,
      chosenSrc: current?.src ?? null,
      chosenSource: current?.source ?? null,
    });
  }, [current, id, name, size]);

  if (!current || exhausted) {
    return <PreviewFallback frameClass={frameClass} name={name} />;
  }

  const imgSrc = useProxy && isMetaCdnUrl(current.src) ? proxyUrl(current.src) : current.src;

  const handleError = () => {
    if (!useProxy && isMetaCdnUrl(current.src)) {
      setUseProxy(true);
      return;
    }

    if (sourceIndex < sources.length - 1) {
      setSourceIndex((prev) => prev + 1);
      setUseProxy(false);
      return;
    }

    setExhausted(true);
  };

  return (
    <AssetFrame
      frameClass={frameClass}
      name={name}
      src={imgSrc}
      fallback={<PreviewFallback frameClass={frameClass} name={name} />}
      onError={handleError}
      imageKey={`${sourceIndex}_${useProxy}_${current.source}`}
    />
  );
}

function AssetFrame({
  frameClass,
  name,
  src,
  fallback,
  onError,
  imageKey,
}: {
  frameClass: string;
  name: string;
  src: string;
  fallback: React.ReactNode;
  onError?: () => void;
  imageKey?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return <>{fallback}</>;
  }

  return (
    <div className={frameClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={imageKey ?? src}
        src={src}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => {
          if (process.env.NODE_ENV === "production") return;
          if (thumbnailLoadLogCount >= LOG_LIMIT) return;
          thumbnailLoadLogCount += 1;
          console.log("[creative-render][img-load]", {
            name,
            src: src.slice(0, 180),
          });
        }}
        onError={() => {
          if (process.env.NODE_ENV !== "production" && thumbnailLoadLogCount < LOG_LIMIT) {
            thumbnailLoadLogCount += 1;
            console.warn("[creative-render][img-error]", {
              name,
              src: src.slice(0, 180),
            });
          }
          if (onError) {
            onError();
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}
