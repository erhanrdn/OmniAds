import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/meta", () => ({
  resolveMetaCredentials: vi.fn(),
  fetchMetaCampaignConfigs: vi.fn(),
  fetchMetaAdSetConfigs: vi.fn(),
}));

vi.mock("@/lib/meta/config-snapshots", () => ({
  readLatestMetaConfigSnapshots: vi.fn(),
  readPreviousDifferentMetaConfigDiffs: vi.fn(),
}));

vi.mock("@/lib/meta/constraints", () => ({
  getMetaBreakdownSupportedStart: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  emptyMetaWarehouseMetrics: vi.fn(),
  getMetaAdSetDailyCoverage: vi.fn(),
  getMetaAccountDailyCoverage: vi.fn(),
  getMetaAccountDailyRange: vi.fn(),
  getMetaAdSetDailyRange: vi.fn(),
  getMetaBreakdownDailyRange: vi.fn(),
  getMetaCampaignDailyRange: vi.fn(),
  getMetaPublishedVerificationSummary: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  getMetaRawSnapshotCoverageByEndpoint: vi.fn(),
  upsertMetaAccountDailyRows: vi.fn(),
  upsertMetaAdSetDailyRows: vi.fn(),
  upsertMetaCampaignDailyRows: vi.fn(),
  replaceMetaAccountDailySlice: vi.fn(),
  replaceMetaAdSetDailySlice: vi.fn(),
  replaceMetaCampaignDailySlice: vi.fn(),
}));

const configSnapshots = await import("@/lib/meta/config-snapshots");
const constraints = await import("@/lib/meta/constraints");
const warehouse = await import("@/lib/meta/warehouse");
const apiMeta = await import("@/lib/api/meta");
const { repairMetaWarehouseTruthRange } = await import("@/lib/meta/repair");
const {
  getMetaWarehouseSummary,
  getMetaWarehouseAdSets,
  getMetaWarehouseCampaignTable,
  getMetaWarehouseBreakdowns,
} = await import("@/lib/meta/serving");

