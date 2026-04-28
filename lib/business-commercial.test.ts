import { beforeEach, describe, expect, it, vi } from "vitest";

const queryLog: string[] = [];
const tableResponses = {
  targetPack: [] as unknown[],
  countryEconomics: [] as unknown[],
  promoCalendar: [] as unknown[],
  operatingConstraints: [] as unknown[],
  calibrationProfiles: [] as unknown[],
};

vi.mock("@/lib/db", () => {
  const sql = vi.fn(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    queryLog.push(text);

    if (text.includes("FROM business_target_packs")) return tableResponses.targetPack;
    if (text.includes("FROM business_country_economics")) return tableResponses.countryEconomics;
    if (text.includes("FROM business_promo_calendar_events")) return tableResponses.promoCalendar;
    if (text.includes("FROM business_operating_constraints")) return tableResponses.operatingConstraints;
    if (text.includes("FROM business_decision_calibration_profiles")) {
      return tableResponses.calibrationProfiles;
    }
    return [];
  }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
    query?: ReturnType<typeof vi.fn>;
  };

  sql.query = vi.fn();

  return {
    getDb: vi.fn(() => sql),
  };
});

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn(async () => ({
    ready: true,
    missingTables: [],
    checkedAt: new Date().toISOString(),
  })),
  getDbSchemaReadiness: vi.fn(async () => ({
    ready: true,
    missingTables: [],
    checkedAt: new Date().toISOString(),
  })),
  isMissingRelationError: vi.fn(() => false),
}));

