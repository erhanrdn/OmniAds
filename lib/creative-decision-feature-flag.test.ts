import { describe, expect, it } from "vitest";
import {
  assignStickyCreativeCanonicalResolverFlag,
  resolveCreativeCanonicalResolverFlag,
} from "@/lib/creative-decision-feature-flag";

describe("creative canonical resolver feature flag", () => {
  it("keeps kill switch and admin controls ahead of preview/cohort assignment", () => {
    expect(
      resolveCreativeCanonicalResolverFlag({
        businessId: "biz_1",
        searchParams: new URLSearchParams("canonicalResolver=v1"),
        killSwitch: true,
      }),
    ).toBe("legacy");
    expect(
      resolveCreativeCanonicalResolverFlag({
        businessId: "biz_1",
        adminBlocklist: ["biz_1"],
        searchParams: new URLSearchParams("canonicalResolver=v1"),
      }),
    ).toBe("legacy");
    expect(
      resolveCreativeCanonicalResolverFlag({
        businessId: "biz_1",
        adminAllowlist: ["biz_1"],
      }),
    ).toBe("v1");
  });

  it("preserves sticky business assignment once created", () => {
    const record = assignStickyCreativeCanonicalResolverFlag({
      businessId: "biz_sticky",
      rolloutPercent: 0,
      existingAssignment: "v1",
    });

    expect(record.assignment).toBe("v1");
    expect(record.businessId).toBe("biz_sticky");
  });
});