describe("meta historical serving", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.META_AUTHORITATIVE_FINALIZATION_V2 = "0";
    process.env.META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES = "";
    vi.mocked(configSnapshots.readLatestMetaConfigSnapshots).mockResolvedValue(new Map());
    vi.mocked(configSnapshots.readPreviousDifferentMetaConfigDiffs).mockResolvedValue(new Map());
    vi.mocked(constraints.getMetaBreakdownSupportedStart).mockReturnValue("2026-03-01");
    vi.mocked(apiMeta.resolveMetaCredentials).mockResolvedValue(null as never);
    vi.mocked(apiMeta.fetchMetaCampaignConfigs).mockResolvedValue(new Map() as never);
    vi.mocked(apiMeta.fetchMetaAdSetConfigs).mockResolvedValue(new Map() as never);
    vi.mocked(warehouse.getMetaPublishedVerificationSummary).mockResolvedValue(null as never);
  });

  it("returns campaign current config from warehouse rows without calling snapshot readers", async () => {
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: "OUTCOME_SALES",
        buyingType: null,
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: 5,
        bidValue: 5,
        bidValueFormat: "currency",
        dailyBudget: 10,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 20,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 2,
        revenue: 50,
        roas: 2.5,
        cpa: 10,
        ctr: 4,
        cpc: 5,
        sourceSnapshotId: null,
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "PAUSED",
        objective: "OUTCOME_SALES",
        buyingType: null,
        optimizationGoal: "Lead",
        bidStrategyType: "cost_cap",
        bidStrategyLabel: "Cost Cap",
        manualBidAmount: 7,
        bidValue: 7,
        bidValueFormat: "currency",
        dailyBudget: 15,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 30,
        impressions: 120,
        clicks: 5,
        reach: 120,
        frequency: null,
        conversions: 3,
        revenue: 80,
        roas: 2.67,
        cpa: 10,
        ctr: 4.16,
        cpc: 6,
        sourceSnapshotId: null,
      },
    ] as never);

    const rows = await getMetaWarehouseCampaignTable({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      includePrev: false,
    });

    expect(rows[0]).toMatchObject({
      id: "cmp-1",
      status: "PAUSED",
      optimizationGoal: "Lead",
      bidStrategyType: "cost_cap",
      bidStrategyLabel: "Cost Cap",
      manualBidAmount: 7,
      bidValue: 7,
      dailyBudget: 15,
    });
    expect(configSnapshots.readLatestMetaConfigSnapshots).not.toHaveBeenCalled();
    expect(configSnapshots.readPreviousDifferentMetaConfigDiffs).not.toHaveBeenCalled();
  });

  it("derives campaign previous bid and budget fields from warehouse history", async () => {
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: null,
        buyingType: null,
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: 5,
        bidValue: 5,
        bidValueFormat: "currency",
        dailyBudget: 10,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 10,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 1,
        revenue: 20,
        roas: 2,
        cpa: 10,
        ctr: 4,
        cpc: 2.5,
        sourceSnapshotId: null,
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-02",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: null,
        buyingType: null,
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: 6,
        bidValue: 6,
        bidValueFormat: "currency",
        dailyBudget: 12,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 15,
        impressions: 110,
        clicks: 5,
        reach: 110,
        frequency: null,
        conversions: 2,
        revenue: 30,
        roas: 2,
        cpa: 7.5,
        ctr: 4.5,
        cpc: 3,
        sourceSnapshotId: null,
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: null,
        buyingType: null,
        optimizationGoal: "Purchase",
        bidStrategyType: "cost_cap",
        bidStrategyLabel: "Cost Cap",
        manualBidAmount: 8,
        bidValue: 8,
        bidValueFormat: "currency",
        dailyBudget: 15,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 20,
        impressions: 120,
        clicks: 6,
        reach: 120,
        frequency: null,
        conversions: 3,
        revenue: 40,
        roas: 2,
        cpa: 6.67,
        ctr: 5,
        cpc: 3.33,
        sourceSnapshotId: null,
      },
    ] as never);

    const rows = await getMetaWarehouseCampaignTable({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      includePrev: true,
    });

    expect(rows[0]).toMatchObject({
      previousManualBidAmount: 6,
      previousBidValue: 6,
      previousBidValueFormat: "currency",
      previousBidValueCapturedAt: "2026-04-02T00:00:00.000Z",
      previousDailyBudget: 12,
      previousLifetimeBudget: null,
      previousBudgetCapturedAt: "2026-04-02T00:00:00.000Z",
    });
  });

  it("uses campaign daily truth for summary totals when account rows drift", async () => {
    vi.mocked(warehouse.getMetaAccountDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        accountName: "Account 1",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 1,
        impressions: 10,
        clicks: 1,
        reach: 10,
        frequency: 1,
        conversions: 0,
        revenue: 0,
        roas: 0,
        cpa: null,
        ctr: 10,
        cpc: 1,
        sourceSnapshotId: null,
        updatedAt: "2026-04-02T00:00:00Z",
      },
    ] as never);
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: "OUTCOME_SALES",
        buyingType: null,
        optimizationGoal: null,
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: 100,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 25,
        impressions: 100,
        clicks: 4,
        reach: 90,
        frequency: 1.11,
        conversions: 2,
        revenue: 50,
        roas: 2,
        cpa: 12.5,
        ctr: 4,
        cpc: 6.25,
        sourceSnapshotId: null,
        updatedAt: "2026-04-02T00:00:00Z",
      },
    ] as never);
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: "2026-04-01",
      latest_updated_at: "2026-04-02T00:00:00Z",
      total_rows: 1,
    } as never);
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: "2026-04-01",
      latest_updated_at: "2026-04-02T00:00:00Z",
      total_rows: 1,
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 1, ready_through_date: "2026-04-01" }],
        ["breakdown_country", { completed_days: 1, ready_through_date: "2026-04-01" }],
        ["breakdown_gender", { completed_days: 1, ready_through_date: "2026-04-01" }],
        ["breakdown_platform_position", { completed_days: 1, ready_through_date: "2026-04-01" }],
      ]) as never,
    );
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      leasedPartitions: 0,
      queueDepth: 0,
    } as never);

    const summary = await getMetaWarehouseSummary({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-01",
    });

    expect(summary.totals.spend).toBe(25);
    expect(summary.totals.revenue).toBe(50);
    expect(summary.totals.conversions).toBe(2);
    expect(summary.accounts[0]).toMatchObject({
      providerAccountId: "act_1",
      accountName: "Account 1",
      spend: 25,
      revenue: 50,
    });
  });

  it("filters historical breakdown rows to published verified account-days when v2 is enabled", async () => {
    process.env.META_AUTHORITATIVE_FINALIZATION_V2 = "1";
    process.env.META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES = "";

    vi.mocked(warehouse.getMetaBreakdownDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        breakdownType: "age",
        breakdownKey: "18-24",
        breakdownLabel: "18-24",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 10,
        impressions: 100,
        clicks: 5,
        reach: 90,
        frequency: 1.1,
        conversions: 1,
        revenue: 20,
        roas: 2,
        cpa: 10,
        ctr: 5,
        cpc: 2,
        sourceSnapshotId: null,
        truthState: "finalized",
        truthVersion: 1,
        finalizedAt: "2026-04-02T00:00:00Z",
        validationStatus: "passed",
        sourceRunId: "run-1",
        createdAt: "2026-04-02T00:00:00Z",
        updatedAt: "2026-04-02T00:00:00Z",
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        breakdownType: "country",
        breakdownKey: "US",
        breakdownLabel: "United States",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 11,
        impressions: 100,
        clicks: 5,
        reach: 90,
        frequency: 1.1,
        conversions: 1,
        revenue: 20,
        roas: 2,
        cpa: 10,
        ctr: 5,
        cpc: 2,
        sourceSnapshotId: null,
        truthState: "finalized",
        truthVersion: 1,
        finalizedAt: "2026-04-02T00:00:00Z",
        validationStatus: "passed",
        sourceRunId: "run-1",
        createdAt: "2026-04-02T00:00:00Z",
        updatedAt: "2026-04-02T00:00:00Z",
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        breakdownType: "placement",
        breakdownKey: "facebook|feed|mobile",
        breakdownLabel: "facebook • feed • mobile",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 12,
        impressions: 100,
        clicks: 5,
        reach: 90,
        frequency: 1.1,
        conversions: 1,
        revenue: 20,
        roas: 2,
        cpa: 10,
        ctr: 5,
        cpc: 2,
        sourceSnapshotId: null,
        truthState: "finalized",
        truthVersion: 1,
        finalizedAt: "2026-04-02T00:00:00Z",
        validationStatus: "passed",
        sourceRunId: "run-1",
        createdAt: "2026-04-02T00:00:00Z",
        updatedAt: "2026-04-02T00:00:00Z",
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-02",
        breakdownType: "age",
        breakdownKey: "25-34",
        breakdownLabel: "25-34",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 99,
        impressions: 100,
        clicks: 5,
        reach: 90,
        frequency: 1.1,
        conversions: 1,
        revenue: 20,
        roas: 2,
        cpa: 10,
        ctr: 5,
        cpc: 2,
        sourceSnapshotId: null,
        truthState: "finalized",
        truthVersion: 1,
        finalizedAt: "2026-04-03T00:00:00Z",
        validationStatus: "passed",
        sourceRunId: "run-2",
        createdAt: "2026-04-03T00:00:00Z",
        updatedAt: "2026-04-03T00:00:00Z",
      },
    ] as never);
    vi.mocked(warehouse.getMetaPublishedVerificationSummary).mockResolvedValue({
      verificationState: "finalized_verified",
      truthReady: true,
      totalDays: 2,
      completedCoreDays: 2,
      sourceFetchedAt: "2026-04-03T00:00:00Z",
      publishedAt: "2026-04-03T00:05:00Z",
      asOf: "2026-04-03T00:05:00Z",
      publishedSlices: 2,
      totalExpectedSlices: 2,
      reasonCounts: {},
      publishedKeysBySurface: {
        account_daily: ["act_1:2026-04-01", "act_1:2026-04-02"],
      },
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([] as never);
    vi.mocked(warehouse.getMetaAdSetDailyRange).mockResolvedValue([] as never);

    const payload = await getMetaWarehouseBreakdowns({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-02",
      providerAccountIds: ["act_1"],
    });

    expect(payload.age).toEqual([
      expect.objectContaining({ key: "18-24", spend: 10 }),
    ]);
    expect(payload.location).toEqual([
      expect.objectContaining({ key: "US", spend: 11 }),
    ]);
    expect(payload.placement).toEqual([
      expect.objectContaining({ key: "facebook|feed|mobile", spend: 12 }),
    ]);
  });

  it("returns adset current config from warehouse rows without calling snapshot readers", async () => {
    vi.mocked(warehouse.getMetaAdSetDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: 5,
        bidValue: 5,
        bidValueFormat: "currency",
        dailyBudget: 10,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 15,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 2,
        revenue: 30,
        roas: 2,
        cpa: 7.5,
        ctr: 4,
        cpc: 3.75,
        sourceSnapshotId: null,
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1 latest",
        adsetNameHistorical: "Adset 1 latest",
        adsetStatus: "PAUSED",
        optimizationGoal: "Lead",
        bidStrategyType: "cost_cap",
        bidStrategyLabel: "Cost Cap",
        manualBidAmount: 8,
        bidValue: 8,
        bidValueFormat: "currency",
        dailyBudget: 14,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 20,
        impressions: 120,
        clicks: 6,
        reach: 120,
        frequency: null,
        conversions: 3,
        revenue: 40,
        roas: 2,
        cpa: 6.67,
        ctr: 5,
        cpc: 3.33,
        sourceSnapshotId: null,
      },
    ] as never);

    const rows = await getMetaWarehouseAdSets({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      campaignId: "cmp-1",
      includePrev: false,
    });

    expect(rows[0]).toMatchObject({
      id: "adset-1",
      status: "PAUSED",
      optimizationGoal: "Lead",
      bidStrategyType: "cost_cap",
      manualBidAmount: 8,
      dailyBudget: 14,
    });
    expect(configSnapshots.readLatestMetaConfigSnapshots).not.toHaveBeenCalled();
    expect(configSnapshots.readPreviousDifferentMetaConfigDiffs).not.toHaveBeenCalled();
  });

  it("repairs missing campaign bid values from latest snapshots without persisting them from serving", async () => {
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: null,
        buyingType: null,
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: 15,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 30,
        impressions: 120,
        clicks: 5,
        reach: 120,
        frequency: null,
        conversions: 3,
        revenue: 80,
        roas: 2.67,
        cpa: 10,
        ctr: 4.16,
        cpc: 6,
        sourceSnapshotId: null,
      },
    ] as never);
    vi.mocked(configSnapshots.readLatestMetaConfigSnapshots).mockResolvedValue(
      new Map([
        [
          "cmp-1",
          {
            campaignId: "cmp-1",
            objective: "OUTCOME_SALES",
            optimizationGoal: "Purchase",
            bidStrategyType: "bid_cap",
            bidStrategyLabel: "Bid Cap",
            manualBidAmount: 2200,
            bidValue: 2200,
            bidValueFormat: "currency",
            dailyBudget: 15,
            lifetimeBudget: null,
            isBudgetMixed: false,
            isConfigMixed: false,
            isOptimizationGoalMixed: false,
            isBidStrategyMixed: false,
            isBidValueMixed: false,
          },
        ],
      ])
    );

    const rows = await getMetaWarehouseCampaignTable({
      businessId: "biz-1",
      startDate: "2026-04-03",
      endDate: "2026-04-03",
      includePrev: false,
    });

    expect(rows[0]).toMatchObject({
      objective: "OUTCOME_SALES",
      manualBidAmount: 2200,
      bidValue: 2200,
      bidValueFormat: "currency",
    });
    expect(warehouse.upsertMetaCampaignDailyRows).not.toHaveBeenCalled();
  });

  it("repairs missing adset target roas values from latest snapshots without persisting them from serving", async () => {
    vi.mocked(warehouse.getMetaAdSetDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: "Purchase",
        bidStrategyType: "target_roas",
        bidStrategyLabel: "Target ROAS",
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: 10,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 15,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 2,
        revenue: 30,
        roas: 2,
        cpa: 7.5,
        ctr: 4,
        cpc: 3.75,
        sourceSnapshotId: null,
      },
    ] as never);
    vi.mocked(configSnapshots.readLatestMetaConfigSnapshots).mockResolvedValue(
      new Map([
        [
          "adset-1",
          {
            campaignId: "cmp-1",
            optimizationGoal: "Purchase",
            bidStrategyType: "target_roas",
            bidStrategyLabel: "Target ROAS",
            manualBidAmount: null,
            bidValue: 2.5,
            bidValueFormat: "roas",
            dailyBudget: 10,
            lifetimeBudget: null,
            isBudgetMixed: false,
            isConfigMixed: false,
            isOptimizationGoalMixed: false,
            isBidStrategyMixed: false,
            isBidValueMixed: false,
          },
        ],
      ])
    );

    const rows = await getMetaWarehouseAdSets({
      businessId: "biz-1",
      startDate: "2026-04-03",
      endDate: "2026-04-03",
      campaignId: "cmp-1",
      includePrev: false,
    });

    expect(rows[0]).toMatchObject({
      optimizationGoal: "Purchase",
      bidStrategyType: "target_roas",
      bidValue: 2.5,
      bidValueFormat: "roas",
    });
    expect(warehouse.upsertMetaAdSetDailyRows).not.toHaveBeenCalled();
  });

  it("derives adset previous bid and budget fields from warehouse history", async () => {
    vi.mocked(warehouse.getMetaAdSetDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: 5,
        bidValue: 5,
        bidValueFormat: "currency",
        dailyBudget: 10,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 10,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 1,
        revenue: 20,
        roas: 2,
        cpa: 10,
        ctr: 4,
        cpc: 2.5,
        sourceSnapshotId: null,
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-02",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: "Purchase",
        bidStrategyType: "bid_cap",
        bidStrategyLabel: "Bid Cap",
        manualBidAmount: 6,
        bidValue: 6,
        bidValueFormat: "currency",
        dailyBudget: 12,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 15,
        impressions: 110,
        clicks: 5,
        reach: 110,
        frequency: null,
        conversions: 2,
        revenue: 30,
        roas: 2,
        cpa: 7.5,
        ctr: 4.5,
        cpc: 3,
        sourceSnapshotId: null,
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: "Lead",
        bidStrategyType: "cost_cap",
        bidStrategyLabel: "Cost Cap",
        manualBidAmount: 8,
        bidValue: 8,
        bidValueFormat: "currency",
        dailyBudget: 14,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 20,
        impressions: 120,
        clicks: 6,
        reach: 120,
        frequency: null,
        conversions: 3,
        revenue: 40,
        roas: 2,
        cpa: 6.67,
        ctr: 5,
        cpc: 3.33,
        sourceSnapshotId: null,
      },
    ] as never);

    const rows = await getMetaWarehouseAdSets({
      businessId: "biz-1",
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      campaignId: "cmp-1",
      includePrev: true,
    });

    expect(rows[0]).toMatchObject({
      previousManualBidAmount: 6,
      previousBidValue: 6,
      previousBidValueFormat: "currency",
      previousBidValueCapturedAt: "2026-04-02T00:00:00.000Z",
      previousDailyBudget: 12,
      previousLifetimeBudget: null,
      previousBudgetCapturedAt: "2026-04-02T00:00:00.000Z",
    });
  });

  it("repairs missing campaign and adset config from current Meta config fetch without persisting it from serving", async () => {
    vi.mocked(apiMeta.resolveMetaCredentials).mockResolvedValue({
      businessId: "biz-1",
      accessToken: "token-1",
      accountIds: ["act_1"],
      currency: "USD",
      accountProfiles: {
        act_1: { currency: "USD", timezone: "UTC", name: "Account 1" },
      },
    } as never);
    vi.mocked(apiMeta.fetchMetaCampaignConfigs).mockResolvedValue(
      new Map([
        [
          "cmp-1",
          {
            id: "cmp-1",
            name: "Campaign 1",
            objective: "OUTCOME_SALES",
            bid_strategy: "LOWEST_COST_WITH_BID_CAP",
            bid_amount: "5",
            daily_budget: "10",
          },
        ],
      ]) as never
    );
    vi.mocked(apiMeta.fetchMetaAdSetConfigs).mockResolvedValue(
      new Map([
        [
          "adset-1",
          {
            id: "adset-1",
            name: "Adset 1",
            campaign_id: "cmp-1",
            optimization_goal: "omni_purchase",
            bid_strategy: "LOWEST_COST_WITH_BID_CAP",
            bid_amount: "4",
            daily_budget: "8",
          },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: null,
        buyingType: null,
        optimizationGoal: null,
        bidStrategyType: null,
        bidStrategyLabel: null,
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: null,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 20,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 2,
        revenue: 50,
        roas: 2.5,
        cpa: 10,
        ctr: 4,
        cpc: 5,
        sourceSnapshotId: null,
      },
    ] as never);
    vi.mocked(warehouse.getMetaAdSetDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: null,
        bidStrategyType: null,
        bidStrategyLabel: null,
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: null,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 12,
        impressions: 80,
        clicks: 3,
        reach: 80,
        frequency: null,
        conversions: 1,
        revenue: 24,
        roas: 2,
        cpa: 12,
        ctr: 3.75,
        cpc: 4,
        sourceSnapshotId: null,
      },
    ] as never);

    const [campaignRows, adsetRows] = await Promise.all([
      getMetaWarehouseCampaignTable({
        businessId: "biz-1",
        startDate: "2026-04-03",
        endDate: "2026-04-03",
        includePrev: false,
      }),
      getMetaWarehouseAdSets({
        businessId: "biz-1",
        startDate: "2026-04-03",
        endDate: "2026-04-03",
        campaignId: "cmp-1",
        includePrev: false,
      }),
    ]);

    expect(campaignRows[0]).toMatchObject({
      objective: "OUTCOME_SALES",
      bidStrategyLabel: "Bid Cap",
      bidValue: 5,
      dailyBudget: 10,
    });
    expect(adsetRows[0]).toMatchObject({
      optimizationGoal: "Purchase",
      bidStrategyLabel: "Bid Cap",
      bidValue: 4,
      dailyBudget: 8,
    });
    expect(warehouse.upsertMetaCampaignDailyRows).not.toHaveBeenCalled();
    expect(warehouse.upsertMetaAdSetDailyRows).not.toHaveBeenCalled();
  });

  it("repairs an entire warehouse date range and reports changed row counts", async () => {
    vi.mocked(apiMeta.resolveMetaCredentials).mockResolvedValue({
      businessId: "biz-1",
      accessToken: "token-1",
      accountIds: ["act_1"],
      currency: "USD",
      accountProfiles: {
        act_1: { currency: "USD", timezone: "UTC", name: "Account 1" },
      },
    } as never);
    vi.mocked(apiMeta.fetchMetaCampaignConfigs).mockResolvedValue(
      new Map([
        [
          "cmp-1",
          {
            id: "cmp-1",
            name: "Campaign 1",
            objective: "OUTCOME_SALES",
            bid_strategy: "LOWEST_COST_WITH_BID_CAP",
            bid_amount: "5",
            daily_budget: "10",
          },
        ],
      ]) as never
    );
    vi.mocked(apiMeta.fetchMetaAdSetConfigs).mockResolvedValue(
      new Map([
        [
          "adset-1",
          {
            id: "adset-1",
            name: "Adset 1",
            campaign_id: "cmp-1",
            optimization_goal: "omni_purchase",
            bid_strategy: "LOWEST_COST_WITH_BID_CAP",
            bid_amount: "4",
            daily_budget: "8",
          },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaCampaignDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        campaignNameCurrent: "Campaign 1",
        campaignNameHistorical: "Campaign 1",
        campaignStatus: "ACTIVE",
        objective: null,
        buyingType: null,
        optimizationGoal: null,
        bidStrategyType: null,
        bidStrategyLabel: null,
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: null,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 20,
        impressions: 100,
        clicks: 4,
        reach: 100,
        frequency: null,
        conversions: 2,
        revenue: 50,
        roas: 2.5,
        cpa: 10,
        ctr: 4,
        cpc: 5,
        sourceSnapshotId: null,
      },
    ] as never);
    vi.mocked(warehouse.getMetaAdSetDailyRange).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        campaignId: "cmp-1",
        adsetId: "adset-1",
        adsetNameCurrent: "Adset 1",
        adsetNameHistorical: "Adset 1",
        adsetStatus: "ACTIVE",
        optimizationGoal: null,
        bidStrategyType: null,
        bidStrategyLabel: null,
        manualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        dailyBudget: null,
        lifetimeBudget: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        accountTimezone: "UTC",
        accountCurrency: "USD",
        spend: 12,
        impressions: 80,
        clicks: 3,
        reach: 80,
        frequency: null,
        conversions: 1,
        revenue: 24,
        roas: 2,
        cpa: 12,
        ctr: 3.75,
        cpc: 4,
        sourceSnapshotId: null,
      },
    ] as never);

    const result = await repairMetaWarehouseTruthRange({
      businessId: "biz-1",
      startDate: "2026-04-03",
      endDate: "2026-04-03",
    });

    expect(result).toMatchObject({
      accountRowsScanned: 0,
      campaignRowsScanned: 1,
      adsetRowsScanned: 1,
      accountRowsChanged: 1,
      campaignRowsChanged: 1,
      adsetRowsChanged: 1,
    });
  });
});
