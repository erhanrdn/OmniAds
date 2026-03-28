import type { BusinessCostModel } from "@/lib/business-cost-model";
import type { ProductPerformanceRow } from "@/lib/google-ads/intelligence-model";
import type {
  GoogleCommerceConfidence,
  GoogleDiscountState,
  GoogleMarginBand,
  GoogleRecommendation,
  GoogleRecommendationCommerceSignals,
  GoogleStockState,
} from "@/lib/google-ads/growth-advisor-types";

interface CommerceSourceRecord {
  productItemId: string | null;
  productTitle: string;
  inventory?: number | null;
  availability?: string | null;
  compareAtPrice?: number | null;
}

interface ProductCommerceAssessment {
  productItemId: string | null;
  productTitle: string;
  signals: GoogleRecommendationCommerceSignals;
  commerceConfidence: GoogleCommerceConfidence | null;
  reasons: string[];
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ");
}

function productMeta(row: ProductPerformanceRow) {
  return row as ProductPerformanceRow & Record<string, unknown>;
}

function inferDiscountState(row: ProductPerformanceRow): GoogleDiscountState {
  const meta = productMeta(row);
  const compareAt = Number(meta.compareAtPrice ?? meta.compare_at_price ?? 0);
  const price = Number(row.feedPrice ?? meta.feedPrice ?? meta.price ?? 0);
  if (compareAt > 0 && price > 0 && compareAt > price) return "discounted";
  if (price > 0) return "full_price";
  return "unknown";
}

function inferMarginBand(row: ProductPerformanceRow, costModel?: BusinessCostModel | null): GoogleMarginBand {
  const meta = productMeta(row);
  const contributionProxy = Number(meta.contributionProxy ?? row.contributionProxy ?? 0);
  const revenue = Number(row.revenue ?? 0);
  const spend = Number(row.spend ?? 0);
  if (Number.isFinite(contributionProxy) && contributionProxy !== 0 && revenue > 0) {
    const marginRate = contributionProxy / revenue;
    if (marginRate >= 0.35) return "high";
    if (marginRate >= 0.12) return "medium";
    return "low";
  }

  if (!costModel || revenue <= 0) return "unknown";
  const variableCostRate = costModel.cogsPercent + costModel.shippingPercent + costModel.feePercent;
  const profitProxy = revenue * (1 - variableCostRate) - spend;
  const marginRate = revenue > 0 ? profitProxy / revenue : 0;
  if (marginRate >= 0.25) return "high";
  if (marginRate >= 0.08) return "medium";
  return "low";
}

function inferHighConfidenceStock(input: {
  row: ProductPerformanceRow;
  exactSource?: CommerceSourceRecord | null;
}): { stockState: GoogleStockState; confidence: GoogleCommerceConfidence | null; reason?: string } {
  const meta = productMeta(input.row);
  const inventoryValue =
    input.exactSource?.inventory ??
    (typeof meta.inventory === "number" ? Number(meta.inventory) : null) ??
    (typeof meta.stock === "number" ? Number(meta.stock) : null) ??
    (typeof meta.stockLevel === "number" ? Number(meta.stockLevel) : null);
  if (typeof inventoryValue === "number" && Number.isFinite(inventoryValue)) {
    if (inventoryValue <= 0) {
      return { stockState: "out_of_stock", confidence: "high", reason: "Inventory is zero." };
    }
    if (inventoryValue <= 10) {
      return { stockState: "low_stock", confidence: "high", reason: "Inventory is running low." };
    }
    return { stockState: "in_stock", confidence: "high", reason: "Inventory is available." };
  }

  const availability = String(
    input.exactSource?.availability ?? meta.availability ?? meta.productAvailability ?? meta.offerAvailability ?? ""
  ).toLowerCase();
  if (availability.includes("out") || availability.includes("sold")) {
    return { stockState: "out_of_stock", confidence: "high", reason: "Availability marks the product unavailable." };
  }
  if (availability.includes("limited") || availability.includes("backorder") || availability.includes("preorder")) {
    return { stockState: "low_stock", confidence: "high", reason: "Availability suggests constrained stock." };
  }
  if (availability.includes("in_stock") || availability.includes("instock") || availability.includes("available")) {
    return { stockState: "in_stock", confidence: "high", reason: "Availability marks the product in stock." };
  }

  return { stockState: "unknown", confidence: null };
}

