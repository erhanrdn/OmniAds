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
  getMetaCampaignDailyRange: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  getMetaRawSnapshotCoverageByEndpoint: vi.fn(),
  getMetaRawSnapshotsForWindow: vi.fn(),
  upsertMetaAdSetDailyRows: vi.fn(),
  upsertMetaCampaignDailyRows: vi.fn(),
}));

const configSnapshots = await import("@/lib/meta/config-snapshots");
const warehouse = await import("@/lib/meta/warehouse");
const apiMeta = await import("@/lib/api/meta");
const {
  getMetaWarehouseAdSets,
  getMetaWarehouseCampaignTable,
  repairMetaWarehouseTruthRange,
} = await import("@/lib/meta/serving");

describe("meta historical serving", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(configSnapshots.readLatestMetaConfigSnapshots).mockResolvedValue(new Map());
    vi.mocked(configSnapshots.readPreviousDifferentMetaConfigDiffs).mockResolvedValue(new Map());
    vi.mocked(apiMeta.resolveMetaCredentials).mockResolvedValue(null as never);
    vi.mocked(apiMeta.fetchMetaCampaignConfigs).mockResolvedValue(new Map() as never);
    vi.mocked(apiMeta.fetchMetaAdSetConfigs).mockResolvedValue(new Map() as never);
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

  it("repairs missing campaign bid values from latest snapshots and persists them", async () => {
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
    expect(warehouse.upsertMetaCampaignDailyRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: "cmp-1",
          objective: "OUTCOME_SALES",
          manualBidAmount: 2200,
          bidValue: 2200,
          bidValueFormat: "currency",
        }),
      ])
    );
  });

  it("repairs missing adset target roas values from latest snapshots and persists them", async () => {
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
    expect(warehouse.upsertMetaAdSetDailyRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          adsetId: "adset-1",
          bidValue: 2.5,
          bidValueFormat: "roas",
        }),
      ])
    );
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

  it("repairs missing campaign and adset config from current Meta config fetch and persists it", async () => {
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
    expect(warehouse.upsertMetaCampaignDailyRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: "cmp-1",
          objective: "OUTCOME_SALES",
          bidValue: 5,
        }),
      ])
    );
    expect(warehouse.upsertMetaAdSetDailyRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          adsetId: "adset-1",
          optimizationGoal: "Purchase",
          bidValue: 4,
        }),
      ])
    );
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
      campaignRowsScanned: 1,
      adsetRowsScanned: 1,
      campaignRowsChanged: 1,
      adsetRowsChanged: 1,
    });
  });
});
