export type OpportunityType = "scale" | "reduce" | "fix" | "test";

export type OpportunityEntityType =
  | "campaign"
  | "product"
  | "asset"
  | "assetGroup"
  | "keyword"
  | "searchTerm"
  | "audience"
  | "geo"
  | "device";

export interface GoogleAdsOpportunity {
  id: string;
  type: OpportunityType;
  entityType: OpportunityEntityType;
  entityId: string;
  title: string;
  description: string;
  reasoning: string;
  expectedImpact: "low" | "medium" | "high";
  confidence: number;
  metrics: {
    spend?: number;
    revenue?: number;
    roas?: number;
    cpa?: number;
    conversions?: number;
  };
}

type Row = Record<string, any>;

interface OpportunityEngineInput {
  campaigns: Row[];
  products: Row[];
  assets: Row[];
  assetGroups: Row[];
  searchTerms: Row[];
  keywords: Row[];
  audiences: Row[];
  geo: Row[];
  devices: Row[];
}

interface OpportunityEngineResult {
  rows: GoogleAdsOpportunity[];
  summary: {
    scale: number;
    reduce: number;
    fix: number;
    test: number;
    total: number;
  };
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function clampConfidence(value: number) {
  return Number(Math.max(0.2, Math.min(0.98, value)).toFixed(2));
}

function avgRoas(rows: Row[]) {
  const spend = rows.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const revenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  return spend > 0 ? revenue / spend : 0;
}

function avgCpa(rows: Row[]) {
  const spend = rows.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const conversions = rows.reduce(
    (sum, row) => sum + toNumber(row.conversions ?? row.orders),
    0
  );
  return conversions > 0 ? spend / conversions : 0;
}

function shareOfTotal(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function makeOpportunity(params: GoogleAdsOpportunity): GoogleAdsOpportunity {
  return params;
}

export function generateHeadlineSuggestions() {
  return [];
}

export function generateKeywordIdeas() {
  return [];
}

export function generateAssetTextImprovements() {
  return [];
}

export function buildGoogleAdsOpportunityEngine(
  input: OpportunityEngineInput
): OpportunityEngineResult {
  const opportunities: GoogleAdsOpportunity[] = [];
  const campaignAvgRoas = avgRoas(input.campaigns);
  const campaignAvgCpa = avgCpa(input.campaigns);
  const productAvgRoas = avgRoas(input.products);
  const assetGroupAvgRoas = avgRoas(input.assetGroups);
  const totalCampaignSpend = input.campaigns.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const totalCampaignRevenue = input.campaigns.reduce(
    (sum, row) => sum + toNumber(row.revenue),
    0
  );
  const totalProductSpend = input.products.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const assetGroupRoasById = new Map(
    input.assetGroups.map((row) => [String(row.assetGroupId ?? row.id), toNumber(row.roas)])
  );

  for (const campaign of input.campaigns) {
    const spend = toNumber(campaign.spend);
    const revenue = toNumber(campaign.revenue);
    const roas = toNumber(campaign.roas);
    const cpa = toNumber(campaign.cpa);
    const conversions = toNumber(campaign.conversions);
    const spendShare =
      campaign.spendShare != null
        ? toNumber(campaign.spendShare) / 100
        : shareOfTotal(spend, totalCampaignSpend);
    const revenueShare =
      campaign.revenueShare != null
        ? toNumber(campaign.revenueShare) / 100
        : shareOfTotal(revenue, totalCampaignRevenue);

    if (roas > campaignAvgRoas && revenueShare > spendShare) {
      opportunities.push(
        makeOpportunity({
          id: `campaign-scale-${campaign.id}`,
          type: "scale",
          entityType: "campaign",
          entityId: String(campaign.id),
          title: "Scale campaign budget",
          description: "This campaign generates strong return relative to its spend share.",
          reasoning: `ROAS ${roas.toFixed(2)}x is above account average ${campaignAvgRoas.toFixed(2)}x while revenue share (${(revenueShare * 100).toFixed(1)}%) exceeds spend share (${(spendShare * 100).toFixed(1)}%).`,
          expectedImpact: "high",
          confidence: clampConfidence(0.72 + (roas - campaignAvgRoas) * 0.08),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }

    if (spendShare > revenueShare && roas < campaignAvgRoas) {
      opportunities.push(
        makeOpportunity({
          id: `campaign-reduce-${campaign.id}`,
          type: "reduce",
          entityType: "campaign",
          entityId: String(campaign.id),
          title: "Reduce or restructure campaign budget",
          description: "This campaign is consuming more spend share than value share.",
          reasoning: `Spend share (${(spendShare * 100).toFixed(1)}%) is ahead of revenue share (${(revenueShare * 100).toFixed(1)}%), and ROAS ${roas.toFixed(2)}x is below account average ${campaignAvgRoas.toFixed(2)}x.`,
          expectedImpact: "high",
          confidence: clampConfidence(0.7 + (spendShare - revenueShare) * 0.4),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }

    if (conversions === 0 && spend > Math.max(50, totalCampaignSpend * 0.04)) {
      opportunities.push(
        makeOpportunity({
          id: `campaign-test-${campaign.id}`,
          type: "test",
          entityType: "campaign",
          entityId: String(campaign.id),
          title: "Test new targeting or landing path",
          description: "The campaign has enough spend to justify a structured test.",
          reasoning: `Spend reached ${spend.toFixed(2)} with zero conversions, which suggests the current setup is not converting traffic efficiently.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.62),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }
  }

  for (const product of input.products) {
    const spend = toNumber(product.spend);
    const revenue = toNumber(product.revenue);
    const roas = toNumber(product.roas);
    const conversions = toNumber(product.orders ?? product.conversions);
    const cpa = toNumber(product.cpa);
    const spendShare = shareOfTotal(spend, totalProductSpend);

    if (spend > Math.max(20, totalProductSpend * 0.04) && roas < productAvgRoas) {
      opportunities.push(
        makeOpportunity({
          id: `product-reduce-${product.productId ?? product.itemId}`,
          type: "reduce",
          entityType: "product",
          entityId: String(product.productId ?? product.itemId),
          title: "Product wasting spend",
          description: "This product is absorbing spend without matching the account return level.",
          reasoning: `ROAS ${roas.toFixed(2)}x is below product average ${productAvgRoas.toFixed(2)}x after ${spend.toFixed(2)} in spend.`,
          expectedImpact: "high",
          confidence: clampConfidence(0.68),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }

    if (roas > productAvgRoas && spendShare < 0.08) {
      opportunities.push(
        makeOpportunity({
          id: `product-scale-${product.productId ?? product.itemId}`,
          type: "scale",
          entityType: "product",
          entityId: String(product.productId ?? product.itemId),
          title: "Scale product visibility",
          description: "This product is outperforming while receiving relatively little spend.",
          reasoning: `ROAS ${roas.toFixed(2)}x is above product average ${productAvgRoas.toFixed(2)}x and spend share is only ${(spendShare * 100).toFixed(1)}%.`,
          expectedImpact: "high",
          confidence: clampConfidence(0.74),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }
  }

  for (const asset of input.assets) {
    const spend = toNumber(asset.spend);
    const revenue = toNumber(asset.revenue);
    const roas = toNumber(asset.roas);
    const conversions = toNumber(asset.conversions);
    const assetGroupAverage = assetGroupRoasById.get(String(asset.assetGroupId ?? "")) ?? assetGroupAvgRoas;

    if (spend > 20 && conversions === 0) {
      opportunities.push(
        makeOpportunity({
          id: `asset-fix-${asset.id}`,
          type: "fix",
          entityType: "asset",
          entityId: String(asset.assetId ?? asset.id),
          title: "Replace underperforming asset",
          description: "This asset is spending but not converting.",
          reasoning: `${asset.preview ?? asset.assetText ?? "Asset"} has spent ${spend.toFixed(2)} with zero conversions.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.72),
          metrics: { spend, revenue, roas, conversions },
        })
      );
    }

    if (conversions > 0 && roas > assetGroupAverage) {
      opportunities.push(
        makeOpportunity({
          id: `asset-scale-${asset.id}`,
          type: "scale",
          entityType: "asset",
          entityId: String(asset.assetId ?? asset.id),
          title: "Use this asset in more asset groups",
          description: "This asset is outperforming its current asset-group baseline.",
          reasoning: `Asset ROAS ${roas.toFixed(2)}x is above its asset-group average ${assetGroupAverage.toFixed(2)}x.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.66),
          metrics: { spend, revenue, roas, conversions },
        })
      );
    }
  }

  for (const term of input.searchTerms) {
    const spend = toNumber(term.spend);
    const revenue = toNumber(term.revenue);
    const roas = toNumber(term.roas);
    const conversions = toNumber(term.conversions);
    const cpa = toNumber(term.cpa);

    if (conversions >= 2 && !term.isKeyword) {
      opportunities.push(
        makeOpportunity({
          id: `search-add-${term.key ?? term.searchTerm}`,
          type: "scale",
          entityType: "searchTerm",
          entityId: String(term.key ?? term.searchTerm),
          title: "Add keyword",
          description: "This converting query is not yet controlled as a keyword.",
          reasoning: `"${term.searchTerm}" produced ${conversions.toFixed(0)} conversions and is not present as a keyword.`,
          expectedImpact: "high",
          confidence: clampConfidence(0.81),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }

    if (spend > 20 && conversions === 0) {
      opportunities.push(
        makeOpportunity({
          id: `search-negative-${term.key ?? term.searchTerm}`,
          type: "reduce",
          entityType: "searchTerm",
          entityId: String(term.key ?? term.searchTerm),
          title: "Add negative keyword",
          description: "This query is taking spend without generating value.",
          reasoning: `"${term.searchTerm}" spent ${spend.toFixed(2)} with zero conversions.`,
          expectedImpact: "high",
          confidence: clampConfidence(0.84),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }
  }

  for (const keyword of input.keywords) {
    const spend = toNumber(keyword.spend);
    const conversions = toNumber(keyword.conversions);
    const roas = toNumber(keyword.roas);

    if (spend > 30 && conversions === 0) {
      opportunities.push(
        makeOpportunity({
          id: `keyword-fix-${keyword.criterionId ?? keyword.keyword}`,
          type: "fix",
          entityType: "keyword",
          entityId: String(keyword.criterionId ?? keyword.keyword),
          title: "Tighten or pause weak keyword",
          description: "This keyword is spending enough to warrant intervention.",
          reasoning: `Keyword "${keyword.keyword}" spent ${spend.toFixed(2)} with zero conversions.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.65),
          metrics: { spend, roas, conversions },
        })
      );
    }
  }

  for (const assetGroup of input.assetGroups) {
    const spend = toNumber(assetGroup.spend);
    const revenue = toNumber(assetGroup.revenue);
    const roas = toNumber(assetGroup.roas);
    const conversions = toNumber(assetGroup.conversions);
    const cpa = toNumber(assetGroup.cpa);
    const spendShare =
      assetGroup.spendShare != null ? toNumber(assetGroup.spendShare) / 100 : 0;
    const revenueShare =
      assetGroup.revenueShare != null ? toNumber(assetGroup.revenueShare) / 100 : 0;

    if (roas > campaignAvgRoas && revenueShare > spendShare) {
      opportunities.push(
        makeOpportunity({
          id: `asset-group-scale-${assetGroup.id}`,
          type: "scale",
          entityType: "assetGroup",
          entityId: String(assetGroup.id),
          title: "Scale asset group budget",
          description: "This asset group is returning more value than its budget share implies.",
          reasoning: `Asset group ROAS ${roas.toFixed(2)}x is above account average ${campaignAvgRoas.toFixed(2)}x, and revenue share exceeds spend share.`,
          expectedImpact: "high",
          confidence: clampConfidence(0.73),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }

    if (
      (Array.isArray(assetGroup.missingAssetFields) && assetGroup.missingAssetFields.length > 0) ||
      toNumber(assetGroup.messagingMismatchCount) > 0
    ) {
      opportunities.push(
        makeOpportunity({
          id: `asset-group-fix-${assetGroup.id}`,
          type: "fix",
          entityType: "assetGroup",
          entityId: String(assetGroup.id),
          title: "Improve asset coverage",
          description: "This asset group is missing enough coverage to support efficient scale.",
          reasoning:
            toNumber(assetGroup.messagingMismatchCount) > 0
              ? `${assetGroup.messagingMismatchCount} search theme mismatches indicate the messaging does not fully reflect demand.`
              : `Missing asset types: ${(assetGroup.missingAssetFields ?? []).join(", ")}.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.7),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }
  }

  const remarketingAudiences = input.audiences.filter((row) =>
    String(row.type ?? "").toLowerCase().includes("remarketing")
  );
  const otherAudiences = input.audiences.filter(
    (row) => !String(row.type ?? "").toLowerCase().includes("remarketing")
  );
  const remarketingRoas = avgRoas(remarketingAudiences);
  const otherAudienceRoas = avgRoas(otherAudiences);
  if (
    remarketingAudiences.length > 0 &&
    otherAudiences.length > 0 &&
    remarketingRoas > otherAudienceRoas * 1.35
  ) {
    opportunities.push(
      makeOpportunity({
        id: "audience-scale-remarketing",
        type: "scale",
        entityType: "audience",
        entityId: "remarketing",
        title: "Increase remarketing investment",
        description: "Remarketing is materially outperforming the rest of the audience mix.",
        reasoning: `Remarketing ROAS ${remarketingRoas.toFixed(2)}x is well above non-remarketing ROAS ${otherAudienceRoas.toFixed(2)}x.`,
        expectedImpact: "high",
        confidence: clampConfidence(0.76),
        metrics: { roas: remarketingRoas },
      })
    );
  }

  for (const audience of input.audiences) {
    const spend = toNumber(audience.spend);
    const revenue = toNumber(audience.revenue);
    const roas = toNumber(audience.roas);
    const conversions = toNumber(audience.conversions);
    const cpa = toNumber(audience.cpa);

    if (spend > 50 && conversions === 0) {
      opportunities.push(
        makeOpportunity({
          id: `audience-reduce-${audience.criterionId ?? audience.name}`,
          type: "reduce",
          entityType: "audience",
          entityId: String(audience.criterionId ?? audience.name),
          title: "Reduce audience targeting",
          description: "This audience segment is spending without contributing enough conversion value.",
          reasoning: `${audience.name} spent ${spend.toFixed(2)} with zero conversions.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.67),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }
  }

  for (const geo of input.geo) {
    const spend = toNumber(geo.spend);
    const revenue = toNumber(geo.revenue);
    const roas = toNumber(geo.roas);
    const conversions = toNumber(geo.conversions);
    const cpa = toNumber(geo.cpa);

    if (spend > 20 && roas > campaignAvgRoas * 1.15) {
      opportunities.push(
        makeOpportunity({
          id: `geo-scale-${geo.criterionId ?? geo.country}`,
          type: "scale",
          entityType: "geo",
          entityId: String(geo.criterionId ?? geo.country),
          title: "Increase bid adjustment for region",
          description: "This region is outperforming the account baseline.",
          reasoning: `${geo.country} is delivering ${roas.toFixed(2)}x ROAS vs account average ${campaignAvgRoas.toFixed(2)}x.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.69),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    } else if (spend > 20 && roas < campaignAvgRoas * 0.7) {
      opportunities.push(
        makeOpportunity({
          id: `geo-reduce-${geo.criterionId ?? geo.country}`,
          type: "reduce",
          entityType: "geo",
          entityId: String(geo.criterionId ?? geo.country),
          title: "Reduce exposure in region",
          description: "This region is lagging the account baseline on return.",
          reasoning: `${geo.country} is returning ${roas.toFixed(2)}x ROAS vs account average ${campaignAvgRoas.toFixed(2)}x.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.66),
          metrics: { spend, revenue, roas, cpa, conversions },
        })
      );
    }
  }

  const mobile = input.devices.find((row) => String(row.device).toLowerCase().includes("mobile"));
  const desktop = input.devices.find((row) => String(row.device).toLowerCase().includes("desktop"));
  if (mobile && desktop) {
    const mobileRoas = toNumber(mobile.roas);
    const desktopRoas = toNumber(desktop.roas);
    if (mobileRoas > desktopRoas * 1.35) {
      opportunities.push(
        makeOpportunity({
          id: "device-scale-mobile",
          type: "scale",
          entityType: "device",
          entityId: String(mobile.device),
          title: "Increase mobile bid adjustment",
          description: "Mobile is outperforming desktop on return.",
          reasoning: `Mobile ROAS ${mobileRoas.toFixed(2)}x is materially above desktop ROAS ${desktopRoas.toFixed(2)}x.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.71),
          metrics: {
            spend: toNumber(mobile.spend),
            revenue: toNumber(mobile.revenue),
            roas: mobileRoas,
            cpa: toNumber(mobile.cpa),
            conversions: toNumber(mobile.conversions),
          },
        })
      );
    } else if (desktopRoas > mobileRoas * 1.35) {
      opportunities.push(
        makeOpportunity({
          id: "device-reduce-mobile",
          type: "reduce",
          entityType: "device",
          entityId: String(mobile.device),
          title: "Reduce weak mobile exposure",
          description: "Mobile is lagging desktop enough to justify rebalancing.",
          reasoning: `Mobile ROAS ${mobileRoas.toFixed(2)}x trails desktop ROAS ${desktopRoas.toFixed(2)}x.`,
          expectedImpact: "medium",
          confidence: clampConfidence(0.69),
          metrics: {
            spend: toNumber(mobile.spend),
            revenue: toNumber(mobile.revenue),
            roas: mobileRoas,
            cpa: toNumber(mobile.cpa),
            conversions: toNumber(mobile.conversions),
          },
        })
      );
    }
  }

  const deduped = Array.from(
    new Map(opportunities.map((opportunity) => [opportunity.id, opportunity])).values()
  ).sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    if (impactOrder[a.expectedImpact] !== impactOrder[b.expectedImpact]) {
      return impactOrder[a.expectedImpact] - impactOrder[b.expectedImpact];
    }
    return b.confidence - a.confidence;
  });

  return {
    rows: deduped,
    summary: {
      scale: deduped.filter((row) => row.type === "scale").length,
      reduce: deduped.filter((row) => row.type === "reduce").length,
      fix: deduped.filter((row) => row.type === "fix").length,
      test: deduped.filter((row) => row.type === "test").length,
      total: deduped.length,
    },
  };
}