function inferProxyStock(row: ProductPerformanceRow): { stockState: GoogleStockState; confidence: GoogleCommerceConfidence | null; reason?: string } {
  const meta = productMeta(row);
  const feedIssue = [
    meta.availabilityIssue,
    meta.feedIssue,
    meta.disapprovalReason,
    meta.limitedVisibility,
    meta.servingIssue,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (feedIssue.includes("out of stock") || feedIssue.includes("disapproved") || feedIssue.includes("limited")) {
    return {
      stockState: "unknown",
      confidence: "low",
      reason: "Feed or serving issues suggest possible availability risk.",
    };
  }

  const recentRevenueDrop =
    Number(meta.last3Revenue ?? 0) === 0 &&
    Number(meta.last30Revenue ?? row.revenue ?? 0) > 0 &&
    Number(row.clicks ?? 0) >= 20;
  if (recentRevenueDrop) {
    return {
      stockState: "unknown",
      confidence: "low",
      reason: "Recent demand remains but product revenue disappeared, which can indicate stock risk.",
    };
  }

  return { stockState: "unknown", confidence: null };
}

function strongerConfidence(
  current: GoogleCommerceConfidence | null,
  next: GoogleCommerceConfidence | null
): GoogleCommerceConfidence | null {
  const weight = (value: GoogleCommerceConfidence | null) =>
    value === "high" ? 3 : value === "medium" ? 2 : value === "low" ? 1 : 0;
  return weight(next) > weight(current) ? next : current;
}

function aggregateMarginBand(values: GoogleMarginBand[]): GoogleMarginBand {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  if (values.includes("high")) return "high";
  return "unknown";
}

function aggregateStockState(values: GoogleStockState[]): GoogleStockState {
  if (values.includes("out_of_stock")) return "out_of_stock";
  if (values.includes("low_stock")) return "low_stock";
  if (values.includes("in_stock")) return "in_stock";
  return "unknown";
}

function aggregateDiscountState(values: GoogleDiscountState[]): GoogleDiscountState {
  if (values.includes("discounted")) return "discounted";
  if (values.includes("full_price")) return "full_price";
  return "unknown";
}

export function buildProductCommerceAssessments(input: {
  products: ProductPerformanceRow[];
  costModel?: BusinessCostModel | null;
  commerceSources?: CommerceSourceRecord[];
}) {
  const sourceByItemId = new Map(
    (input.commerceSources ?? [])
      .filter((source) => source.productItemId)
      .map((source) => [normalize(source.productItemId), source])
  );
  const sourceByTitle = new Map(
    (input.commerceSources ?? [])
      .filter((source) => source.productTitle)
      .map((source) => [normalize(source.productTitle), source])
  );

  return input.products.map<ProductCommerceAssessment>((row) => {
    const exactSource =
      (row.productItemId ? sourceByItemId.get(normalize(row.productItemId)) : undefined) ??
      sourceByTitle.get(normalize(row.productTitle));
    const reasons: string[] = [];
    let commerceConfidence: GoogleCommerceConfidence | null = null;

    const strictStock = inferHighConfidenceStock({ row, exactSource });
    const proxyStock = strictStock.confidence ? null : inferProxyStock(row);
    const stockAssessment = strictStock.confidence ? strictStock : proxyStock ?? strictStock;
    if (stockAssessment.reason) reasons.push(stockAssessment.reason);
    commerceConfidence = strongerConfidence(commerceConfidence, stockAssessment.confidence);

    const marginBand = inferMarginBand(row, input.costModel);
    if (marginBand !== "unknown" && input.costModel) {
      reasons.push("Margin band derived from contribution proxy or the business cost model.");
      commerceConfidence = strongerConfidence(commerceConfidence, "medium");
    }

    const discountState = inferDiscountState(row);
    const heroSku =
      Number(row.revenueShare ?? 0) >= 20 ||
      row.hiddenWinnerState === "hidden_winner" ||
      row.scaleState === "scale";

    return {
      productItemId: row.productItemId ?? null,
      productTitle: row.productTitle,
      signals: {
        marginBand,
        stockState: stockAssessment.stockState,
        discountState,
        heroSku,
      },
      commerceConfidence,
      reasons,
    };
  });
}

function recommendationProductNames(recommendation: GoogleRecommendation) {
  return Array.from(
    new Set(
      [
        ...(recommendation.startingSkuClusters ?? []),
        ...(recommendation.scaleSkuClusters ?? []),
        ...(recommendation.reduceSkuClusters ?? []),
        ...(recommendation.hiddenWinnerSkuClusters ?? []),
        ...(recommendation.heroSkuClusters ?? []),
      ].filter(Boolean)
    )
  );
}

export function applyCommerceSignalsToRecommendations(input: {
  recommendations: GoogleRecommendation[];
  assessments: ProductCommerceAssessment[];
}) {
  const byTitle = new Map(
    input.assessments.map((assessment) => [normalize(assessment.productTitle), assessment])
  );
  const byItemId = new Map(
    input.assessments
      .filter((assessment) => assessment.productItemId)
      .map((assessment) => [normalize(assessment.productItemId), assessment])
  );

  return input.recommendations.map((recommendation) => {
    const productNames = recommendationProductNames(recommendation);
    const linkedAssessments =
      productNames.length > 0
        ? productNames
            .map((name) => byTitle.get(normalize(name)) ?? byItemId.get(normalize(name)))
            .filter((value): value is ProductCommerceAssessment => Boolean(value))
        : recommendation.type === "pmax_scaling_fit" || recommendation.type === "shopping_launch_or_split"
          ? input.assessments.slice(0, 4)
          : [];

    if (linkedAssessments.length === 0) {
      return {
        ...recommendation,
        commerceSignals: null,
        commerceConfidence: null,
      };
    }

    const commerceSignals: GoogleRecommendationCommerceSignals = {
      marginBand: aggregateMarginBand(linkedAssessments.map((entry) => entry.signals.marginBand)),
      stockState: aggregateStockState(linkedAssessments.map((entry) => entry.signals.stockState)),
      discountState: aggregateDiscountState(linkedAssessments.map((entry) => entry.signals.discountState)),
      heroSku: linkedAssessments.some((entry) => entry.signals.heroSku) ? true : false,
    };
    const commerceConfidence = linkedAssessments.reduce<GoogleCommerceConfidence | null>(
      (best, entry) => strongerConfidence(best, entry.commerceConfidence),
      null
    );
    const commerceReasons = Array.from(new Set(linkedAssessments.flatMap((entry) => entry.reasons)));

    return {
      ...recommendation,
      commerceSignals,
      commerceConfidence,
      confidenceDegradationReasons:
        commerceSignals.stockState === "unknown" && commerceConfidence === "low"
          ? [...recommendation.confidenceDegradationReasons, "Product availability is inferred only from proxy signals."]
          : recommendation.confidenceDegradationReasons,
      evidence:
        linkedAssessments.length > 0
          ? [
              ...recommendation.evidence,
              {
                label: "Commerce signal",
                value: `${commerceSignals.marginBand.replace(/_/g, " ")} margin · ${commerceSignals.stockState.replace(/_/g, " ")}`,
              },
            ].slice(0, 4)
          : recommendation.evidence,
      blockers:
        commerceSignals.stockState === "out_of_stock" && commerceConfidence === "high"
          ? [...recommendation.blockers, "High-confidence commerce data shows affected products are out of stock."]
          : recommendation.blockers,
      reasonCodes: commerceReasons.length > 0
        ? [...recommendation.reasonCodes, "COMMERCE_SIGNAL_ACTIVE"].slice(0, 8)
        : recommendation.reasonCodes,
    };
  });
}
