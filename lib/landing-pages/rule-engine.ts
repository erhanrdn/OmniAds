import type {
  LandingPageArchetype,
  LandingPageCauseTag,
  LandingPageFunnelStepKey,
  LandingPagePerformanceRow,
  LandingPageRuleAction,
  LandingPageRuleReport,
  LandingPageRuleScoreBreakdown,
} from "@/src/types/landing-pages";

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function scoreFromBand(value: number, weak: number, strong: number): number {
  const normalized = safeDivide(value - weak, strong - weak);
  return clamp(normalized * 100);
}

function detectArchetype(path: string): LandingPageArchetype {
  const normalized = path.toLowerCase();
  if (normalized === "/") return "homepage";
  if (normalized.startsWith("/products/")) return "product";
  if (
    normalized.startsWith("/collections/") ||
    normalized.startsWith("/category/") ||
    normalized.startsWith("/categories/") ||
    normalized.startsWith("/search")
  ) {
    return "listing";
  }
  if (
    normalized.startsWith("/blogs/") ||
    normalized.startsWith("/blog/") ||
    normalized.startsWith("/articles/")
  ) {
    return "content";
  }
  if (
    normalized.startsWith("/pages/") ||
    normalized.includes("campaign") ||
    normalized.includes("landing") ||
    normalized.includes("offer")
  ) {
    return "campaign";
  }
  return "other";
}

function buildScoreBreakdown(row: LandingPagePerformanceRow, archetype: LandingPageArchetype): LandingPageRuleScoreBreakdown {
  const trafficQuality = clamp(
    scoreFromBand(row.engagementRate, 0.3, 0.75) * 0.7 +
      scoreFromBand(row.scrollRate, 0.1, 0.45) * 0.3
  );
  const discovery = clamp(scoreFromBand(row.sessionToViewItemRate, 0.08, 0.45));
  const intent = clamp(scoreFromBand(row.viewItemToCartRate, 0.04, 0.18));
  const checkout = clamp(
    scoreFromBand(row.cartToCheckoutRate, 0.12, 0.45) * 0.55 +
      scoreFromBand(row.checkoutToShippingRate, 0.2, 0.65) * 0.45
  );
  const revenueEfficiency = clamp(
    scoreFromBand(row.sessionToPurchaseRate, 0.002, 0.03) * 0.7 +
      scoreFromBand(row.averagePurchaseRevenue, 25, 180) * 0.3
  );

  if (archetype === "homepage") {
    return {
      trafficQuality,
      discovery,
      intent: clamp(intent * 0.85),
      checkout,
      revenueEfficiency,
    };
  }

  if (archetype === "product") {
    return {
      trafficQuality: clamp(trafficQuality * 0.9),
      discovery: clamp(discovery * 0.9),
      intent: clamp(intent * 1.08),
      checkout,
      revenueEfficiency,
    };
  }

  if (archetype === "listing") {
    return {
      trafficQuality,
      discovery: clamp(discovery * 1.08),
      intent,
      checkout: clamp(checkout * 0.92),
      revenueEfficiency,
    };
  }

  if (archetype === "content") {
    return {
      trafficQuality: clamp(trafficQuality * 1.06),
      discovery,
      intent: clamp(intent * 0.8),
      checkout: clamp(checkout * 0.85),
      revenueEfficiency: clamp(revenueEfficiency * 0.9),
    };
  }

  return { trafficQuality, discovery, intent, checkout, revenueEfficiency };
}