vi.mock("@/lib/business-cost-model", () => ({
  getBusinessCostModel: vi.fn(async () => null),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const businessCommercial = await import("@/lib/business-commercial");

describe("upsertBusinessCommercialTruthSnapshot", () => {
  beforeEach(() => {
    queryLog.length = 0;
    tableResponses.targetPack = [];
    tableResponses.countryEconomics = [];
    tableResponses.promoCalendar = [];
    tableResponses.operatingConstraints = [];
    tableResponses.calibrationProfiles = [];
    vi.clearAllMocks();
  });

  it("uses idempotent keyed upserts for country economics and promo events", async () => {
    await businessCommercial.upsertBusinessCommercialTruthSnapshot({
      businessId: "11111111-1111-4111-8111-111111111111",
      updatedByUserId: "22222222-2222-4222-8222-222222222222",
      snapshot: {
        countryEconomics: [
          {
            countryCode: "US",
            economicsMultiplier: 1.12,
            marginModifier: 0,
            serviceability: "full",
            priorityTier: "tier_1",
            scaleOverride: "default",
            notes: "Retry-safe GEO row",
            sourceLabel: "test",
            updatedAt: null,
            updatedByUserId: null,
          },
        ],
        promoCalendar: [
          {
            eventId: "promo_test",
            title: "Spring Sale",
            promoType: "sale",
            severity: "medium",
            startDate: "2026-04-10",
            endDate: "2026-04-12",
            affectedScope: "all",
            notes: "Retry-safe promo row",
            sourceLabel: "test",
            updatedAt: null,
            updatedByUserId: null,
          },
        ],
        calibrationProfiles: [
          {
            channel: "meta",
            objectiveFamily: "sales",
            bidRegime: "cost_cap",
            archetype: "winner_scale",
            targetRoasMultiplier: 1.1,
            breakEvenRoasMultiplier: 1.02,
            targetCpaMultiplier: 0.92,
            breakEvenCpaMultiplier: 0.97,
            confidenceCap: 0.78,
            actionCeiling: "review_hold",
            notes: "Retry-safe calibration row",
            sourceLabel: "test",
            updatedAt: null,
            updatedByUserId: null,
          },
        ],
      },
    });

    expect(
      queryLog.some(
        (query) =>
          query.includes("INSERT INTO business_country_economics") &&
          query.includes("ON CONFLICT (business_id, country_code)") &&
          query.includes("DO UPDATE SET"),
      ),
    ).toBe(true);

    expect(
      queryLog.some(
        (query) =>
          query.includes("INSERT INTO business_promo_calendar_events") &&
          query.includes("ON CONFLICT (business_id, event_id)") &&
          query.includes("DO UPDATE SET"),
      ),
    ).toBe(true);

    expect(
      queryLog.some(
        (query) =>
          query.includes("INSERT INTO business_decision_calibration_profiles") &&
          query.includes(
            "ON CONFLICT (business_id, channel, objective_family, bid_regime, archetype)",
          ) &&
          query.includes("DO UPDATE SET"),
      ),
    ).toBe(true);
    expect(queryLog.some((query) => query.includes("business_ref_id"))).toBe(true);
  });

  it("persists cost structure on the target pack without changing the target ROAS path", async () => {
    await businessCommercial.upsertBusinessCommercialTruthSnapshot({
      businessId: "11111111-1111-4111-8111-111111111111",
      updatedByUserId: "22222222-2222-4222-8222-222222222222",
      snapshot: {
        targetPack: {
          targetCpa: null,
          targetRoas: 2.8,
          breakEvenCpa: null,
          breakEvenRoas: 1.9,
          contributionMarginAssumption: null,
          aovAssumption: null,
          newCustomerWeight: null,
          defaultRiskPosture: "aggressive",
          costStructure: {
            cogsPercent: 0.3,
            shippingPercent: 0.08,
            fulfillmentPercent: 0.05,
            paymentProcessingPercent: 0.03,
          },
          sourceLabel: "test",
          updatedAt: null,
          updatedByUserId: null,
        },
      },
    });

    const joinedQueries = queryLog.join("\n");
    expect(joinedQueries).toContain("target_roas");
    expect(joinedQueries).toContain("cost_cogs_percent");
    expect(joinedQueries).toContain("cost_shipping_percent");
    expect(joinedQueries).toContain("cost_fulfillment_percent");
    expect(joinedQueries).toContain("cost_payment_processing_percent");

    const sanitized = businessCommercial.sanitizeBusinessCommercialTruthInput(
      "11111111-1111-4111-8111-111111111111",
      {
        targetPack: {
          targetCpa: null,
          targetRoas: 2.8,
          breakEvenCpa: null,
          breakEvenRoas: 1.9,
          contributionMarginAssumption: null,
          aovAssumption: null,
          newCustomerWeight: null,
          defaultRiskPosture: "aggressive",
          costStructure: {
            cogsPercent: 0.3,
            shippingPercent: 0.08,
            fulfillmentPercent: 0.05,
            paymentProcessingPercent: 0.03,
          },
          sourceLabel: "test",
          updatedAt: null,
          updatedByUserId: null,
        },
      },
    );
    expect(sanitized.targetPack?.targetRoas).toBe(2.8);
    expect(sanitized.targetPack?.costStructure).toEqual({
      cogsPercent: 0.3,
      shippingPercent: 0.08,
      fulfillmentPercent: 0.05,
      paymentProcessingPercent: 0.03,
    });
  });

  it("normalizes database timestamps before building coverage summaries", async () => {
    const updatedAt = new Date("2026-04-10T09:00:00.000Z");
    tableResponses.targetPack = [
      {
        target_cpa: 42,
        target_roas: 2.8,
        break_even_cpa: 55,
        break_even_roas: 1.9,
        contribution_margin_assumption: 0.42,
        aov_assumption: 110,
        new_customer_weight: 0.35,
        default_risk_posture: "balanced",
        cost_cogs_percent: 0.31,
        cost_shipping_percent: 0.09,
        cost_fulfillment_percent: 0.06,
        cost_payment_processing_percent: 0.03,
        source_label: "seed",
        updated_at: updatedAt,
        updated_by_user_id: "22222222-2222-4222-8222-222222222222",
      },
    ];
    tableResponses.countryEconomics = [
      {
        country_code: "US",
        economics_multiplier: 1.1,
        margin_modifier: 0,
        serviceability: "full",
        priority_tier: "tier_1",
        scale_override: "default",
        notes: null,
        source_label: "seed",
        updated_at: updatedAt,
        updated_by_user_id: "22222222-2222-4222-8222-222222222222",
      },
    ];
    tableResponses.operatingConstraints = [
      {
        site_issue_status: "none",
        checkout_issue_status: "none",
        conversion_tracking_issue_status: "none",
        feed_issue_status: "none",
        stock_pressure_status: "healthy",
        landing_page_concern: null,
        merchandising_concern: null,
        manual_do_not_scale_reason: null,
        source_label: "seed",
        updated_at: updatedAt,
        updated_by_user_id: "22222222-2222-4222-8222-222222222222",
      },
    ];
    tableResponses.calibrationProfiles = [
      {
        channel: "meta",
        objective_family: "sales",
        bid_regime: "cost_cap",
        archetype: "winner_scale",
        target_roas_multiplier: 1.08,
        break_even_roas_multiplier: 1.01,
        target_cpa_multiplier: 0.95,
        break_even_cpa_multiplier: 0.99,
        confidence_cap: 0.8,
        action_ceiling: "review_hold",
        notes: null,
        source_label: "seed",
        updated_at: updatedAt,
        updated_by_user_id: "22222222-2222-4222-8222-222222222222",
      },
    ];

    const snapshot = await businessCommercial.getBusinessCommercialTruthSnapshot(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(snapshot?.sectionMeta.targetPack.updatedAt).toBe(updatedAt.toISOString());
    expect(snapshot?.coverage?.freshness.updatedAt).toBe(updatedAt.toISOString());
    expect(snapshot?.coverage?.calibration.updatedAt).toBe(updatedAt.toISOString());
    expect(snapshot?.targetPack?.costStructure).toEqual({
      cogsPercent: 0.31,
      shippingPercent: 0.09,
      fulfillmentPercent: 0.06,
      paymentProcessingPercent: 0.03,
    });
  });

  it("treats missing country economics as non-blocking global economics context", async () => {
    const updatedAt = new Date("2026-04-10T09:00:00.000Z");
    tableResponses.targetPack = [
      {
        target_cpa: null,
        target_roas: 2.8,
        break_even_cpa: null,
        break_even_roas: 1.9,
        contribution_margin_assumption: null,
        aov_assumption: null,
        new_customer_weight: null,
        default_risk_posture: "balanced",
        cost_cogs_percent: null,
        cost_shipping_percent: null,
        cost_fulfillment_percent: null,
        cost_payment_processing_percent: null,
        source_label: "seed",
        updated_at: updatedAt,
        updated_by_user_id: "22222222-2222-4222-8222-222222222222",
      },
    ];
    tableResponses.countryEconomics = [];
    tableResponses.operatingConstraints = [
      {
        site_issue_status: "none",
        checkout_issue_status: "none",
        conversion_tracking_issue_status: "none",
        feed_issue_status: "none",
        stock_pressure_status: "healthy",
        landing_page_concern: null,
        merchandising_concern: null,
        manual_do_not_scale_reason: null,
        source_label: "seed",
        updated_at: updatedAt,
        updated_by_user_id: "22222222-2222-4222-8222-222222222222",
      },
    ];

    const snapshot = await businessCommercial.getBusinessCommercialTruthSnapshot(
      "11111111-1111-4111-8111-111111111111",
    );

    const countryRequirement = snapshot.coverage?.requiredInputs.find(
      (input) => input.section === "countryEconomics",
    );
    expect(countryRequirement?.blocking).toBe(false);
    expect(countryRequirement?.actionCeiling).toBeNull();
    expect(snapshot.coverage?.blockingReasons.join(" ")).not.toContain(
      "Country economics",
    );
    expect(snapshot.coverage?.nonBlockingReasons.join(" ")).toContain(
      "global cost structure",
    );
    expect(snapshot.coverage?.actionCeilings).not.toContain("monitor_low_truth");
  });
});
