import { describe, expect, it } from "vitest";
import {
  classifyMetaCreative,
  coerceCreativeTaxonomyFromLegacy,
  getCreativeDisplayPills,
  reconcileCreativeTaxonomyWithVideoEvidence,
} from "@/lib/meta/creative-taxonomy";

describe("classifyMetaCreative", () => {
  it("detects catalog from DYNAMIC object type", () => {
    const taxonomy = classifyMetaCreative({
      creative: { object_type: "DYNAMIC" } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_delivery_type).toBe("catalog");
    expect(taxonomy.creative_primary_type).toBe("catalog");
  });

  it("detects catalog from template_data", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        object_story_spec: {
          template_data: { template_url: "https://example.com/template" },
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_delivery_type).toBe("catalog");
  });

  it("detects catalog from promoted product set", () => {
    const taxonomy = classifyMetaCreative({
      creative: null,
      promotedObject: { product_set_id: "ps_1" },
    });

    expect(taxonomy.creative_primary_type).toBe("catalog");
  });

  it("detects carousel from child attachments", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        object_story_spec: {
          link_data: {
            child_attachments: [{ image_url: "https://example.com/1.jpg" }, { image_url: "https://example.com/2.jpg" }],
          },
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_visual_format).toBe("carousel");
    expect(taxonomy.creative_primary_type).toBe("carousel");
  });

  it("detects video from video_data", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        object_story_spec: {
          video_data: {},
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_visual_format).toBe("video");
    expect(taxonomy.creative_primary_type).toBe("video");
  });

  it("does not classify a single-asset feed as flexible", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        asset_feed_spec: {
          images: [{ image_url: "https://example.com/image.jpg" }],
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_delivery_type).toBe("standard");
    expect(taxonomy.creative_primary_type).toBe("standard");
  });

  it("classifies mixed asset families as flexible", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        asset_feed_spec: {
          images: [{ image_url: "https://example.com/image.jpg" }],
          videos: [{ video_id: "vid_1" }],
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_delivery_type).toBe("flexible");
    expect(taxonomy.creative_primary_type).toBe("flexible");
    expect(taxonomy.creative_secondary_type).toBe("video");
  });

  it("keeps catalog precedence over video", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        object_type: "DYNAMIC",
        object_story_spec: {
          video_data: {},
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_primary_type).toBe("catalog");
    expect(taxonomy.creative_secondary_type).toBe("video");
  });

  it("keeps flexible precedence over carousel", () => {
    const taxonomy = classifyMetaCreative({
      creative: {
        object_story_spec: {
          link_data: {
            child_attachments: [{ image_url: "https://example.com/1.jpg" }, { image_url: "https://example.com/2.jpg" }],
          },
        },
        asset_feed_spec: {
          images: [{ image_url: "https://example.com/1.jpg" }, { image_url: "https://example.com/2.jpg" }],
        },
      } as never,
      promotedObject: null,
    });

    expect(taxonomy.creative_primary_type).toBe("flexible");
    expect(taxonomy.creative_secondary_type).toBe("carousel");
  });
});

describe("creative taxonomy display helpers", () => {
  it("suppresses primary pill for standard rows", () => {
    const display = getCreativeDisplayPills(
      coerceCreativeTaxonomyFromLegacy({
        format: "image",
        creative_type: "feed",
        is_catalog: false,
      })
    );

    expect(display.primaryLabel).toBeNull();
    expect(display.secondaryLabel).toBeNull();
  });
});

describe("reconcileCreativeTaxonomyWithVideoEvidence", () => {
  it("upgrades stale standard image taxonomy to video when preview is video", () => {
    const taxonomy = reconcileCreativeTaxonomyWithVideoEvidence(
      coerceCreativeTaxonomyFromLegacy({
        format: "image",
        creative_type: "feed",
        is_catalog: false,
      }),
      {
        preview: {
          render_mode: "video",
          video_url: "https://example.com/video.mp4",
        },
      }
    );

    expect(taxonomy.creative_visual_format).toBe("video");
    expect(taxonomy.creative_primary_type).toBe("video");
    expect(taxonomy.creative_secondary_type).toBeNull();
  });

  it("does not flip taxonomy from video metrics alone", () => {
    const taxonomy = reconcileCreativeTaxonomyWithVideoEvidence(
      coerceCreativeTaxonomyFromLegacy({
        format: "image",
        creative_type: "feed",
        is_catalog: false,
      }),
      {
        video25: 12,
      }
    );

    expect(taxonomy.creative_primary_type).toBe("standard");
    expect(taxonomy.creative_visual_format).toBe("image");
    expect(taxonomy.creative_secondary_type).toBeNull();
  });
});