function overallScore(scores: LandingPageRuleScoreBreakdown, archetype: LandingPageArchetype): number {
  const weightsByArchetype: Record<LandingPageArchetype, LandingPageRuleScoreBreakdown> = {
    homepage: {
      trafficQuality: 28,
      discovery: 28,
      intent: 14,
      checkout: 12,
      revenueEfficiency: 18,
    },
    listing: {
      trafficQuality: 18,
      discovery: 32,
      intent: 20,
      checkout: 12,
      revenueEfficiency: 18,
    },
    product: {
      trafficQuality: 14,
      discovery: 16,
      intent: 30,
      checkout: 20,
      revenueEfficiency: 20,
    },
    campaign: {
      trafficQuality: 24,
      discovery: 24,
      intent: 18,
      checkout: 14,
      revenueEfficiency: 20,
    },
    content: {
      trafficQuality: 34,
      discovery: 24,
      intent: 12,
      checkout: 10,
      revenueEfficiency: 20,
    },
    other: {
      trafficQuality: 22,
      discovery: 24,
      intent: 18,
      checkout: 16,
      revenueEfficiency: 20,
    },
  };

  const weights = weightsByArchetype[archetype];
  return Math.round(
    safeDivide(
      scores.trafficQuality * weights.trafficQuality +
        scores.discovery * weights.discovery +
        scores.intent * weights.intent +
        scores.checkout * weights.checkout +
        scores.revenueEfficiency * weights.revenueEfficiency,
      100
    )
  );
}

function buildConfidence(row: LandingPagePerformanceRow): number {
  const sessionsConfidence = clampUnit(safeDivide(row.sessions, 2500));
  const purchasesConfidence = clampUnit(safeDivide(row.purchases, 35));
  const checkoutConfidence = clampUnit(safeDivide(row.checkouts, 60));
  const completenessPenalty = row.dataCompleteness === "partial" ? 0.12 : 0;
  return clampUnit(
    sessionsConfidence * 0.45 + purchasesConfidence * 0.35 + checkoutConfidence * 0.2 - completenessPenalty
  );
}

function isTopOfFunnelArchetype(archetype: LandingPageArchetype): boolean {
  return archetype === "homepage" || archetype === "listing" || archetype === "content" || archetype === "campaign";
}

function hasOnlyDownstreamLeak(
  archetype: LandingPageArchetype,
  causeTags: LandingPageCauseTag[],
): boolean {
  if (!isTopOfFunnelArchetype(archetype)) return false;
  const hasOnPageIssue =
    causeTags.includes("tracking_gap") ||
    causeTags.includes("weak_above_fold") ||
    causeTags.includes("poor_product_discovery");
  const hasDownstreamIssue =
    causeTags.includes("weak_product_story") ||
    causeTags.includes("low_checkout_intent") ||
    causeTags.includes("late_checkout_friction");
  return !hasOnPageIssue && hasDownstreamIssue;
}

function primaryLeakStep(
  row: LandingPagePerformanceRow,
  archetype: LandingPageArchetype,
  causeTags: LandingPageCauseTag[],
): LandingPageFunnelStepKey | null {
  if (hasOnlyDownstreamLeak(archetype, causeTags)) return null;
  if (isTopOfFunnelArchetype(archetype) && row.largestDropOffStep) {
    if (
      row.largestDropOffStep === "add_to_cart" ||
      row.largestDropOffStep === "begin_checkout" ||
      row.largestDropOffStep === "add_shipping_info"
    ) {
      return null;
    }
  }
  return row.largestDropOffStep;
}

