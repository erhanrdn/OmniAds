import { describe, it, expect } from "vitest";
import {
  chooseBestStaticPreviewCandidate,
  describeStaticPreviewSelection,
  getPreviewResolutionClass,
  isLikelyLowResCreativeUrl,
  isThumbnailLikeUrl,
  scorePreviewCandidate,
  pickBestCandidate,
  collectPreviewCandidates,
  buildNormalizedPreview,
  buildCreativePreviewManifest,
  getCreativeStaticPreviewSources,
  getCreativeStaticPreviewState,
  hasAcceptableCardPreviewSource,
  resolveCreativePreviewManifest,
} from "@/lib/meta/creatives-preview";

describe("isLikelyLowResCreativeUrl", () => {
  it("returns true for URLs with dimensions <= 220", () => {
    expect(isLikelyLowResCreativeUrl("https://example.com/image_p150x150.jpg")).toBe(true);
    expect(isLikelyLowResCreativeUrl("https://example.com/thumb_p100x100.jpg")).toBe(true);
  });

  it("returns false for URLs with dimensions > 220", () => {
    expect(isLikelyLowResCreativeUrl("https://example.com/image_p1080x1080.jpg")).toBe(false);
    expect(isLikelyLowResCreativeUrl("https://example.com/image_p400x300.jpg")).toBe(false);
  });

  it("returns false for URLs without dimension patterns", () => {
    expect(isLikelyLowResCreativeUrl("https://example.com/image.jpg")).toBe(false);
  });

  it("returns false for null/non-string input", () => {
    expect(isLikelyLowResCreativeUrl(null)).toBe(false);
    expect(isLikelyLowResCreativeUrl(undefined)).toBe(false);
  });
});

describe("isThumbnailLikeUrl", () => {
  it("returns true for thumbnail keyword in URL", () => {
    expect(isThumbnailLikeUrl("https://example.com/thumbnail_1080.jpg")).toBe(true);
    expect(isThumbnailLikeUrl("https://example.com/thumb_abc.jpg")).toBe(true);
  });

  it("returns true for low-res URLs", () => {
    expect(isThumbnailLikeUrl("https://example.com/img_p100x100.jpg")).toBe(true);
  });

  it("returns true for Facebook CDN thumbnail paths", () => {
    expect(isThumbnailLikeUrl("https://example.com/t39.2147-6/image.jpg")).toBe(true);
  });

  it("returns false for regular high-res image URLs", () => {
    expect(isThumbnailLikeUrl("https://example.com/campaign_banner_1200x628.jpg")).toBe(false);
  });
});

describe("scorePreviewCandidate", () => {
  it("gives higher score to image_hash_lookup than thumbnail_url", () => {
    const hashScore = scorePreviewCandidate({ source: "image_hash_lookup", url: "https://example.com/img_p1080x1080.jpg" });
    const thumbScore = scorePreviewCandidate({ source: "thumbnail_url", url: "https://example.com/img_p1080x1080.jpg" });
    expect(hashScore).toBeGreaterThan(thumbScore);
  });

  it("penalizes low-res URLs", () => {
    const highResScore = scorePreviewCandidate({ source: "image_url", url: "https://example.com/img_p1080x1080.jpg" });
    const lowResScore = scorePreviewCandidate({ source: "image_url", url: "https://example.com/img_p100x100.jpg" });
    expect(highResScore).toBeGreaterThan(lowResScore);
  });

  it("gives bonus for blocking-safe object_story_spec picture sources", () => {
    const originalScore = scorePreviewCandidate({ source: "object_story_spec.link_data.picture", url: "https://example.com/img.jpg" });
    const basicScore = scorePreviewCandidate({ source: "thumbnail_url", url: "https://example.com/img.jpg" });
    expect(originalScore).toBeGreaterThan(basicScore);
  });
});

describe("pickBestCandidate", () => {
  it("returns null for empty candidates", () => {
    expect(pickBestCandidate([])).toBeNull();
  });

  it("picks the highest-scored candidate", () => {
    const candidates = [
      { source: "thumbnail_url", url: "https://example.com/thumb_p100x100.jpg" },
      { source: "image_hash_lookup", url: "https://example.com/full_p1080x1080.jpg" },
    ];
    const best = pickBestCandidate(candidates);
    expect(best?.source).toBe("image_hash_lookup");
  });

  it("respects predicate filter", () => {
    const candidates = [
      { source: "image_hash_lookup", url: "https://example.com/full.jpg" },
      { source: "thumbnail_url", url: "https://example.com/thumb.jpg" },
    ];
    const best = pickBestCandidate(candidates, (c) => c.source === "thumbnail_url");
    expect(best?.source).toBe("thumbnail_url");
  });
});

