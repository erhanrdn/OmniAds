import { describe, it, expect } from "vitest";
import {
  normalizeCopyText,
  uniqueNormalizedText,
  chooseBestCopyText,
  resolveCreativeCopyExtraction,
  normalizeAiTags,
  mergeExtraction,
  extractVariantsFromPreviewHtml,
} from "@/lib/meta/creatives-copy";

describe("normalizeCopyText", () => {
  it("returns null for non-string inputs", () => {
    expect(normalizeCopyText(null)).toBeNull();
    expect(normalizeCopyText(123)).toBeNull();
    expect(normalizeCopyText(undefined)).toBeNull();
  });

  it("returns null for empty or whitespace-only strings", () => {
    expect(normalizeCopyText("")).toBeNull();
    expect(normalizeCopyText("   ")).toBeNull();
    expect(normalizeCopyText("\n\n")).toBeNull();
  });

  it("returns null for single-character strings", () => {
    expect(normalizeCopyText("a")).toBeNull();
  });

  it("normalizes line endings and whitespace", () => {
    expect(normalizeCopyText("hello\r\nworld")).toBe("hello\nworld");
    expect(normalizeCopyText("hello  world")).toBe("hello world");
    expect(normalizeCopyText("hello\u00a0world")).toBe("hello world");
  });

  it("collapses 3+ newlines to double newline", () => {
    expect(normalizeCopyText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeCopyText("  hello world  ")).toBe("hello world");
  });

  it("returns the normalized string for valid input", () => {
    expect(normalizeCopyText("Buy now!")).toBe("Buy now!");
  });
});

describe("uniqueNormalizedText", () => {
  it("deduplicates case-insensitively", () => {
    const result = uniqueNormalizedText(["Hello", "hello", "HELLO"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello");
  });

  it("filters out nullish and short values", () => {
    const result = uniqueNormalizedText([null, undefined, "", "a", "valid text"]);
    expect(result).toEqual(["valid text"]);
  });

  it("preserves insertion order for unique values", () => {
    const result = uniqueNormalizedText(["Alpha", "Beta", "Gamma"]);
    expect(result).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

describe("chooseBestCopyText", () => {
  it("prefers copy_variants over headlines and descriptions", () => {
    const result = chooseBestCopyText({
      copy_variants: ["body text"],
      headline_variants: ["headline"],
      description_variants: ["desc"],
    });
    expect(result).toBe("body text");
  });

  it("falls back to headline when no copy variants", () => {
    const result = chooseBestCopyText({
      copy_variants: [],
      headline_variants: ["headline"],
      description_variants: ["desc"],
    });
    expect(result).toBe("headline");
  });

  it("falls back to description when no copy or headline variants", () => {
    const result = chooseBestCopyText({
      copy_variants: [],
      headline_variants: [],
      description_variants: ["desc"],
    });
    expect(result).toBe("desc");
  });

  it("returns null when all empty", () => {
    const result = chooseBestCopyText({
      copy_variants: [],
      headline_variants: [],
      description_variants: [],
    });
    expect(result).toBeNull();
  });
});

describe("resolveCreativeCopyExtraction", () => {
  it("returns empty extraction for null creative", () => {
    const result = resolveCreativeCopyExtraction(null);
    expect(result.copy_text).toBeNull();
    expect(result.copy_variants).toHaveLength(0);
    expect(result.headline_variants).toHaveLength(0);
    expect(result.description_variants).toHaveLength(0);
    expect(result.copy_source).toBeNull();
  });

  it("extracts copy from object_story_spec.link_data.message", () => {
    const result = resolveCreativeCopyExtraction({
      object_story_spec: {
        link_data: { message: "Buy our product today!" },
      },
    } as never);
    expect(result.copy_text).toBe("Buy our product today!");
    expect(result.copy_source).toBe("object_story_spec.message");
  });

  it("extracts headline from asset_feed_spec.titles", () => {
    const result = resolveCreativeCopyExtraction({
      asset_feed_spec: {
        titles: [{ text: "Amazing Deal" }],
        bodies: [],
        descriptions: [],
      },
    } as never);
    expect(result.headline_variants).toContain("Amazing Deal");
  });

  it("deduplicates copy variants case-insensitively across sources", () => {
    const result = resolveCreativeCopyExtraction({
      body: "Same text",
      object_story_spec: {
        link_data: { message: "same text" },
      },
    } as never);
    expect(result.copy_variants).toHaveLength(1);
  });

  it("prefers asset_feed_spec.bodies over object_story_spec.message for copy_source", () => {
    const result = resolveCreativeCopyExtraction({
      asset_feed_spec: {
        bodies: [{ text: "Asset feed body" }],
        titles: [],
        descriptions: [],
      },
      object_story_spec: {
        link_data: { message: "Link data message" },
      },
    } as never);
    expect(result.copy_source).toBe("asset_feed_spec.bodies");
  });
});

describe("normalizeAiTags", () => {
  it("returns empty object for undefined input", () => {
    expect(normalizeAiTags(undefined)).toEqual({});
    expect(normalizeAiTags([])).toEqual({});
  });

  it("parses colon-separated tags", () => {
    const result = normalizeAiTags(["asset type: Video", "visual format: Carousel"]);
    expect(result.assetType).toContain("Video");
    expect(result.visualFormat).toContain("Carousel");
  });

  it("parses equals-separated tags", () => {
    const result = normalizeAiTags(["seasonality=Summer"]);
    expect(result.seasonality).toContain("Summer");
  });

  it("deduplicates tag values", () => {
    const result = normalizeAiTags(["asset type: Video", "asset type: Video"]);
    expect(result.assetType).toHaveLength(1);
  });

  it("ignores unknown tag keys", () => {
    const result = normalizeAiTags(["unknown key: value"]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("mergeExtraction", () => {
  it("merges copy variants without duplicates", () => {
    const result = mergeExtraction(
      { copy_text: "Alpha text", copy_variants: ["Alpha text"], headline_variants: [], description_variants: [], copy_source: null },
      { copy_variants: ["Beta text", "Alpha text"] }
    );
    expect(result.copy_variants).toEqual(["Alpha text", "Beta text"]);
  });

  it("preserves base copy_source when no new content is added", () => {
    const result = mergeExtraction(
      { copy_text: "Same text", copy_variants: ["Same text"], headline_variants: [], description_variants: [], copy_source: "creative.body" },
      { copy_variants: ["Same text"] }
    );
    expect(result.copy_source).toBe("creative.body");
  });
});

describe("extractVariantsFromPreviewHtml", () => {
  it("extracts message and headline from HTML JSON-like strings", () => {
    const html = `{"message":"Shop now for deals","headline":"Limited time offer"}`;
    const result = extractVariantsFromPreviewHtml(html);
    expect(result.copy_variants).toContain("Shop now for deals");
    expect(result.headline_variants).toContain("Limited time offer");
  });

  it("returns empty arrays for HTML with no matching keys", () => {
    const result = extractVariantsFromPreviewHtml("<div>hello world</div>");
    expect(result.copy_variants).toHaveLength(0);
    expect(result.headline_variants).toHaveLength(0);
    expect(result.description_variants).toHaveLength(0);
  });

  it("deduplicates extracted variants", () => {
    const html = `{"message":"Buy now","primary_text":"Buy now"}`;
    const result = extractVariantsFromPreviewHtml(html);
    expect(result.copy_variants).toHaveLength(1);
  });
});