function toCauseTags(row: LandingPagePerformanceRow, archetype: LandingPageArchetype): LandingPageCauseTag[] {
  const tags: LandingPageCauseTag[] = [];

  if (row.engagementRate < 0.35 || row.scrollRate < 0.12) tags.push("weak_above_fold");
  if (row.sessionToViewItemRate < 0.16) tags.push("poor_product_discovery");
  if (archetype === "product" || archetype === "other") {
    if (row.viewItem > 0 && row.viewItemToCartRate < 0.08) tags.push("weak_product_story");
    if (row.addToCarts > 0 && row.cartToCheckoutRate < 0.2) tags.push("low_checkout_intent");
    if (row.checkouts > 0 && row.checkoutToShippingRate < 0.45) {
      tags.push("late_checkout_friction");
    }
  } else if (row.viewItem > 0 && row.viewItemToCartRate < 0.08) {
    tags.push("weak_product_story");
  }
  if (row.totalRevenue > 0 && row.purchases === 0) tags.push("tracking_gap");
  if (row.engagementRate >= 0.6) tags.push("healthy_engagement");
  if (row.viewItem > 0 && row.viewItemToCartRate >= 0.14) tags.push("healthy_purchase_intent");
  if (row.checkouts > 0 && row.checkoutToShippingRate >= 0.7) tags.push("strong_late_checkout");

  if (archetype === "content" && !tags.includes("poor_product_discovery") && row.sessionToViewItemRate < 0.22) {
    tags.push("poor_product_discovery");
  }

  return tags.slice(0, 4);
}

function toAction(
  row: LandingPagePerformanceRow,
  score: number,
  archetype: LandingPageArchetype,
  causeTags: LandingPageCauseTag[],
): LandingPageRuleAction {
  if (causeTags.includes("tracking_gap")) return "tracking_audit";
  if (score >= 78 && row.purchases >= 8 && row.sessionToPurchaseRate >= 0.01) return "scale";
  if (hasOnlyDownstreamLeak(archetype, causeTags)) return "watch";
  if (causeTags.includes("weak_above_fold") || causeTags.includes("poor_product_discovery")) {
    return row.sessionToViewItemRate < 0.16 ? "fix_product_discovery" : "fix_above_fold";
  }
  if ((archetype === "product" || archetype === "other") && causeTags.includes("weak_product_story")) {
    return "fix_product_story";
  }
  if ((archetype === "product" || archetype === "other") && causeTags.includes("low_checkout_intent")) {
    return "fix_checkout_intent";
  }
  if ((archetype === "product" || archetype === "other") && causeTags.includes("late_checkout_friction")) {
    return "fix_late_checkout";
  }
  return "watch";
}

function actionLabel(action: LandingPageRuleAction): string {
  const labels: Record<LandingPageRuleAction, string> = {
    scale: "Scale",
    watch: "Watch",
    fix_above_fold: "Fix Above Fold",
    fix_product_discovery: "Fix Product Discovery",
    fix_product_story: "Fix Product Story",
    fix_checkout_intent: "Fix Checkout Intent",
    fix_late_checkout: "Fix Late Checkout",
    tracking_audit: "Audit Tracking",
  };
  return labels[action];
}

function archetypeLabel(archetype: LandingPageArchetype): string {
  const labels: Record<LandingPageArchetype, string> = {
    homepage: "Homepage",
    listing: "Listing",
    product: "Product",
    campaign: "Campaign",
    content: "Content",
    other: "Other",
  };
  return labels[archetype];
}

function primaryLeakLabel(step: LandingPageFunnelStepKey | null): string {
  if (!step) return "funnel";
  if (step === "sessions") return "sessions -> view item";
  if (step === "view_item") return "view item -> add to cart";
  if (step === "add_to_cart") return "add to cart -> begin checkout";
  if (step === "begin_checkout") return "begin checkout -> add shipping info";
  if (step === "add_shipping_info") return "add shipping info -> purchase";
  if (step === "add_payment_info") return "add payment info -> purchase";
  return step.replaceAll("_", " ");
}

