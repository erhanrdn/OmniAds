import { describe, expect, it } from "vitest";
import {
  assignStableCompanyAliases,
  buildDeterministicHoldoutSplit,
} from "./creative-segmentation-holdout-validation";

function companies(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    companyAlias: `company-${String(index + 1).padStart(2, "0")}`,
    businessId: `business-${index + 1}`,
  }));
}

describe("creative segmentation holdout validation", () => {
  it("builds a stable deterministic business-level split", () => {
    const input = companies(7);
    const first = buildDeterministicHoldoutSplit(input);
    const second = buildDeterministicHoldoutSplit(input);

    expect(first).toEqual(second);
    expect(first.enabled).toBe(true);
    expect(first.logicVersion).toBe("creative-holdout-v1");
    expect(first.holdoutAliases).toHaveLength(2);
    expect(first.calibrationAliases).toHaveLength(5);
    expect(new Set(first.holdoutAliases).size).toBe(first.holdoutAliases.length);
    expect(
      first.calibrationAliases.every((alias) => !first.holdoutAliases.includes(alias)),
    ).toBe(true);
  });

  it("falls back to calibration-only when the live cohort is too small", () => {
    const split = buildDeterministicHoldoutSplit(companies(4));

    expect(split.enabled).toBe(false);
    expect(split.disabledReason).toBe("cohort_too_small");
    expect(split.holdoutAliases).toEqual([]);
    expect(split.calibrationAliases).toEqual([
      "company-01",
      "company-02",
      "company-03",
      "company-04",
    ]);
  });

  it("assigns stable company aliases independent of input order", () => {
    const input = companies(4);
    const forward = assignStableCompanyAliases(input);
    const reverse = assignStableCompanyAliases([...input].reverse());

    expect(
      forward.map((company) => ({
        businessId: company.businessId,
        companyAlias: company.companyAlias,
      })),
    ).toEqual(
      reverse.map((company) => ({
        businessId: company.businessId,
        companyAlias: company.companyAlias,
      })),
    );
  });
});
