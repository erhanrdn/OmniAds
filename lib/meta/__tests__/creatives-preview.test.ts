import { describe, it, expect } from "vitest";
import {
  isLikelyLowResCreativeUrl,
  isThumbnailLikeUrl,
  scorePreviewCandidate,
  pickBestCandidate,
  collectPreviewCandidates,
  buildNormalizedPreview,
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

  it("gives bonus for asset_feed_spec.images[].original_url source", () => {
    const originalScore = scorePreviewCandidate({ source: "asset_feed_spec.images[].original_url", url: "https://example.com/img.jpg" });
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
