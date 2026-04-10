import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-commercial", () => ({
  getBusinessCommercialTruthSnapshot: vi.fn(),
}));

vi.mock("@/lib/business-operating-mode", () => ({
  buildAccountOperatingMode: vi.fn(),
}));

vi.mock("@/lib/meta/creatives-api", () => ({
  getMetaCreativesApiPayload: vi.fn(),
}));

vi.mock("@/lib/meta/campaigns-source", () => ({
  getMetaCampaignsForRange: vi.fn(),
}));

vi.mock("@/lib/meta/adsets-source", () => ({
  getMetaAdSetsForRange: vi.fn(),
}));

vi.mock("@/lib/meta/breakdowns-source", () => ({
  getMetaBreakdownsForRange: vi.fn(),
}));

vi.mock("@/lib/creative-decision-os-config", () => ({
  isCreativeDecisionOsV1EnabledForBusiness: vi.fn(),
}));

vi.mock("@/lib/creative-decision-os", () => ({
  buildCreativeDecisionOs: vi.fn(),
}));

const access = await import("@/lib/access");
const commercial = await import("@/lib/business-commercial");
const operatingMode = await import("@/lib/business-operating-mode");
const creativesApi = await import("@/lib/meta/creatives-api");
const campaignsSource = await import("@/lib/meta/campaigns-source");
const adsetsSource = await import("@/lib/meta/adsets-source");
const breakdownsSource = await import("@/lib/meta/breakdowns-source");
const config = await import("@/lib/creative-decision-os-config");
const decisionOs = await import("@/lib/creative-decision-os");
const { GET } = await import("@/app/api/creatives/decision-os/route");

function buildCreativeApiRow() {
  return {
    id: "ad_1",
    creative_id: "cr_1",
    object_story_id: "story_1",
    effective_object_story_id: "story_1",
    post_id: "post_1",
    associated_ads_count: 1,
    account_id: "act_1",
    account_name: "Main",
    campaign_id: "cmp_1",
    campaign_name: "Campaign 1",
    adset_id: "adset_1",
    adset_name: "Ad Set 1",
    currency: "USD",
    name: "Creative name",
    launch_date: "2026-03-01",
    copy_text: "Buy now",
    copy_variants: ["Buy now"],
    headline_variants: ["Headline"],
    description_variants: ["Description"],
    copy_source: null,
    copy_debug_sources: [],
    unresolved_reason: null,
    preview_url: "https://example.com/preview.jpg",
    preview_source: "image_url",
    thumbnail_url: "https://example.com/thumb.jpg",
    image_url: "https://example.com/image.jpg",
    table_thumbnail_url: "https://example.com/table.jpg",
    card_preview_url: "https://example.com/card.jpg",
    preview_manifest: null,
    cached_thumbnail_url: null,
    is_catalog: false,
    preview_state: "preview",
    preview: {
      render_mode: "image",
      image_url: "https://example.com/image.jpg",
      video_url: null,
      poster_url: null,
      source: "image_url",
      is_catalog: false,
    },
    preview_status: "ready",
    preview_origin: "snapshot",
    tags: [],
    ai_tags: {
      messagingAngle: ["utility"],
      hookTactic: ["travel_pack"],
    },
    format: "image",
    creative_type: "feed",
    creative_type_label: "Feed",
    creative_delivery_type: "standard",
    creative_visual_format: "image",
    creative_primary_type: "standard",
    creative_primary_label: "Standard",
    creative_secondary_type: null,
    creative_secondary_label: null,
    classification_signals: null,
    taxonomy_version: "v2",
    taxonomy_source: "deterministic",
    taxonomy_reconciled_by_video_evidence: false,
    spend: 100,
    purchase_value: 250,
    roas: 2.5,
    cpa: 10,
    cpc_link: 2,
    cpm: 12,
    ctr_all: 1.5,
    purchases: 10,
    impressions: 1000,
    clicks: 75,
    link_clicks: 50,
    landing_page_views: 0,
    add_to_cart: 15,
    initiate_checkout: 0,
    leads: 0,
    messages: 0,
    thumbstop: 12,
    click_to_atc: 20,
    atc_to_purchase: 66,
    video25: 0,
    video50: 0,
    video75: 0,
    video100: 0,
  };
}