function issueList(row: LandingPagePerformanceRow, archetype: LandingPageArchetype, causeTags: LandingPageCauseTag[]): string[] {
  const issues: string[] = [];
  if (causeTags.includes("tracking_gap")) {
    issues.push("Revenue and purchase signals look misaligned, so this page needs an analytics audit before deeper CRO decisions.");
  }
  if (causeTags.includes("weak_above_fold")) {
    issues.push("Users are landing, but early engagement is weak, which suggests the hero, first CTA, or message match needs work.");
  }
  if (causeTags.includes("poor_product_discovery")) {
    issues.push(
      archetype === "content"
        ? "Visitors are consuming content but not bridging into product exploration fast enough."
        : "Too few sessions progress from landing to product exploration."
    );
  }
  if (causeTags.includes("weak_product_story")) {
    issues.push(
      isTopOfFunnelArchetype(archetype)
        ? "Visitors are reaching product detail pages, but the main slowdown appears after this page hands traffic off downstream."
        : "Product interest is present, but the page is not converting that attention into add-to-cart intent."
    );
  }
  if (causeTags.includes("low_checkout_intent")) {
    issues.push(
      isTopOfFunnelArchetype(archetype)
        ? "Downstream cart and checkout momentum looks weaker after users leave this page, so the main issue may live in PDP or cart UX."
        : "Cart creation is happening, but momentum drops sharply before users commit to checkout."
    );
  }
  if (causeTags.includes("late_checkout_friction")) {
    issues.push(
      isTopOfFunnelArchetype(archetype)
        ? "Late-funnel friction appears after this page's handoff, which points more to checkout execution than this landing page itself."
        : "Late-funnel friction is suppressing conversions after users have already shown buying intent."
    );
  }
  return issues.slice(0, 3);
}

function strengthList(row: LandingPagePerformanceRow, causeTags: LandingPageCauseTag[]): string[] {
  const strengths: string[] = [];
  if (causeTags.includes("healthy_engagement")) {
    strengths.push("Engagement is strong enough that traffic quality or message match is not the main bottleneck.");
  }
  if (causeTags.includes("healthy_purchase_intent")) {
    strengths.push("Once visitors reach a product, add-to-cart intent is healthy.");
  }
  if (causeTags.includes("strong_late_checkout")) {
    strengths.push("Checkout progression stays healthy once shoppers begin the structured checkout steps.");
  }
  if (row.sessionToPurchaseRate >= 0.015) {
    strengths.push("Session-to-purchase efficiency is strong enough to justify protecting current winners.");
  }
  return strengths.slice(0, 3);
}

function recommendationList(action: LandingPageRuleAction, archetype: LandingPageArchetype): string[] {
  const recommendations: Record<LandingPageRuleAction, string[]> = {
    scale: [
      "Protect the current winning structure and scale traffic gradually instead of redesigning aggressively.",
      "Test incremental headline, merchandising, or offer changes around the existing control.",
      "Use this page as a benchmark for other pages in the same archetype.",
    ],
    watch: [
      isTopOfFunnelArchetype(archetype)
        ? "Treat this page primarily as an entry and discovery surface before blaming downstream checkout behavior on it."
        : "Monitor this page before making broader layout changes.",
      isTopOfFunnelArchetype(archetype)
        ? "Inspect the destination product pages and cart flow that this page hands traffic into."
        : "Prioritize lightweight tests that improve clarity without disrupting the current flow.",
      "Compare this page only against others in the same archetype.",
    ],
    fix_above_fold: [
      "Rewrite the hero to make the offer, category, or next step immediately obvious.",
      "Tighten the first CTA and reduce distractions above the fold.",
      "Audit message match between ads, search intent, and the opening section.",
    ],
    fix_product_discovery: [
      archetype === "content"
        ? "Introduce stronger product bridges, inline CTAs, and visible product modules earlier in the page."
        : "Improve navigation, product modules, and first-click paths so visitors reach products faster.",
      "Reduce dead-end content blocks ahead of discovery CTAs.",
      "Make the first commerce step more obvious on mobile and near the top of the page.",
    ],
    fix_product_story: [
      "Strengthen pricing, offer framing, trust cues, and product benefits near the primary CTA.",
      "Reduce variant friction and make the add-to-cart path more direct.",
      "Test more persuasive product storytelling before sending more traffic.",
    ],
    fix_checkout_intent: [
      "Audit the cart experience for shipping surprises, trust gaps, and distracting cross-sells.",
      "Make checkout CTAs more prominent and reduce hesitation in the cart.",
      "Check whether promotions, shipping, or taxes are creating sticker shock.",
    ],
    fix_late_checkout: [
      "Review checkout UX around shipping, validation errors, and trust messaging.",
      "Simplify the final steps and remove late-stage friction that interrupts high-intent shoppers.",
      "Verify that checkout and shipping step tracking is complete before judging experiments.",
    ],
    tracking_audit: [
      "Validate purchase and revenue instrumentation before acting on this page’s funnel data.",
      "Check whether checkout, shipping, and purchase events are firing consistently.",
      "Hold off on major CRO changes until analytics coverage is trustworthy.",
    ],
  };
  return recommendations[action];
}

