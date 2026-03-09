"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CreativePreviewKind = "image" | "video" | "catalog";
export type CreativePreviewState = "preview" | "catalog" | "unavailable";

type SourceName = "previewUrl" | "thumbnailUrl" | "imageUrl";

export type CreativePreviewProps = {
  id?: string;
  name: string;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewState?: CreativePreviewState;
  isCatalog?: boolean;
  kind?: CreativePreviewKind;
  className?: string;
  badgeClassName?: string;
  size?: "thumb" | "card" | "large";
};

const SIZE_MAP: Record<NonNullable<CreativePreviewProps["size"]>, string> = {
  thumb: "h-10 w-10 rounded",
  card: "aspect-square w-full",
  large: "aspect-video w-full rounded-md",
};

let previewRenderLogs = 0;
const PREVIEW_RENDER_LOG_LIMIT = 5;

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isMetaImageHost(hostname: string): boolean {
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

function toRenderableUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!isMetaImageHost(parsed.hostname)) return url;
    return `/api/media/meta-preview?src=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

function buildSources(input: CreativePreviewProps): Array<{ source: SourceName; rawUrl: string; mediaUrl: string }> {
  const ordered: Array<{ source: SourceName; value: string | null }> = [
    { source: "previewUrl", value: normalizeUrl(input.previewUrl) },
    { source: "thumbnailUrl", value: normalizeUrl(input.thumbnailUrl) },
    { source: "imageUrl", value: normalizeUrl(input.imageUrl) },
  ];

  const seen = new Set<string>();
  const unique: Array<{ source: SourceName; rawUrl: string; mediaUrl: string }> = [];

  for (const candidate of ordered) {
    if (!candidate.value || seen.has(candidate.value)) continue;
    seen.add(candidate.value);
    unique.push({
      source: candidate.source,
      rawUrl: candidate.value,
      mediaUrl: toRenderableUrl(candidate.value),
    });
  }

  return unique;
}

export function CreativePreview({
  id,
  name,
  previewUrl,
  thumbnailUrl,
  imageUrl,
  previewState,
  isCatalog = false,
  kind = "image",
  className,
  badgeClassName,
  size = "card",
}: CreativePreviewProps) {
  const sources = useMemo(
    () => buildSources({ id, name, previewUrl, thumbnailUrl, imageUrl, previewState, isCatalog, kind, className, badgeClassName, size }),
    [badgeClassName, className, id, imageUrl, isCatalog, kind, name, previewState, previewUrl, size, thumbnailUrl]
  );
  const [index, setIndex] = useState(0);
  const [loadFailures, setLoadFailures] = useState(0);
  const active = sources[index] ?? null;
  const previousSourceRef = useRef<string | null>(null);

  useEffect(() => {
    setIndex(0);
    setLoadFailures(0);
  }, [previewUrl, thumbnailUrl, imageUrl, id]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (previewRenderLogs >= PREVIEW_RENDER_LOG_LIMIT) return;
    previewRenderLogs += 1;
    console.log("[creative-preview:new] render", {
      id: id ?? null,
      name,
      chosenSource: active?.source ?? null,
      chosenUrl: active?.rawUrl ?? null,
      isCatalog,
      previewState: previewState ?? null,
      kind,
    });
  }, [active?.rawUrl, active?.source, id, isCatalog, kind, name, previewState]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const prev = previousSourceRef.current;
    const current = active?.source ?? null;
    if (prev && current && prev !== current) {
      console.warn("[creative-preview:new] fallback transition", {
        id: id ?? null,
        name,
        from: prev,
        to: current,
      });
    }
    previousSourceRef.current = current;
  }, [active?.source, id, name]);

  const onError = () => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[creative-preview:new] load failure", {
        id: id ?? null,
        name,
        source: active?.source ?? null,
        url: active?.rawUrl ?? null,
      });
    }

    if (index < sources.length - 1) {
      setIndex((current) => current + 1);
      setLoadFailures((count) => count + 1);
      return;
    }

    setIndex(sources.length);
    setLoadFailures((count) => count + 1);
  };

  const onLoad = () => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[creative-preview:new] load success", {
        id: id ?? null,
        name,
        source: active?.source ?? null,
        url: active?.rawUrl ?? null,
        loadFailures,
      });
    }
  };

  const frameClass = cn("relative overflow-hidden bg-muted/30", SIZE_MAP[size], className);

  if (!active) {
    return (
      <div className={cn(frameClass, "flex items-center justify-center text-[11px] text-muted-foreground")}>
        {isCatalog ? "Catalog" : "Preview unavailable"}
      </div>
    );
  }

  return (
    <div className={frameClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={active.mediaUrl}
        alt={name}
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        onError={onError}
      />

      {isCatalog ? (
        <Badge variant="secondary" className={cn("absolute bottom-1 left-1 text-[10px] opacity-90", badgeClassName)}>
          Catalog
        </Badge>
      ) : null}

      {kind === "video" ? (
        <Badge variant="secondary" className={cn("absolute bottom-1 right-1 text-[10px] opacity-90", badgeClassName)}>
          Video
        </Badge>
      ) : null}
    </div>
  );
}
