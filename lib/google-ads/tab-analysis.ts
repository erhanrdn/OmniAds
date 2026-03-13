type Row = Record<string, any>;

function num(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function ratioShare(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function avgRoas(rows: Row[]) {
  const spend = rows.reduce((sum, row) => sum + num(row.spend), 0);
  const revenue = rows.reduce((sum, row) => sum + num(row.revenue), 0);
  return spend > 0 ? revenue / spend : 0;
}

function searchThemeCategory(term: string) {
  const lower = term.toLowerCase();
  if (/\b(brand|official|store|login)\b/.test(lower)) return "brand searches";
  if (/\b(vs|versus|alternative|competitor|compare)\b/.test(lower)) return "competitor searches";
  if (/\b(how|why|fix|problem|issue|repair|solution)\b/.test(lower)) return "problem searches";
  return "product searches";
}

export function analyzeAssets(rows: Row[]): {
  rows: Row[];
  summary: Record<string, number>;
  insights: Record<string, Row[]>;
} {
  const totalSpend = rows.reduce((sum, row) => sum + num(row.spend), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + num(row.revenue), 0);
  const accountAverageRoas = avgRoas(rows);

  const classifiedRows: Row[] = rows.map((row) => {
    const spend = num(row.spend);
    const revenue = num(row.revenue);
    const conversions = num(row.conversions);
    const roas = num(row.roas);
    const spendShare = ratioShare(spend, totalSpend);
    const revenueShare = ratioShare(revenue, totalRevenue);
    const classification =
      roas > accountAverageRoas && conversions >= 2
        ? "top_performer"
        : spendShare >= 8 && revenueShare <= 2
        ? "budget_waste"
        : spend > 20 && conversions === 0
        ? "weak"
        : "stable";

    return {
      ...row,
      spendShare,
      revenueShare,
      classification,
    };
  });

  return {
    rows: classifiedRows,
    summary: {
      accountAverageRoas: Number(accountAverageRoas.toFixed(2)),
      topPerformerCount: classifiedRows.filter((row) => row.classification === "top_performer").length,
      stableCount: classifiedRows.filter((row) => row.classification === "stable").length,
      weakCount: classifiedRows.filter((row) => row.classification === "weak").length,
      budgetWasteCount: classifiedRows.filter((row) => row.classification === "budget_waste").length,
    },
    insights: {
      topConvertingAssets: classifiedRows
        .filter((row) => row.classification === "top_performer")
        .sort((a, b) => num(b.conversions) - num(a.conversions))
        .slice(0, 5),
      assetsWastingSpend: classifiedRows
        .filter((row) => row.classification === "budget_waste" || row.classification === "weak")
        .sort((a, b) => num(b.spend) - num(a.spend))
        .slice(0, 5),
      assetsToExpand: classifiedRows
        .filter((row) => row.classification === "top_performer")
        .sort((a, b) => num(b.roas) - num(a.roas))
        .slice(0, 5),
    },
  };
}

export function analyzeAssetGroups(rows: Row[]): {
  rows: Row[];
  summary: Record<string, number>;
  insights: Record<string, Row[]>;
} {
  const accountAverageRoas = avgRoas(rows);
  const classifiedRows: Row[] = rows.map((row) => {
    const spendShare = num(row.spendShare);
    const revenueShare = num(row.revenueShare);
    const roas = num(row.roas);
    const assetCount = num(row.assetCount);
    const classification =
      roas > accountAverageRoas && revenueShare > spendShare
        ? "scale_candidate"
        : spendShare > revenueShare && roas < accountAverageRoas
        ? "weak"
        : assetCount < 6 || num(row.coverageScore) < 70
        ? "coverage_risk"
        : "healthy";

    return {
      ...row,
      classification,
    };
  });

  return {
    rows: classifiedRows,
    summary: {
      accountAverageRoas: Number(accountAverageRoas.toFixed(2)),
      scaleCandidateCount: classifiedRows.filter((row) => row.classification === "scale_candidate").length,
      healthyCount: classifiedRows.filter((row) => row.classification === "healthy").length,
      weakCount: classifiedRows.filter((row) => row.classification === "weak").length,
      coverageRiskCount: classifiedRows.filter((row) => row.classification === "coverage_risk").length,
    },
    insights: {
      scaleCandidates: classifiedRows.filter((row) => row.classification === "scale_candidate").slice(0, 5),
      weakGroups: classifiedRows.filter((row) => row.classification === "weak").slice(0, 5),
      coverageGaps: classifiedRows.filter((row) => row.classification === "coverage_risk").slice(0, 5),
    },
  };
}

export function analyzeProducts(rows: Row[]): {
  rows: Row[];
  summary: Record<string, number>;
  insights: Record<string, Row[]>;
} {
  const totalSpend = rows.reduce((sum, row) => sum + num(row.spend), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + num(row.revenue), 0);
  const accountAverageRoas = avgRoas(rows);

  const classifiedRows: Row[] = rows.map((row) => {
    const spend = num(row.spend);
    const revenue = num(row.revenue);
    const roas = num(row.roas);
    const spendShare = ratioShare(spend, totalSpend);
    const revenueShare = ratioShare(revenue, totalRevenue);
    const classification =
      roas > accountAverageRoas && revenueShare > spendShare
        ? "scale_product"
        : roas > Math.max(accountAverageRoas * 1.4, 3) && spendShare < 5
        ? "hidden_winner"
        : spend > Math.max(20, totalSpend * 0.04) && roas < accountAverageRoas
        ? "underperforming_product"
        : "stable_product";

    return {
      ...row,
      spendShare,
      revenueShare,
      classification,
    };
  });

  return {
    rows: classifiedRows,
    summary: {
      accountAverageRoas: Number(accountAverageRoas.toFixed(2)),
      scaleProductCount: classifiedRows.filter((row) => row.classification === "scale_product").length,
      underperformingProductCount: classifiedRows.filter((row) => row.classification === "underperforming_product").length,
      hiddenWinnerCount: classifiedRows.filter((row) => row.classification === "hidden_winner").length,
    },
    insights: {
      topRevenueProducts: [...classifiedRows].sort((a, b) => num(b.revenue) - num(a.revenue)).slice(0, 5),
      scaleCandidates: classifiedRows.filter((row) => row.classification === "scale_product").slice(0, 5),
      spendWithoutReturn: classifiedRows
        .filter((row) => num(row.orders ?? row.conversions) === 0 && num(row.spend) > 20)
        .slice(0, 5),
      hiddenWinners: classifiedRows.filter((row) => row.classification === "hidden_winner").slice(0, 5),
    },
  };
}

export function analyzeSearchIntelligence(rows: Row[]): {
  summary: Record<string, number>;
  insights: Record<string, Row[]>;
} {
  const clusterMap = new Map<string, Row>();
  for (const row of rows) {
    const category = searchThemeCategory(String(row.searchTerm ?? ""));
    const current = clusterMap.get(category) ?? {
      cluster: category,
      spend: 0,
      revenue: 0,
      conversions: 0,
      queries: [] as string[],
    };
    current.spend += num(row.spend);
    current.revenue += num(row.revenue);
    current.conversions += num(row.conversions);
    if (current.queries.length < 4) current.queries.push(String(row.searchTerm ?? ""));
    clusterMap.set(category, current);
  }

  const clusters: Row[] = Array.from(clusterMap.values()).map((cluster) => ({
    ...cluster,
    roas: cluster.spend > 0 ? Number((cluster.revenue / cluster.spend).toFixed(2)) : 0,
  }));

  return {
    summary: {
      bestConvertingThemeCount: clusters.filter((cluster) => num(cluster.conversions) >= 2).length,
      wastefulThemeCount: clusters.filter((cluster) => num(cluster.spend) > 50 && num(cluster.conversions) === 0).length,
      emergingThemeCount: clusters.filter((cluster) => num(cluster.conversions) > 0 && num(cluster.spend) < 50).length,
    },
    insights: {
      bestConvertingThemes: [...clusters]
        .filter((cluster) => num(cluster.conversions) > 0)
        .sort((a, b) => num(b.roas) - num(a.roas))
        .slice(0, 5),
      wastefulThemes: [...clusters]
        .filter((cluster) => num(cluster.spend) > 20 && num(cluster.conversions) === 0)
        .sort((a, b) => num(b.spend) - num(a.spend))
        .slice(0, 5),
      newOpportunityQueries: rows
        .filter((row) => !row.isKeyword && num(row.conversions) >= 1)
        .sort((a, b) => num(b.conversions) - num(a.conversions))
        .slice(0, 5),
      semanticClusters: clusters,
    },
  };
}

export function analyzeKeywords(rows: Row[]): {
  rows: Row[];
  summary: Record<string, number>;
  insights: Record<string, Row[]>;
} {
  const accountAverageRoas = avgRoas(rows);
  const classifiedRows: Row[] = rows.map((row) => ({
    ...row,
    classification:
      num(row.spend) > 20 && num(row.conversions) === 0
        ? "negative_candidate"
        : num(row.roas) > accountAverageRoas
        ? "scale_keyword"
        : "weak_keyword",
  }));

  return {
    rows: classifiedRows,
    summary: {
      accountAverageRoas: Number(accountAverageRoas.toFixed(2)),
      scaleKeywordCount: classifiedRows.filter((row) => row.classification === "scale_keyword").length,
      weakKeywordCount: classifiedRows.filter((row) => row.classification === "weak_keyword").length,
      negativeCandidateCount: classifiedRows.filter((row) => row.classification === "negative_candidate").length,
    },
    insights: {
      scaleKeywords: classifiedRows.filter((row) => row.classification === "scale_keyword").slice(0, 5),
      weakKeywords: classifiedRows.filter((row) => row.classification === "weak_keyword").slice(0, 5),
      negativeCandidates: classifiedRows.filter((row) => row.classification === "negative_candidate").slice(0, 5),
    },
  };
}

export function analyzeBudgetScaling(rows: Row[]): {
  rows: Row[];
  summary: Record<string, number>;
  insights: Record<string, Row[]>;
} {
  const accountAverageRoas = avgRoas(rows);
  const totalSpend = rows.reduce((sum, row) => sum + num(row.spend), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + num(row.revenue), 0);

  const classifiedRows: Row[] = rows.map((row) => {
    const spend = num(row.spend);
    const revenue = num(row.revenue);
    const roas = num(row.roas);
    const spendShare =
      row.spendShare != null ? num(row.spendShare) : ratioShare(spend, totalSpend);
    const revenueShare =
      row.revenueShare != null ? num(row.revenueShare) : ratioShare(revenue, totalRevenue);
    const roasDelta = Number((roas - accountAverageRoas).toFixed(2));
    const classification =
      roas > accountAverageRoas && revenueShare > spendShare
        ? "scale_campaign"
        : spendShare > revenueShare && roas < accountAverageRoas
        ? "budget_sink"
        : "stable_campaign";
    return {
      ...row,
      spendShare,
      revenueShare,
      roasDelta,
      classification,
    };
  });

  return {
    rows: classifiedRows,
    summary: {
      totalSpend: Number(totalSpend.toFixed(2)),
      accountAverageRoas: Number(accountAverageRoas.toFixed(2)),
      scaleCampaignCount: classifiedRows.filter((row) => row.classification === "scale_campaign").length,
      stableCampaignCount: classifiedRows.filter((row) => row.classification === "stable_campaign").length,
      budgetSinkCount: classifiedRows.filter((row) => row.classification === "budget_sink").length,
    },
    insights: {
      scaleBudgetCandidates: classifiedRows.filter((row) => row.classification === "scale_campaign").slice(0, 5),
      budgetWasteCampaigns: classifiedRows.filter((row) => row.classification === "budget_sink").slice(0, 5),
      balancedCampaigns: classifiedRows.filter((row) => row.classification === "stable_campaign").slice(0, 5),
    },
  };
}