function riskList(
  row: LandingPagePerformanceRow,
  archetype: LandingPageArchetype,
  confidence: number,
  causeTags: LandingPageCauseTag[],
): string[] {
  const risks: string[] = [];
  if (confidence < 0.45) risks.push("This page has limited volume, so verdict confidence is still moderate to low.");
  if (causeTags.includes("tracking_gap")) risks.push("Tracking inconsistencies may be masking the real funnel leak.");
  if (row.largestDropOffStep === "sessions") risks.push("Scaling more traffic now may amplify wasted sessions before discovery improves.");
  if (row.largestDropOffStep === "view_item") risks.push("Sending more product traffic without fixing product story will likely dilute return.");
  if (row.largestDropOffStep === "add_to_cart") {
    risks.push(
      isTopOfFunnelArchetype(archetype)
        ? "If downstream product pages or cart flows are weak, this page can look worse than it really is."
        : "Cart friction can suppress revenue even when top-of-funnel traffic looks healthy."
    );
  }
  return risks.slice(0, 3);
}

function summaryFor(report: {
  title: string;
  action: LandingPageRuleAction;
  archetype: LandingPageArchetype;
  primaryLeak: LandingPageFunnelStepKey | null;
  causeTags: LandingPageCauseTag[];
}): string {
  if (hasOnlyDownstreamLeak(report.archetype, report.causeTags)) {
    return `${report.title} is doing its main ${archetypeLabel(report.archetype).toLowerCase()} job of moving visitors forward, but the weaker conversion signal appears after users leave this page for product or cart flows.`;
  }
  const archetypeText = archetypeLabel(report.archetype).toLowerCase();
  const leakText = primaryLeakLabel(report.primaryLeak);
  return `${report.title} is behaving like a ${archetypeText} page that currently needs "${actionLabel(report.action)}" attention, with the main leak centered around ${leakText}.`;
}

export function buildLandingPageRuleReport(row: LandingPagePerformanceRow): LandingPageRuleReport {
  const archetype = detectArchetype(row.path);
  const scoreBreakdown = buildScoreBreakdown(row, archetype);
  const score = overallScore(scoreBreakdown, archetype);
  const confidence = buildConfidence(row);
  const causeTags = toCauseTags(row, archetype);
  const primaryLeak = primaryLeakStep(row, archetype, causeTags);
  const action = toAction(row, score, archetype, causeTags);
  const strengths = strengthList(row, causeTags);
  const issues = issueList(row, archetype, causeTags);
  const actions = recommendationList(action, archetype);
  const risks = riskList(row, archetype, confidence, causeTags);

  return {
    path: row.path,
    title: row.title,
    archetype,
    action,
    score,
    confidence,
    primaryLeak,
    causeTags,
    strengths,
    issues,
    actions,
    risks,
    summary: summaryFor({ title: row.title, action, archetype, primaryLeak, causeTags }),
    scoreBreakdown,
  };
}

export function formatLandingPageActionLabel(action: LandingPageRuleAction): string {
  return actionLabel(action);
}

export function formatLandingPageArchetypeLabel(archetype: LandingPageArchetype): string {
  return archetypeLabel(archetype);
}
