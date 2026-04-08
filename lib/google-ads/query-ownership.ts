import type {
  CampaignPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import type {
  GoogleNegativeKeywordMatchType,
  GoogleNegativeKeywordSuppressionReason,
  GoogleQueryIntentClass,
  GoogleQueryOwnershipClass,
} from "@/lib/google-ads/growth-advisor-types";

interface QueryOwnershipContext {
  brandTerms: string[];
  competitorTerms: string[];
  productTerms: string[];
}

interface QueryOwnershipResult {
  ownershipClass: GoogleQueryOwnershipClass;
  ownershipConfidence: "high" | "medium" | "low";
  ownershipReason: string;
  ownershipNeedsReview: boolean;
  intentClass: GoogleQueryIntentClass;
  intentConfidence: "high" | "medium" | "low";
  intentReason: string;
  intentNeedsReview: boolean;
}

export interface GoogleNegativeKeywordAssessmentInput {
  searchTerm: string;
  ownershipClass: GoogleQueryOwnershipClass;
  ownershipConfidence: "high" | "medium" | "low";
  ownershipNeedsReview: boolean;
  intentClass: GoogleQueryIntentClass;
  intentConfidence: "high" | "medium" | "low";
  intentNeedsReview: boolean;
  clicks: number;
  spend: number;
  isWasteLike: boolean;
  requiredMatchType: GoogleNegativeKeywordMatchType;
}

export interface GoogleNegativeKeywordAssessment {
  eligible: boolean;
  requiredMatchType: GoogleNegativeKeywordMatchType;
  reversibleImpact: boolean;
  evidenceDepthSufficient: boolean;
  suppressionReasons: GoogleNegativeKeywordSuppressionReason[];
}

const WEAK_COMMERCIAL_PATTERNS = [
  /\bfree\b/i,
  /\bpdf\b/i,
  /\bpattern(s)?\b/i,
  /\btemplate(s)?\b/i,
  /\breturn(s| policy)?\b/i,
  /\brefund(s)?\b/i,
  /\blogin\b/i,
  /\btracking\b/i,
  /\bshipping status\b/i,
  /\bcustomer service\b/i,
  /\bsupport\b/i,
  /\bhow to\b/i,
  /\bwhat is\b/i,
  /\bfaq\b/i,
  /\bmanual\b/i,
  /\brepair\b/i,
];

const COMPETITOR_PATTERNS = [/\bvs\b/i, /\bversus\b/i, /\balternative(s)?\b/i, /\bcompetitor(s)?\b/i];
const SKU_PATTERNS = [/\b[a-z]{2,}\d{2,}\b/i, /\b\d{3,}\b/i, /\b[a-z0-9]+-[a-z0-9-]+\b/i];
const PRICE_SENSITIVE_PATTERNS = [
  /\bcheap\b/i,
  /\baffordable\b/i,
  /\bbudget\b/i,
  /\bdiscount\b/i,
  /\bsale\b/i,
  /\bdeal(s)?\b/i,
  /\bpromo(code)?\b/i,
  /\bcoupon\b/i,
  /\bprice\b/i,
];
const RESEARCH_PATTERNS = [
  /\bbest\b/i,
  /\breview(s)?\b/i,
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\btop\b/i,
  /\bideas\b/i,
  /\binspiration\b/i,
];
const HIGH_INTENT_PATTERNS = [
  /\bbuy\b/i,
  /\bshop\b/i,
  /\border\b/i,
  /\bfor sale\b/i,
  /\bnear me\b/i,
];

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ");
}

function uniqueTerms(values: string[]) {
  return Array.from(
    new Set(
      values
        .map(normalizeToken)
        .filter((value) => value.length >= 3)
    )
  );
}

function termsFromCampaigns(campaigns: CampaignPerformanceRow[]) {
  return campaigns
    .filter((campaign) => String(campaign.campaignName ?? "").toLowerCase().includes("brand"))
    .flatMap((campaign) =>
      normalizeToken(campaign.campaignName ?? "")
        .split(" ")
        .filter((token) => token.length >= 4 && token !== "brand" && token !== "search")
    );
}

function termsFromProducts(products: ProductPerformanceRow[]) {
  return products.flatMap((product) => {
    const title = normalizeToken(product.productTitle ?? "");
    const itemId = normalizeToken(product.productItemId ?? "");
    return [itemId, title]
      .flatMap((value) => value.split(" "))
      .filter((token) => token.length >= 4);
  });
}

