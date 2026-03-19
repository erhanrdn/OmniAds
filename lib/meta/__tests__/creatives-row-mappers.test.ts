import { describe, it, expect } from "vitest";
import {
  r2,
  toISODate,
  nDaysAgo,
  groupRows,
  sortRows,
  hasSuspiciousMissingFunnelMetrics,
} from "@/lib/meta/creatives-row-mappers";
import type { RawCreativeRow } from "@/lib/meta/creatives-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<RawCreativeRow> = {}): RawCreativeRow {
  return {
    id: "row_1",
    creative_id: "cre_1",
    object_story_id: null,
    effective_object_story_id: null,
    post_id: null,
    associated_ads_count: 1,
    account_id: "act_123",
    account_name: "Test Account",
    campaign_id: "camp_1",
    campaign_name: "Campaign",
    currency: "USD",
    adset_id: "adset_1",
    adset_name: "Adset",
    name: "Creative Name",
    format: "feed",
    creative_type: "feed",
    launch_date: "2025-01-01",
    spend: 100,
    impressions: 10000,
    link_clicks: 200,
    landing_page_views: 180,
    add_to_cart: 20,
    initiate_checkout: 10,
    purchases: 5,
    purchase_value: 500,
    leads: 0,
    messages: 0,
    thumbstop: 30,
    video25: 20,
    video50: 15,
    video75: 10,
    video100: 5,
    ctr_all: 2,
    cpm: 10,
    cpc: 0.5,
    roas: 5,
    thumbnail_url: null,
    image_url: null,
    table_thumbnail_url: null,
    card_preview_url: null,
    preview_url: null,
    preview_source: null,
    preview_state: "unavailable",
    preview: {
      render_mode: "unavailable",
      html: null,
      image_url: null,
      video_url: null,
      poster_url: null,
      source: null,
      is_catalog: false,
    },
    is_catalog: false,
    copy_text: null,
    copy_variants: [],
    headline_variants: [],
    description_variants: [],
    copy_source: null,
    copy_debug_sources: [],
    unresolved_reason: null,
    ai_tags: {},
    debug: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("r2", () => {
  it("rounds to 2 decimal places", () => {
    expect(r2(1.234567)).toBe(1.23);
    expect(r2(1.235)).toBe(1.24);
    expect(r2(0)).toBe(0);
  });
});

describe("toISODate", () => {
  it("returns YYYY-MM-DD formatted string", () => {
    const date = new Date("2025-06-15T12:00:00Z");
    const result = toISODate(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("nDaysAgo", () => {
  it("returns a date approximately N days before now", () => {
    const now = Date.now();
    const result = nDaysAgo(7);
    const diff = now - result.getTime();
    const diffDays = diff / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });
});

describe("hasSuspiciousMissingFunnelMetrics", () => {
  it("returns false for empty rows", () => {
    expect(hasSuspiciousMissingFunnelMetrics([])).toBe(false);
  });

  it("returns false when rows have funnel metrics", () => {
    const rows = [
      makeRow({ spend: 200, purchases: 5, add_to_cart: 10 }),
      makeRow({ spend: 150, purchases: 3, add_to_cart: 8 }),
    ];
    expect(hasSuspiciousMissingFunnelMetrics(rows)).toBe(false);
  });

  it("returns true when rows have link_clicks and purchases but zero landing_page_views and initiate_checkout", () => {
    // Mirrors the snapshot corruption pattern: funnel middle is missing
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `row_${i}`, link_clicks: 100, purchases: 3, landing_page_views: 0, initiate_checkout: 0 })
    );
    expect(hasSuspiciousMissingFunnelMetrics(rows)).toBe(true);
  });

  it("returns false when fewer than 5 rows", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      makeRow({ id: `row_${i}`, link_clicks: 100, purchases: 3, landing_page_views: 0, initiate_checkout: 0 })
    );
    expect(hasSuspiciousMissingFunnelMetrics(rows)).toBe(false);
  });
});

describe("groupRows", () => {
  it("returns rows unchanged for groupBy=adName", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const result = groupRows(rows, "adName", new Map());
    expect(result).toHaveLength(2);
  });

  it("groups rows by creative name+format for groupBy=creative", () => {
    const rows = [
      makeRow({ id: "a1", creative_id: "cre_1", name: "Creative A", format: "feed", spend: 100 }),
      makeRow({ id: "a2", creative_id: "cre_1", name: "Creative A", format: "feed", spend: 200 }),
      makeRow({ id: "b1", creative_id: "cre_2", name: "Creative B", format: "feed", spend: 50 }),
    ];
    const result = groupRows(rows, "creative", new Map());
    expect(result).toHaveLength(2);

    const groupA = result.find((r) => r.name === "Creative A");
    expect(groupA?.spend).toBeCloseTo(300);
    expect(groupA?.associated_ads_count).toBe(2);
  });

  it("sums impressions and purchases across grouped rows", () => {
    const rows = [
      makeRow({ id: "a1", name: "Ad X", format: "feed", impressions: 5000, purchases: 3, spend: 100 }),
      makeRow({ id: "a2", name: "Ad X", format: "feed", impressions: 3000, purchases: 2, spend: 80 }),
    ];
    const result = groupRows(rows, "creative", new Map());
    expect(result).toHaveLength(1);
    expect(result[0].impressions).toBe(8000);
    expect(result[0].purchases).toBe(5);
  });

  it("groups by adset_id for groupBy=adset", () => {
    const rows = [
      makeRow({ id: "a1", adset_id: "adset_A", name: "Ad 1", spend: 100 }),
      makeRow({ id: "a2", adset_id: "adset_A", name: "Ad 2", spend: 150 }),
      makeRow({ id: "b1", adset_id: "adset_B", name: "Ad 3", spend: 200 }),
    ];
    const result = groupRows(rows, "adset", new Map());
    expect(result).toHaveLength(2);

    const adsetA = result.find((r) => r.adset_id === "adset_A");
    expect(adsetA?.spend).toBeCloseTo(250);
  });
});

describe("sortRows", () => {
  it("sorts by roas descending", () => {
    const rows = [
      makeRow({ id: "a", roas: 2, spend: 100 }),
      makeRow({ id: "b", roas: 5, spend: 100 }),
      makeRow({ id: "c", roas: 1, spend: 100 }),
    ];
    const sorted = sortRows(rows, "roas");
    expect(sorted[0].roas).toBe(5);
    expect(sorted[2].roas).toBe(1);
  });

  it("sorts by spend descending", () => {
    const rows = [
      makeRow({ id: "a", spend: 50 }),
      makeRow({ id: "b", spend: 200 }),
      makeRow({ id: "c", spend: 100 }),
    ];
    const sorted = sortRows(rows, "spend");
    expect(sorted[0].spend).toBe(200);
    expect(sorted[2].spend).toBe(50);
  });

  it("does not mutate original array", () => {
    const rows = [
      makeRow({ id: "a", spend: 50 }),
      makeRow({ id: "b", spend: 200 }),
    ];
    const original = [...rows];
    sortRows(rows, "spend");
    expect(rows[0].id).toBe(original[0].id);
  });
});
