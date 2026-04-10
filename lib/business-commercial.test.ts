import { beforeEach, describe, expect, it, vi } from "vitest";

const queryLog: string[] = [];

vi.mock("@/lib/db", () => {
  const sql = vi.fn(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    queryLog.push(text);

    if (text.includes("FROM business_target_packs")) return [];
    if (text.includes("FROM business_country_economics")) return [];
    if (text.includes("FROM business_promo_calendar_events")) return [];
    if (text.includes("FROM business_operating_constraints")) return [];
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

const businessCommercial = await import("@/lib/business-commercial");

describe("upsertBusinessCommercialTruthSnapshot", () => {
  beforeEach(() => {
    queryLog.length = 0;
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
  });
});
