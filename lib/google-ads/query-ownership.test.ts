import { describe, expect, it } from "vitest";
import { evaluateNegativeKeywordAssessment } from "@/lib/google-ads/query-ownership";

describe("evaluateNegativeKeywordAssessment", () => {
  it("allows only exact, high-confidence, support-like waste queries", () => {
    const assessment = evaluateNegativeKeywordAssessment({
      searchTerm: "refund policy",
      ownershipClass: "weak_commercial",
      ownershipConfidence: "high",
      ownershipNeedsReview: false,
      intentClass: "support_or_post_purchase",
      intentConfidence: "high",
      intentNeedsReview: false,
      clicks: 24,
      spend: 60,
      isWasteLike: true,
      requiredMatchType: "exact",
    });

    expect(assessment.eligible).toBe(true);
    expect(assessment.suppressionReasons).toEqual([]);
  });

  it("suppresses non-exact negatives in V1", () => {
    const assessment = evaluateNegativeKeywordAssessment({
      searchTerm: "refund policy",
      ownershipClass: "weak_commercial",
      ownershipConfidence: "high",
      ownershipNeedsReview: false,
      intentClass: "support_or_post_purchase",
      intentConfidence: "high",
      intentNeedsReview: false,
      clicks: 24,
      spend: 60,
      isWasteLike: true,
      requiredMatchType: "phrase",
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.suppressionReasons).toContain("non_exact_negative_required");
  });

  it("suppresses low-confidence or ambiguous intent", () => {
    const assessment = evaluateNegativeKeywordAssessment({
      searchTerm: "cheap camping backpack",
      ownershipClass: "non_brand",
      ownershipConfidence: "medium",
      ownershipNeedsReview: false,
      intentClass: "price_sensitive",
      intentConfidence: "high",
      intentNeedsReview: false,
      clicks: 24,
      spend: 60,
      isWasteLike: true,
      requiredMatchType: "exact",
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.suppressionReasons).toContain("low_confidence");
    expect(assessment.suppressionReasons).toContain("ambiguous_intent");
  });
});
