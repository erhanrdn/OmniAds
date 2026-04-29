import { describe, expect, it } from "vitest";
import {
  assignStickyCreativeCanonicalResolverFlag,
  resolveCanonicalCohortAssignment,
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

  it("routes next cohort assignment to legacy immediately when kill switch flips", () => {
    const sticky = resolveCanonicalCohortAssignment({
      businessId: "biz_sticky",
      existingAssignment: "canonical-v1",
      existingAssignedAt: "2026-04-29T00:00:00.000Z",
      rolloutPercent: 100,
    });
    expect(sticky.cohort).toBe("canonical-v1");
    expect(sticky.source).toBe("sticky_assigned");

    const killed = resolveCanonicalCohortAssignment({
      businessId: "biz_sticky",
      existingAssignment: "canonical-v1",
      existingAssignedAt: "2026-04-29T00:00:00.000Z",
      killSwitch: true,
    });
    expect(killed.cohort).toBe("legacy");
    expect(killed.source).toBe("kill_switch");
  });

  it("honors env kill switch ahead of allowlist and rollout", () => {
    const assignment = resolveCanonicalCohortAssignment({
      businessId: "biz_allowlisted",
      adminAllowlist: ["biz_allowlisted"],
      rolloutPercent: 100,
      env: { CANONICAL_RESOLVER_KILL_SWITCH: "true" } as unknown as NodeJS.ProcessEnv,
    });

    expect(assignment.cohort).toBe("legacy");
    expect(assignment.source).toBe("kill_switch");
  });
});
