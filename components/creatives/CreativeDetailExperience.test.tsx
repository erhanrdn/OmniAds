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

function buildDecisionOsRow(rowId: string, overrides: Record<string, unknown> = {}) {
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
    benchmarkScope: "account",
    benchmarkScopeLabel: "Account-wide",
    benchmarkReliability: "medium",
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
    ...overrides,
  } as any;
}

describe("CreativeDetailExperience", () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
  });

  it("opens a loading shell when decision support data is not ready yet", () => {
    const row = mapApiRowToUiRow(buildApiRow({ name: "Loading Creative" }));
    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={null}
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

    expect(html).toContain("Loading Creative");
    expect(html).toContain("Creative detail is loading");
    expect(html).toContain("decision support payload");
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

    expect(html).toContain("Preview missing");
    expect(html).toContain("AI strategy interpretation");
    expect(html).toContain("Support only");
    expect(html).toContain("AI interpretation stays disabled because preview truth is missing.");
    expect(html).not.toContain("Generate AI interpretation");
  });

  it("shows the break-even median proxy badge when verdict evidence uses fallback calibration", () => {
    const row = mapApiRowToUiRow(buildApiRow());
    const decisionOsRow = buildDecisionOsRow(row.id, {
      verdict: {
        contractVersion: "creative-verdict.v1",
        phase: "test",
        headline: "Test Winner",
        action: "scale",
        actionReadiness: "needs_review",
        confidence: 0.7,
        evidence: [{ tag: "break_even_proxy_used", weight: "primary" }],
        blockers: [],
        derivedAt: "2026-04-29T00:00:00.000Z",
      },
    });

    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={{ creatives: [decisionOsRow] } as any}
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

    expect(html).toContain("Break-even: median proxy");
    expect(html).toContain("/commercial-truth");
  });

  it("shows an amber phase migration badge for legacy verdict snapshots", () => {
    const row = mapApiRowToUiRow(buildApiRow());
    const decisionOsRow = buildDecisionOsRow(row.id, {
      verdict: {
        contractVersion: "creative-verdict.v1",
        phase: null,
        headline: "Needs Diagnosis",
        action: "diagnose",
        actionReadiness: "blocked",
        confidence: 0.6,
        evidence: [],
        blockers: [],
        derivedAt: "2026-04-29T00:00:00.000Z",
      },
    });

    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={{ creatives: [decisionOsRow] } as any}
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

    expect(html).toContain("Phase: bilinmiyor");
    expect(html).toContain("Bu snapshot eski");
    expect(html).toContain("Re-run analysis");
  });

  it("shows the Promote to Scale CTA for ready test winners", () => {
    const row = mapApiRowToUiRow(buildApiRow());
    const decisionOsRow = buildDecisionOsRow(row.id, {
      verdict: {
        contractVersion: "creative-verdict.v1",
        phase: "test",
        phaseSource: "default_test",
        headline: "Test Winner",
        action: "scale",
        actionReadiness: "ready",
        confidence: 0.86,
        evidence: [{ tag: "above_break_even", weight: "primary" }],
        blockers: [],
        derivedAt: "2026-04-29T00:00:00.000Z",
      },
    });

    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={{ creatives: [decisionOsRow] } as any}
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

    expect(html).toContain("Promote to Scale");
  });

  it("keeps AI interpretation support-only when preview truth is ready", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        id: "creative_ready",
        creative_id: "cr_ready",
        name: "Preview Ready Creative",
        preview_url: "https://example.com/preview.jpg",
        preview_source: "snapshot",
        thumbnail_url: "https://example.com/thumb.jpg",
        image_url: "https://example.com/image.jpg",
        table_thumbnail_url: "https://example.com/table.jpg",
        card_preview_url: "https://example.com/card.jpg",
        preview_manifest: {
          table_src: "https://example.com/table.jpg",
          card_src: "https://example.com/card.jpg",
          detail_image_src: "https://example.com/image.jpg",
          detail_video_src: null,
          render_state: "renderable_high_quality",
          card_state: "ready",
          waiting_reason: null,
          table_source_kind: "thumbnail_static",
          card_source_kind: "non_thumbnail_static",
          resolution_class: "high_res",
          thumbnail_like: false,
          source_reason: "card_prefer_non_thumbnail",
          needs_card_enrichment: false,
          live_html_available: true,
        },
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
      }),
    );
    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={{
          creatives: [
            buildDecisionOsRow(row.id, {
              name: "Preview Ready Creative",
              primaryAction: "promote_to_scaling",
              summary: "Preview truth is ready, so this creative can keep decisive wording.",
              previewStatus: {
                selectedWindow: "ready",
                liveDecisionWindow: "ready",
                reason: "Live preview media is available for the live decision window.",
              },
              deployment: {
                metaFamily: "purchase",
                metaFamilyLabel: "Purchase",
                targetLane: "Scaling",
                targetAdSetRole: "scaling_hero",
                preferredCampaignIds: [],
                preferredCampaignNames: [],
                preferredAdSetIds: [],
                preferredAdSetNames: [],
                eligibleLanes: ["Scaling"],
                geoContext: "core",
                queueVerdict: "eligible",
                queueSummary: "Queue entry is honest because preview truth is ready.",
                constraints: [],
                compatibility: {
                  status: "compatible",
                  objectiveFamily: "sales",
                  optimizationGoal: "purchase",
                  bidRegime: "cost_cap",
                  reasons: [],
                },
                whatWouldChangeThisDecision: [],
              },
              report: {
                creativeId: row.id,
                creativeName: "Preview Ready Creative",
                action: "scale",
                lifecycleState: "scale_ready",
                score: 88,
                confidence: 0.86,
                summary: "Preview truth is ready, so this creative can keep decisive wording.",
                timeframeContext: {
                  coreVerdict: "Live preview truth and economics both support the current decision.",
                  selectedRangeOverlay: "Selected range remains analysis context only.",
                  historicalSupport: "Historical support reinforces but does not override the live window.",
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
                    impact: "positive",
                    value: "ready",
                    reason: "Live preview media is available for decisive review.",
                  },
                ],
              },
            }),
          ],
        } as any}
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

    expect(html).toContain("AI strategy interpretation");
    expect(html).toContain("Support only");
    expect(html).toContain("Generate AI interpretation");
  });

  it("shows benchmark scope, reliability, and business-validation notes without hiding relative strength", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        id: "creative_scale_review",
        creative_id: "cr_scale_review",
        name: "Scale Review Creative",
        preview_url: "https://example.com/preview.jpg",
        preview_source: "snapshot",
        thumbnail_url: "https://example.com/thumb.jpg",
        image_url: "https://example.com/image.jpg",
        table_thumbnail_url: "https://example.com/table.jpg",
        card_preview_url: "https://example.com/card.jpg",
        preview_manifest: {
          table_src: "https://example.com/table.jpg",
          card_src: "https://example.com/card.jpg",
          detail_image_src: "https://example.com/image.jpg",
          detail_video_src: null,
          render_state: "renderable_high_quality",
          card_state: "ready",
          waiting_reason: null,
          table_source_kind: "thumbnail_static",
          card_source_kind: "non_thumbnail_static",
          resolution_class: "high_res",
          thumbnail_like: false,
          source_reason: "card_prefer_non_thumbnail",
          needs_card_enrichment: false,
          live_html_available: true,
        },
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
      }),
    );
    const html = renderToStaticMarkup(
      <CreativeDetailExperience
        businessId="biz"
        row={row}
        allRows={[row]}
        creativeHistoryById={new Map()}
        decisionOs={{
          creatives: [
            buildDecisionOsRow(row.id, {
              name: "Scale Review Creative",
              summary:
                "Strong relative performer against the Account-wide benchmark. Business validation is still missing, so this stays review-only.",
              previewStatus: {
                selectedWindow: "ready",
                liveDecisionWindow: "ready",
                reason: "Live preview media is available for the live decision window.",
              },
              benchmarkScope: "account",
              benchmarkScopeLabel: "Account-wide",
              benchmarkReliability: "medium",
              trust: {
                surfaceLane: "watchlist",
                truthState: "degraded_missing_truth",
                operatorDisposition: "profitable_truth_capped",
                reasons: ["Business validation is still missing."],
                evidence: {
                  materiality: "material",
                },
              },
              operatorPolicy: {
                contractVersion: "operator-policy.v1",
                policyVersion: "creative-operator-policy.v1",
                state: "investigate",
                segment: "scale_review",
                actionClass: "scale",
                evidenceSource: "live",
                pushReadiness: "operator_review_required",
                queueEligible: false,
                canApply: false,
                reasons: ["Business validation is still missing."],
                blockers: [],
                missingEvidence: ["commercial_truth"],
                requiredEvidence: ["commercial_truth", "relative_baseline"],
                explanation: "Review manually before any scale move.",
              },
            }),
          ],
        } as any}
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

    expect(html).toContain("Account-wide");
    expect(html).toContain("Business validation is still missing, so this stays review-only.");
  });
});
