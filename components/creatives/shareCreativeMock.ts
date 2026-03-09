import { SharePayload } from "./shareCreativeTypes";

/**
 * Mock payload used for local development of the public share page.
 * Includes all preview fields used by CreativeRenderSurface fallback logic.
 */
export const MOCK_SHARE_PAYLOAD: SharePayload = {
  token: "mock-token-123",
  title: "Top Performing Creatives — Feb 2026",
  dateRange: "Feb 12 – Mar 5, 2026",
  createdAt: "2026-03-05T10:00:00.000Z",
  expiresAt: "2026-03-12T10:00:00.000Z",

  metrics: ["spend", "purchaseValue", "roas", "cpa", "ctrAll", "purchases"],

  includeNotes: true,
  note:
    "These creatives were selected based on ROAS and purchase volume over the last 14 days.",

  creatives: [
    {
      id: "m-1",
      name: "UGC Reel - Morning routine hook",
      format: "video",
      previewState: "preview",
      isCatalog: false,

      /** preview image sources */
      cardPreviewUrl: "https://picsum.photos/seed/meta1/800/600",
      tableThumbnailUrl: "https://picsum.photos/seed/meta1/320/240",
      cachedThumbnailUrl: null,
      previewUrl: "https://picsum.photos/seed/meta1/800/600",
      imageUrl: "https://picsum.photos/seed/meta1/800/600",
      thumbnailUrl: "https://picsum.photos/seed/meta1/320/240",

      preview: {
        render_mode: "image",
        image_url: "https://picsum.photos/seed/meta1/800/600",
        video_url: null,
        poster_url: "https://picsum.photos/seed/meta1/800/600",
        source: "preview_url",
        is_catalog: false,
      },

      launchDate: "2026-02-21",
      tags: ["winner", "retargeting"],

      spend: 1840,
      purchaseValue: 6980,
      roas: 3.79,
      cpa: 24.86,
      ctrAll: 2.41,
      purchases: 74,
    },

    {
      id: "m-3",
      name: "Founder story - trust angle",
      format: "video",
      previewState: "preview",
      isCatalog: false,

      cardPreviewUrl: "https://picsum.photos/seed/meta3/800/600",
      tableThumbnailUrl: "https://picsum.photos/seed/meta3/320/240",
      cachedThumbnailUrl: null,
      previewUrl: "https://picsum.photos/seed/meta3/800/600",
      imageUrl: "https://picsum.photos/seed/meta3/800/600",
      thumbnailUrl: "https://picsum.photos/seed/meta3/320/240",

      preview: {
        render_mode: "image",
        image_url: "https://picsum.photos/seed/meta3/800/600",
        video_url: null,
        poster_url: "https://picsum.photos/seed/meta3/800/600",
        source: "preview_url",
        is_catalog: false,
      },

      launchDate: "2026-02-19",
      tags: ["video", "evergreen"],

      spend: 2210,
      purchaseValue: 8320,
      roas: 3.76,
      cpa: 26.95,
      ctrAll: 2.26,
      purchases: 82,
    },

    {
      id: "m-8",
      name: "Bundle offer - creator POV",
      format: "video",
      previewState: "preview",
      isCatalog: false,

      cardPreviewUrl: "https://picsum.photos/seed/meta8/800/600",
      tableThumbnailUrl: "https://picsum.photos/seed/meta8/320/240",
      cachedThumbnailUrl: null,
      previewUrl: "https://picsum.photos/seed/meta8/800/600",
      imageUrl: "https://picsum.photos/seed/meta8/800/600",
      thumbnailUrl: "https://picsum.photos/seed/meta8/320/240",

      preview: {
        render_mode: "image",
        image_url: "https://picsum.photos/seed/meta8/800/600",
        video_url: null,
        poster_url: "https://picsum.photos/seed/meta8/800/600",
        source: "preview_url",
        is_catalog: false,
      },

      launchDate: "2026-03-01",
      tags: ["creator", "bundle"],

      spend: 1090,
      purchaseValue: 4120,
      roas: 3.78,
      cpa: 22.71,
      ctrAll: 2.47,
      purchases: 48,
    },

    {
      id: "m-5",
      name: "Problem-solution demo cut",
      format: "video",
      previewState: "preview",
      isCatalog: false,

      cardPreviewUrl: "https://picsum.photos/seed/meta5/800/600",
      tableThumbnailUrl: "https://picsum.photos/seed/meta5/320/240",
      cachedThumbnailUrl: null,
      previewUrl: "https://picsum.photos/seed/meta5/800/600",
      imageUrl: "https://picsum.photos/seed/meta5/800/600",
      thumbnailUrl: "https://picsum.photos/seed/meta5/320/240",

      preview: {
        render_mode: "image",
        image_url: "https://picsum.photos/seed/meta5/800/600",
        video_url: null,
        poster_url: "https://picsum.photos/seed/meta5/800/600",
        source: "preview_url",
        is_catalog: false,
      },

      launchDate: "2026-02-15",
      tags: ["testing", "demo"],

      spend: 1640,
      purchaseValue: 5180,
      roas: 3.16,
      cpa: 27.8,
      ctrAll: 2.33,
      purchases: 59,
    },
  ],
};

export const MOCK_SHARE_URL = "/share/creative/mock-token-123";
