"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type CreativePreviewProps = {
  id?: string;
  name: string;
  /** Internal cached URL — highest priority when available */
  cachedUrl?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  sourcePriority?: Array<string | null | undefined>;
  format?: "image" | "video" | "catalog";
  isCatalog?: boolean;
  debugScope?: "top-grid" | "table-thumb" | "other";
  className?: string;
  size?: "card" | "thumb";
};

type ResolvedSource = {
  url: string;
  kind: "priority" | "cached" | "image" | "preview" | "thumbnail";
};

const SIZE_MAP: Record<NonNullable<CreativePreviewProps["size"]>, string> = {
  card: "aspect-[4/5] w-full rounded-lg",
  thumb: "h-12 w-12 rounded",
};

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

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

function proxyUrl(src: string): string {
  return `/api/media/meta-preview?src=${encodeURIComponent(src)}`;
}

function dedupeSources(sources: Array<ResolvedSource | null>): ResolvedSource[] {
  const seen = new Set<string>();
  const output: ResolvedSource[] = [];

  for (const source of sources) {
    if (!source) continue;
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    output.push(source);
  }

  return output;
}

function resolveSources(params: {
  cachedUrl?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  sourcePriority?: Array<string | null | undefined>;
  size: NonNullable<CreativePreviewProps["size"]>;
}): ResolvedSource[] {
  if (Array.isArray(params.sourcePriority) && params.sourcePriority.length > 0) {
    return dedupeSources(
      params.sourcePriority.map((value) => {
        const normalized = normalizeUrl(value);
        return normalized ? { url: normalized, kind: "priority" as const } : null;
      })
    );
  }

  const cached = normalizeUrl(params.cachedUrl);
  const thumbnail = normalizeUrl(params.thumbnailUrl);
  const image = normalizeUrl(params.imageUrl);
  const preview = normalizeUrl(params.previewUrl);

  if (params.size === "card") {
    return dedupeSources([
      image ? { url: image, kind: "image" as const } : null,
      preview ? { url: preview, kind: "preview" as const } : null,
      cached ? { url: cached, kind: "cached" as const } : null,
      thumbnail ? { url: thumbnail, kind: "thumbnail" as const } : null,
    ]);
  }

  return dedupeSources([
    thumbnail ? { url: thumbnail, kind: "thumbnail" as const } : null,
    cached ? { url: cached, kind: "cached" as const } : null,
    image ? { url: image, kind: "image" as const } : null,
    preview ? { url: preview, kind: "preview" as const } : null,
  ]);
}

const compactPreviewDebugCountByScope: Record<string, number> = {};

export function CreativePreview({
  id,
  name,
  cachedUrl,
  thumbnailUrl,
  imageUrl,
  previewUrl,
  sourcePriority,
  format = "image",
  isCatalog = false,
  debugScope = "other",
  className,
  size = "card",
}: CreativePreviewProps) {
  const sources = useMemo(
    () =>
      resolveSources({
        cachedUrl,
        thumbnailUrl,
        imageUrl,
        previewUrl,
        sourcePriority,
        size,
      }),
    [cachedUrl, thumbnailUrl, imageUrl, previewUrl, sourcePriority, size]
  );

  const [sourceIndex, setSourceIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setUseProxy(false);
  }, [id, cachedUrl, thumbnailUrl, imageUrl, previewUrl, sourcePriority, size]);

  const currentSource = sources[sourceIndex] ?? null;
  const currentSrc = currentSource?.url ?? null;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const count = compactPreviewDebugCountByScope[debugScope] ?? 0;
    if (count >= 5) return;
    compactPreviewDebugCountByScope[debugScope] = count + 1;

    console.log("[compact-preview] source pick", {
      scope: debugScope,
      id: id ?? null,
      name,
      size,
      cachedUrl: cachedUrl ?? null,
      thumbnailUrl: thumbnailUrl ?? null,
      imageUrl: imageUrl ?? null,
      previewUrl: previewUrl ?? null,
      sourcePriority: sourcePriority ?? null,
      chosen: currentSrc,
      chosenKind: currentSource?.kind ?? null,
      candidateKinds: sources.map((source) => source.kind),
      useProxy,
    });
  }, [cachedUrl, currentSource?.kind, currentSrc, debugScope, id, imageUrl, name, previewUrl, size, sources, thumbnailUrl, useProxy]);

  if (!currentSrc) {
    return (
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-muted text-[11px] text-muted-foreground",
          SIZE_MAP[size],
          className
        )}
      >
        Preview unavailable
      </div>
    );
  }

  const badgeLabel = isCatalog ? "Catalog" : format === "video" ? "Video" : "Feed";
  const imgSrc = useProxy && isMetaCdnUrl(currentSrc) ? proxyUrl(currentSrc) : currentSrc;

  const handleError = () => {
    if (!useProxy && isMetaCdnUrl(currentSrc)) {
      setUseProxy(true);
      return;
    }

    if (sourceIndex < sources.length - 1) {
      setSourceIndex((prev) => prev + 1);
      setUseProxy(false);
    }
  };

  return (
    <div className={cn("relative overflow-hidden bg-muted", SIZE_MAP[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${sourceIndex}_${useProxy}_${currentSource?.kind ?? "none"}`}
        src={imgSrc}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={handleError}
      />
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
        {badgeLabel}
      </span>
    </div>
  );
}