describe("GET /api/creatives/decision-os", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(config.isCreativeDecisionOsV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(commercial.getBusinessCommercialTruthSnapshot).mockResolvedValue({
      businessId: "biz",
      targetPack: null,
      countryEconomics: [],
      promoCalendar: [],
      operatingConstraints: null,
      costModelContext: null,
      sectionMeta: {
        targetPack: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
        countryEconomics: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
        promoCalendar: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
        operatingConstraints: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
      },
    } as never);
    vi.mocked(operatingMode.buildAccountOperatingMode).mockReturnValue({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      currentMode: "Exploit",
      recommendedMode: "Exploit",
      confidence: 0.82,
      why: ["Strong targets."],
      guardrails: ["Scale in steps."],
      changeTriggers: ["Performance slips."],
      activeCommercialInputs: [],
      platformInputs: [],
      missingInputs: [],
    } as never);
    vi.mocked(creativesApi.getMetaCreativesApiPayload).mockResolvedValue({
      status: "ok",
      rows: [buildCreativeApiRow()],
    } as never);
    vi.mocked(campaignsSource.getMetaCampaignsForRange).mockResolvedValue({
      status: "ok",
      rows: [{ id: "cmp_1", name: "Campaign 1", status: "ACTIVE", spend: 300, revenue: 900, purchases: 25, roas: 3, cpa: 12, optimizationGoal: "Purchase", objective: "OUTCOME_SALES" } as never],
      isPartial: false,
      notReadyReason: null,
    });
    vi.mocked(adsetsSource.getMetaAdSetsForRange).mockResolvedValue({
      status: "ok",
      rows: [{ id: "adset_1", name: "Ad Set 1", campaignId: "cmp_1", status: "ACTIVE", spend: 100, revenue: 250, purchases: 10, cpa: 10, ctr: 1.5, impressions: 1000, clicks: 50, dailyBudget: 100, lifetimeBudget: null, optimizationGoal: "Purchase", bidStrategyType: null, bidStrategyLabel: null, manualBidAmount: null, bidValue: null, bidValueFormat: null, isBudgetMixed: false, isConfigMixed: false } as never],
      isPartial: false,
      notReadyReason: null,
    });
    vi.mocked(breakdownsSource.getMetaBreakdownsForRange).mockResolvedValue({
      status: "ok",
      age: [],
      location: [{ key: "US", label: "US", spend: 100, revenue: 250, purchases: 10, clicks: 50, impressions: 1000 }],
      placement: [],
      budget: { campaign: [], adset: [] },
      audience: { available: false },
      products: { available: false },
      isPartial: false,
      notReadyReason: null,
    });
    vi.mocked(decisionOs.buildCreativeDecisionOs).mockReturnValue({
      contractVersion: "creative-decision-os.v1",
      engineVersion: "2026-04-10-phase-04-v1",
      generatedAt: "2026-04-10T00:00:00.000Z",
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      summary: {
        totalCreatives: 1,
        scaleReadyCount: 1,
        keepTestingCount: 0,
        fatiguedCount: 0,
        blockedCount: 0,
        comebackCount: 0,
        message: "Decision OS highlights which creatives to scale, keep in test, refresh, block, or retest.",
        operatingMode: "Exploit",
      },
      creatives: [],
      families: [],
      patterns: [],
      lifecycleBoard: [],
      operatorQueues: [],
      commercialTruthCoverage: {
        operatingMode: "Exploit",
        confidence: 0.82,
        missingInputs: [],
        activeInputs: [],
        guardrails: [],
        configuredSections: {
          targetPack: false,
          countryEconomics: false,
          promoCalendar: false,
          operatingConstraints: false,
        },
      },
    } as never);
  });

  it("returns the typed creative decision os payload with no-store caching", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/creatives/decision-os?businessId=biz&startDate=2026-04-01&endDate=2026-04-10",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.contractVersion).toBe("creative-decision-os.v1");
    expect(decisionOs.buildCreativeDecisionOs).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        rows: expect.arrayContaining([
          expect.objectContaining({
            creativeId: "ad_1",
            copyText: "Buy now",
            objectStoryId: "story_1",
          }),
        ]),
      }),
    );
  });

  it("returns 404 when the feature gate is disabled", async () => {
    vi.mocked(config.isCreativeDecisionOsV1EnabledForBusiness).mockReturnValue(false);

    const response = await GET(
      new NextRequest("http://localhost/api/creatives/decision-os?businessId=biz"),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("creative_decision_os_disabled");
  });
});