describe("collectPreviewCandidates", () => {
  it("returns empty candidates for null creative", () => {
    const { candidates } = collectPreviewCandidates(null, new Map());
    expect(candidates).toHaveLength(0);
  });

  it("collects thumbnail_url and image_url from creative", () => {
    const creative = {
      thumbnail_url: "https://example.com/thumb.jpg",
      image_url: "https://example.com/image.jpg",
    } as never;
    const { candidates } = collectPreviewCandidates(creative, new Map());
    const sources = candidates.map((c) => c.source);
    expect(sources).toContain("thumbnail_url");
    expect(sources).toContain("image_url");
  });

  it("deduplicates identical URLs from different sources", () => {
    const creative = {
      thumbnail_url: "https://example.com/same.jpg",
      image_url: "https://example.com/same.jpg",
    } as never;
    const { candidates } = collectPreviewCandidates(creative, new Map());
    expect(candidates).toHaveLength(1);
  });

  it("resolves image hashes from lookup map", () => {
    const creative = { image_hash: "abc123" } as never;
    const hashLookup = new Map([["abc123", "https://example.com/resolved.jpg"]]);
    const { candidates, imageHashResolutions } = collectPreviewCandidates(creative, hashLookup);
    expect(imageHashResolutions[0].resolved).toBe(true);
    expect(candidates.some((c) => c.source === "image_hash_lookup")).toBe(true);
  });
});

describe("buildNormalizedPreview", () => {
  const emptyLookups = {
    imageHashLookup: new Map<string, string>(),
    videoSourceLookup: new Map<string, { source: string | null; picture: string | null }>(),
  };

  it("returns unavailable render_mode for null creative", () => {
    const result = buildNormalizedPreview({
      creative: null,
      promotedObject: null,
      ...emptyLookups,
    });
    expect(result.preview.render_mode).toBe("unavailable");
  });

  it("returns image render_mode for creative with image_url only", () => {
    const result = buildNormalizedPreview({
      creative: { image_url: "https://example.com/image_p1080x1080.jpg" } as never,
      promotedObject: null,
      ...emptyLookups,
    });
    expect(result.preview.render_mode).toBe("image");
    expect(result.preview.image_url).toBe("https://example.com/image_p1080x1080.jpg");
  });

  it("returns video render_mode when video source is available", () => {
    const creative = {
      video_id: "vid123",
      thumbnail_url: "https://example.com/thumb.jpg",
    } as never;
    const videoSourceLookup = new Map([
      ["vid123", { source: "https://example.com/video.mp4", picture: "https://example.com/poster.jpg" }],
    ]);
    const result = buildNormalizedPreview({
      creative,
      promotedObject: null,
      imageHashLookup: new Map(),
      videoSourceLookup,
    });
    expect(result.preview.render_mode).toBe("video");
    expect(result.preview.video_url).toBe("https://example.com/video.mp4");
  });

  it("populates tiers from best available candidates", () => {
    const result = buildNormalizedPreview({
      creative: {
        thumbnail_url: "https://example.com/img_p100x100.jpg",
        image_url: "https://example.com/img_p1080x1080.jpg",
      } as never,
      promotedObject: null,
      ...emptyLookups,
    });
    // Card tier should prefer the high-res image, not the thumbnail
    expect(result.tiers.card_preview_url).toBe("https://example.com/img_p1080x1080.jpg");
  });
});

describe("getCreativeStaticPreviewSources", () => {
  it("keeps grid tier on card-safe sources and table tier on table sources", () => {
    const row = {
      previewManifest: buildCreativePreviewManifest({
        tableSrc: "https://example.com/table.jpg",
        cardSrc: "https://example.com/card.jpg",
        detailImageSrc: "https://example.com/image.jpg",
        detailVideoSrc: null,
        liveHtmlAvailable: false,
      }),
      cardPreviewUrl: "https://example.com/card.jpg",
      tableThumbnailUrl: "https://example.com/table.jpg",
      imageUrl: "https://example.com/image.jpg",
      preview: {
        image_url: "https://example.com/preview-image.jpg",
        poster_url: "https://example.com/poster.jpg",
      },
      previewUrl: "https://example.com/preview.jpg",
      cachedThumbnailUrl: "https://example.com/cached.jpg",
      thumbnailUrl: "https://example.com/thumb.jpg",
    };

    expect(getCreativeStaticPreviewSources(row, "grid")).toEqual(["https://example.com/card.jpg"]);
    expect(getCreativeStaticPreviewSources(row, "card")[0]).toBe("https://example.com/card.jpg");
    expect(getCreativeStaticPreviewSources(row, "table")[0]).toBe("https://example.com/table.jpg");
  });

  it("does not let grid tier fall back to table-grade sources", () => {
    const row = {
      previewManifest: buildCreativePreviewManifest({
        tableSrc: "https://example.com/thumb_p150x120.jpg",
        cardSrc: "https://example.com/thumb_p150x120.jpg",
        detailImageSrc: "https://example.com/thumb_p150x120.jpg",
        detailVideoSrc: null,
        liveHtmlAvailable: false,
      }),
      tableThumbnailUrl: "https://example.com/thumb_p150x120.jpg",
      thumbnailUrl: "https://example.com/thumb_p150x120.jpg",
      previewUrl: "https://example.com/thumb_p150x120.jpg",
    };

    expect(getCreativeStaticPreviewSources(row, "grid")).toEqual([]);
    expect(getCreativeStaticPreviewSources(row, "table")).toEqual([
      "https://example.com/thumb_p150x120.jpg",
    ]);
  });
});