function maybeCompetitorTerms(rows: SearchTermPerformanceRow[], brandTerms: string[]) {
  return rows
    .filter((row) => COMPETITOR_PATTERNS.some((pattern) => pattern.test(row.searchTerm)))
    .flatMap((row) =>
      normalizeToken(row.searchTerm)
        .split(" ")
        .filter(
          (token) =>
            token.length >= 4 &&
            !brandTerms.includes(token) &&
            !["versus", "vs", "alternative", "alternatives", "competitor", "competitors"].includes(token)
        )
    );
}

export function buildQueryOwnershipContext(input: {
  campaigns: CampaignPerformanceRow[];
  searchTerms: SearchTermPerformanceRow[];
  products: ProductPerformanceRow[];
}): QueryOwnershipContext {
  const brandTerms = uniqueTerms(termsFromCampaigns(input.campaigns));
  const productTerms = uniqueTerms(termsFromProducts(input.products));
  const competitorTerms = uniqueTerms(maybeCompetitorTerms(input.searchTerms, brandTerms));
  return { brandTerms, competitorTerms, productTerms };
}

export function classifyQueryOwnership(
  query: string,
  context: QueryOwnershipContext
): QueryOwnershipResult {
  const normalized = normalizeToken(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const hasBrand = context.brandTerms.some((term) => normalized.includes(term));
  if (hasBrand) {
    const nonBrandTokens = tokens.filter((token) => !context.brandTerms.includes(token));
    const productOverlap = nonBrandTokens.some((token) => context.productTerms.includes(token));
    return {
      ownershipClass: "brand",
      ownershipConfidence: "high",
      ownershipReason: "Query matches known brand terms from the account.",
      ownershipNeedsReview: false,
      intentClass: productOverlap ? "brand_mixed" : "brand_core",
      intentConfidence: productOverlap ? "medium" : "high",
      intentReason: productOverlap
        ? "Query contains both brand language and product/category language."
        : "Query is concentrated on core branded demand.",
      intentNeedsReview: productOverlap,
    };
  }

  const hasCompetitorPattern = COMPETITOR_PATTERNS.some((pattern) => pattern.test(query));
  const hasCompetitor = context.competitorTerms.some((term) => normalized.includes(term));
  if (hasCompetitorPattern || hasCompetitor) {
    return {
      ownershipClass: "competitor",
      ownershipConfidence: hasCompetitor ? "high" : "medium",
      ownershipReason: hasCompetitor
        ? "Query matches a competitor term seen in comparison-style searches."
        : "Query uses a comparison or alternative pattern.",
      ownershipNeedsReview: !hasCompetitor,
      intentClass: "category_mid_intent",
      intentConfidence: hasCompetitor ? "medium" : "low",
      intentReason: "Competitor comparison traffic is usually evaluative rather than ready for direct cleanup or scale.",
      intentNeedsReview: true,
    };
  }

  const hasSkuPattern = SKU_PATTERNS.some((pattern) => pattern.test(query));
  const hasProductTerm = context.productTerms.some((term) => normalized.includes(term));
  if (hasSkuPattern || hasProductTerm) {
    return {
      ownershipClass: "sku_specific",
      ownershipConfidence: hasSkuPattern || hasProductTerm ? "high" : "medium",
      ownershipReason: hasProductTerm
        ? "Query matches SKU or product-specific language already present in the catalog."
        : "Query matches a SKU or model-style pattern.",
      ownershipNeedsReview: false,
      intentClass: "product_specific",
      intentConfidence: "high",
      intentReason: "Query is concentrated on a specific product or SKU.",
      intentNeedsReview: false,
    };
  }

  if (WEAK_COMMERCIAL_PATTERNS.some((pattern) => pattern.test(query))) {
    return {
      ownershipClass: "weak_commercial",
      ownershipConfidence: "high",
      ownershipReason: "Query looks like support, informational, or low-commercial traffic.",
      ownershipNeedsReview: false,
      intentClass: "support_or_post_purchase",
      intentConfidence: "high",
      intentReason: "Query looks like support, service, or post-purchase traffic.",
      intentNeedsReview: false,
    };
  }

  if (PRICE_SENSITIVE_PATTERNS.some((pattern) => pattern.test(query))) {
    return {
      ownershipClass: "non_brand",
      ownershipConfidence: tokens.length <= 1 ? "medium" : "high",
      ownershipReason: "Query does not match brand, competitor, SKU, or weak-commercial ownership rules.",
      ownershipNeedsReview: tokens.length <= 1,
      intentClass: "price_sensitive",
      intentConfidence: "high",
      intentReason: "Query is price-led or discount-seeking rather than a clean product winner.",
      intentNeedsReview: false,
    };
  }

  if (RESEARCH_PATTERNS.some((pattern) => pattern.test(query))) {
    return {
      ownershipClass: "non_brand",
      ownershipConfidence: tokens.length <= 1 ? "medium" : "high",
      ownershipReason: "Query does not match brand, competitor, SKU, or weak-commercial ownership rules.",
      ownershipNeedsReview: tokens.length <= 1,
      intentClass: "research_low_intent",
      intentConfidence: "medium",
      intentReason: "Query looks like exploratory or evaluative research traffic.",
      intentNeedsReview: false,
    };
  }

  if (HIGH_INTENT_PATTERNS.some((pattern) => pattern.test(query))) {
    return {
      ownershipClass: "non_brand",
      ownershipConfidence: tokens.length <= 1 ? "medium" : "high",
      ownershipReason: "Query does not match brand, competitor, SKU, or weak-commercial ownership rules.",
      ownershipNeedsReview: tokens.length <= 1,
      intentClass: "category_high_intent",
      intentConfidence: "high",
      intentReason: "Query uses commercial action language that suggests category-level buying intent.",
      intentNeedsReview: false,
    };
  }

  return {
    ownershipClass: "non_brand",
    ownershipConfidence: tokens.length <= 1 ? "medium" : "high",
    ownershipReason: "Query does not match brand, competitor, SKU, or weak-commercial ownership rules.",
    ownershipNeedsReview: tokens.length <= 1,
    intentClass: tokens.length >= 3 ? "category_high_intent" : "category_mid_intent",
    intentConfidence: tokens.length >= 3 ? "medium" : "low",
    intentReason:
      tokens.length >= 3
        ? "Query looks commercially relevant but remains category-level rather than product-specific."
        : "Query is broad enough that category intent is present but still mid-confidence.",
    intentNeedsReview: tokens.length <= 1,
  };
}

export function applyQueryOwnership(
  rows: SearchTermPerformanceRow[],
  context: QueryOwnershipContext
): SearchTermPerformanceRow[] {
  return rows.map((row) => ({
    ...row,
    ...classifyQueryOwnership(row.searchTerm, context),
  }));
}

export function evaluateNegativeKeywordAssessment(
  input: GoogleNegativeKeywordAssessmentInput
): GoogleNegativeKeywordAssessment {
  const suppressionReasons = new Set<GoogleNegativeKeywordSuppressionReason>();
  const evidenceDepthSufficient = input.clicks >= 20 && input.spend >= 20 && input.isWasteLike;

  if (input.requiredMatchType !== "exact") {
    suppressionReasons.add("non_exact_negative_required");
  }
  if (input.ownershipClass === "brand") {
    suppressionReasons.add("branded_query");
  }
  if (input.ownershipClass === "sku_specific") {
    suppressionReasons.add("sku_specific_query");
  }
  if (input.intentClass === "product_specific") {
    suppressionReasons.add("product_specific_query");
  }
  if (input.ownershipConfidence !== "high" || input.intentConfidence !== "high") {
    suppressionReasons.add("low_confidence");
  }

  const ambiguousIntent =
    input.ownershipNeedsReview ||
    input.intentNeedsReview ||
    input.ownershipClass === "competitor" ||
    input.intentClass === "brand_mixed" ||
    input.intentClass === "category_high_intent" ||
    input.intentClass === "category_mid_intent" ||
    input.intentClass === "price_sensitive" ||
    input.intentClass === "research_low_intent";
  if (ambiguousIntent) {
    suppressionReasons.add("ambiguous_intent");
  }
  if (!evidenceDepthSufficient) {
    suppressionReasons.add("insufficient_evidence_depth");
  }

  return {
    eligible: suppressionReasons.size === 0,
    requiredMatchType: input.requiredMatchType,
    reversibleImpact: input.requiredMatchType === "exact",
    evidenceDepthSufficient,
    suppressionReasons: Array.from(suppressionReasons),
  };
}
