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
  format?: "image" | "video" | "catalog";
  isCatalog?: boolean;
  debugScope?: "top-grid" | "table-thumb" | "other";
  className?: string;
  size?: "card" | "thumb";
};

const SIZE_MAP: Record<NonNullable<CreativePreviewProps["size"]>, string> = {
  card: "aspect-[4/5] w-full rounded-lg",
  thumb: "h-12 w-12 rounded",
};

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed; // internal cached URL
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

const compactPreviewDebugCountByScope: Record<string, number> = {};

export function CreativePreview({
  id,
  name,
  cachedUrl,
  thumbnailUrl,
  imageUrl,
  previewUrl,
  format = "image",
  isCatalog = false,
  debugScope = "other",
  className,
  size = "card",
}: CreativePreviewProps) {
  const sources = useMemo(
    () =>
      [normalizeUrl(cachedUrl), normalizeUrl(thumbnailUrl), normalizeUrl(imageUrl), normalizeUrl(previewUrl)].filter(
        (value): value is string => Boolean(value)
      ),
    [cachedUrl, thumbnailUrl, imageUrl, previewUrl]
  );

  const [sourceIndex, setSourceIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setUseProxy(false);
  }, [id, thumbnailUrl, imageUrl, previewUrl]);

  const currentSrc = sources[sourceIndex] ?? null;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const count = compactPreviewDebugCountByScope[debugScope] ?? 0;
    if (count >= 5) return;
    compactPreviewDebugCountByScope[debugScope] = count + 1;
    console.log("[compact-preview] source pick", {
      scope: debugScope,
      id: id ?? null,
      name,
      thumbnailUrl: thumbnailUrl ?? null,
      imageUrl: imageUrl ?? null,
      previewUrl: previewUrl ?? null,
      chosen: currentSrc,
      useProxy,
    });
  }, [currentSrc, debugScope, id, imageUrl, name, previewUrl, thumbnailUrl, useProxy]);

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
  const imgSrc = useProxy && isMetaCdnUrl(currentSrc)
    ? proxyUrl(currentSrc)
    : currentSrc;

  const handleError = () => {
    // Try proxy first for Meta CDN URLs
    if (!useProxy && isMetaCdnUrl(currentSrc)) {
      setUseProxy(true);
      return;
    }
    // Then try next source
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((prev) => prev + 1);
      setUseProxy(false);
    }
  };

  return (
    <div className={cn("relative overflow-hidden bg-muted", SIZE_MAP[size], className)}>
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