describe("preview manifest helpers", () => {
  it("marks low-res thumbnail-only card sources as needing enrichment", () => {
    const manifest = buildCreativePreviewManifest({
      tableSrc: "https://example.com/thumb_p150x120.jpg",
      cardSrc: "https://example.com/thumb_p150x120.jpg",
      detailImageSrc: "https://example.com/thumb_p150x120.jpg",
      detailVideoSrc: null,
      liveHtmlAvailable: true,
    });

    expect(manifest.needs_card_enrichment).toBe(true);
    expect(manifest.render_state).toBe("renderable_low_quality");
    expect(manifest.card_state).toBe("waiting_meta");
    expect(manifest.waiting_reason).toBe("awaiting_card_source");
    expect(hasAcceptableCardPreviewSource(manifest.card_src)).toBe(false);
    expect(manifest.card_src).toBeNull();
  });

  it("resolves manifest-backed state for card and table tiers", () => {
    const row = {
      previewManifest: buildCreativePreviewManifest({
        tableSrc: "https://example.com/thumb_p150x120.jpg",
        cardSrc: "https://example.com/thumb_p150x120.jpg",
        detailImageSrc: "https://example.com/thumb_p150x120.jpg",
        detailVideoSrc: null,
        liveHtmlAvailable: false,
      }),
    };

    expect(getCreativeStaticPreviewState(row, "table")).toBe("ready");
    expect(getCreativeStaticPreviewState(row, "grid")).toBe("pending");
    expect(getCreativeStaticPreviewState(row, "card")).toBe("ready");
    expect(resolveCreativePreviewManifest(row)?.table_src).toBe("https://example.com/thumb_p150x120.jpg");
  });

  it("treats card-missing but table-backed rows as renderable for table tier", () => {
    const row = {
      previewManifest: buildCreativePreviewManifest({
        tableSrc: "https://example.com/thumb_p150x120.jpg",
        cardSrc: null,
        detailImageSrc: null,
        detailVideoSrc: null,
        liveHtmlAvailable: false,
      }),
    };

    expect(resolveCreativePreviewManifest(row)?.render_state).toBe("renderable_low_quality");
    expect(getCreativeStaticPreviewState(row, "table")).toBe("ready");
    expect(getCreativeStaticPreviewState(row, "grid")).toBe("pending");
    expect(getCreativeStaticPreviewState(row, "card")).toBe("ready");
  });
});

describe("chooseBestStaticPreviewCandidate", () => {
  it("prefers a larger thumbnail over a smaller thumbnail when no non-thumbnail source exists", () => {
    const best = chooseBestStaticPreviewCandidate([
      "https://example.com/thumb_p64x64.jpg",
      "https://example.com/thumb_p640x640.jpg",
    ]);

    expect(best).toBe("https://example.com/thumb_p640x640.jpg");
  });

  it("still prefers a non-thumbnail image over larger thumbnail candidates", () => {
    const best = chooseBestStaticPreviewCandidate([
      "https://example.com/thumb_p640x640.jpg",
      "https://example.com/image_p1200x1200.jpg",
    ]);

    expect(best).toBe("https://example.com/image_p1200x1200.jpg");
  });
});

describe("preview selection observability helpers", () => {
  it("classifies 640 thumbnail URLs as medium resolution", () => {
    expect(getPreviewResolutionClass("https://example.com/thumb_p640x640.jpg")).toBe("medium_res");
  });

  it("marks promoted large thumbnails with the correct reason", () => {
    expect(
      describeStaticPreviewSelection({
        tier: "card",
        selectedUrl: "https://example.com/thumb_p640x640.jpg",
      })
    ).toEqual({
      sourceKind: "thumbnail_static",
      resolutionClass: "medium_res",
      reason: "card_promoted_larger_thumbnail",
    });
  });
});
