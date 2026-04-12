import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";

const mockUseQuery = vi.fn((input: { queryKey: unknown[] }) => {
  const queryKey = input.queryKey[0];
  if (queryKey === "command-center-creative-overlay") {
    return {
      data: { actions: [] },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
  }

  return {
    data: null,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (input: { queryKey: unknown[] }) => mockUseQuery(input),
}));

vi.mock("@/store/preferences-store", () => ({
  usePreferencesStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      language: "en",
      creativeOperatorPreset: "creative_rich",
    }),
}));

vi.mock("@/components/date-range/DateRangePicker", () => ({
  DateRangePicker: () => React.createElement("div", null, "date-range-picker"),
}));

vi.mock("@/components/creatives/creative-commercial-context-card", () => ({
  CreativeCommercialContextCard: () => React.createElement("div", null, "commercial-context-card"),
}));

vi.mock("@/src/services", () => ({
  getAiCreativeRuleCommentary: vi.fn(),
  getCommandCenter: vi.fn(),
}));

const { CreativeDetailExperience } = await import(
  "@/components/creatives/CreativeDetailExperience"
);

function buildApiRow(overrides: Partial<MetaCreativeApiRow> = {}): MetaCreativeApiRow {
  return {
    id: "creative_missing",
    creative_id: "cr_missing",
    object_story_id: null,
    effective_object_story_id: null,
    post_id: null,
    associated_ads_count: 1,
    account_id: "act_1",
    account_name: "Main",
    campaign_id: "cmp_1",
    campaign_name: "Campaign 1",
    adset_id: "adset_1",
    adset_name: "Ad Set 1",
    currency: "USD",
    name: "Preview Missing Creative",
    launch_date: "2026-03-01",
    copy_text: "Buy now",
    copy_variants: ["Buy now"],
    headline_variants: ["Headline"],
    description_variants: ["Description"],
    copy_source: null,
    copy_debug_sources: [],
    unresolved_reason: null,
    preview_url: null,
    preview_source: null,
    thumbnail_url: null,
    image_url: null,
    table_thumbnail_url: null,
    card_preview_url: null,
    preview_manifest: {
      table_src: null,
      card_src: null,
      detail_image_src: null,
      detail_video_src: null,
      render_state: "missing",
      card_state: "missing",
      waiting_reason: "missing_media",
      table_source_kind: "none",
      card_source_kind: "none",
      resolution_class: "unknown",
      thumbnail_like: false,
      source_reason: "unavailable",
      needs_card_enrichment: false,
      live_html_available: false,
    },
    cached_thumbnail_url: null,
    is_catalog: false,
    preview_state: "unavailable",
    preview: {
      render_mode: "unavailable",
      image_url: null,
      video_url: null,
      poster_url: null,
      source: null,
      is_catalog: false,
    },
    preview_status: "missing",
    preview_origin: "snapshot",
    tags: [],
    ai_tags: {},
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
    ...overrides,
  };
}

function buildDecisionOsRow(rowId: string) {
  return {
    creativeId: rowId,
    familyId: "family_1",
    familyLabel: "Hero Family",
    familySource: "story_identity",
    name: "Preview Missing Creative",
    creativeFormat: "image",
    creativeAgeDays: 21,
    spend: 100,
    purchaseValue: 250,
    roas: 2.5,
    cpa: 10,
    ctr: 1.5,
    purchases: 10,
    impressions: 1000,
    linkClicks: 50,
    score: 78,
    confidence: 0.79,
    lifecycleState: "blocked",
    primaryAction: "block_deploy",
    legacyAction: "pause",
    legacyLifecycleState: "blocked",
    decisionSignals: ["Preview truth missing"],
    summary: "Preview truth is missing, so this creative cannot move authoritatively.",
    benchmark: {
      selectedCohort: "family",
      selectedCohortLabel: "Family",
      sampleSize: 2,
      fallbackChain: ["family"],
      missingContext: [],
      metrics: {
        roas: { current: 2.5, benchmark: 2.1, deltaPct: 0.19, status: "better" },
        cpa: { current: 10, benchmark: 12, deltaPct: -0.16, status: "better" },
        ctr: { current: 1.5, benchmark: 1.2, deltaPct: 0.25, status: "better" },
        clickToPurchase: { current: 0.2, benchmark: 0.16, deltaPct: 0.25, status: "better" },
        attention: {
          label: "Thumbstop",
          current: 12,
          benchmark: 10,
          deltaPct: 0.2,
          status: "better",
        },
      },
    },
    fatigue: {
      status: "clear",
      confidence: 0.74,
      ctrDecay: null,
      clickToPurchaseDecay: null,
      roasDecay: null,
      spendConcentration: 0.41,
      frequencyPressure: 1.2,
      winnerMemory: true,
      evidence: [],
      missingContext: [],
    },
    economics: {
      status: "meets_floor",
      absoluteSpendFloor: 75,
      absolutePurchaseFloor: 5,
      roasFloor: 1.8,
      cpaCeiling: 18,
      reasons: [],
    },
    familyProvenance: {
      confidence: "high",
      overGroupingRisk: "low",
      evidence: ["Creative family matched stable copy and landing-page signals."],
    },
    deployment: {
      metaFamily: "purchase",
      metaFamilyLabel: "Purchase",
      targetLane: null,
      targetAdSetRole: null,
      preferredCampaignIds: [],
      preferredCampaignNames: [],
      preferredAdSetIds: [],
      preferredAdSetNames: [],
      eligibleLanes: [],
      geoContext: "core",
      queueVerdict: "blocked",
      queueSummary: "No queue entry is honest while preview truth is missing.",
      constraints: ["Preview truth is missing."],
      compatibility: {
        status: "blocked",
        objectiveFamily: "sales",
        optimizationGoal: "purchase",
        bidRegime: "cost_cap",
        reasons: ["Preview truth is missing."],
      },
      whatWouldChangeThisDecision: [],
    },
    previewStatus: {
      selectedWindow: "missing",
      liveDecisionWindow: "missing",
      reason: "No trustworthy preview media is available for the live decision window.",
    },
    pattern: {
      hook: "travel",
      angle: "utility",
      format: "image",
    },
    report: {
      creativeId: rowId,
      creativeName: "Preview Missing Creative",
      action: "pause",
      lifecycleState: "blocked",
      score: 78,
      confidence: 0.79,
      summary: "Preview truth is missing, so this creative cannot move authoritatively.",
      timeframeContext: {
        coreVerdict: "Selected analytics remain supportive, but live preview truth is unavailable.",
        selectedRangeOverlay: "Selected range is not the authority source for live deployment.",
        historicalSupport: "Historical support exists but cannot override missing preview truth.",
      },
      accountContext: {
        roasAvg: 2,
        cpaAvg: 14,
        ctrAvg: 1.1,
        spendMedian: 80,
        spendP20: 40,
        spendP80: 160,
      },
      factors: [
        {
          label: "Preview truth",
          impact: "negative",
          value: "missing",
          reason: "No trustworthy preview media is available.",
        },
      ],
    },
    trust: {
      surfaceLane: "action_core",
      truthState: "live_confident",
      operatorDisposition: "review_hold",
      reasons: ["Preview truth is missing."],
      evidence: {
        materiality: "material",
      },
    },
  } as any;
}

describe("CreativeDetailExperience", () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
  });

  it("treats missing preview truth as the gate and keeps AI commentary bounded", () => {
    const row = mapApiRowToUiRow(buildApiRow());
    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={{ creatives: [buildDecisionOsRow(row.id)] } as any}
        open
        notes=""
        dateRange={{
          preset: "last30Days",
          customStart: "2026-04-01",
          customEnd: "2026-04-10",
          lastDays: 30,
          sinceDate: "",
        }}
        defaultCurrency="USD"
        onOpenChange={() => {}}
        onNotesChange={() => {}}
        onDateRangeChange={() => {}}
      />,
    );

    expect(html).toContain("Preview Truth Gate");
    expect(html).toContain("Preview missing");
    expect(html).toContain("authoritative action is blocked");
    expect(html).toContain("AI commentary");
    expect(html).toContain("Support only");
    expect(html).toContain("AI interpretation stays disabled because preview truth is missing.");
    expect(html).not.toContain("Generate AI interpretation");
  });
});
