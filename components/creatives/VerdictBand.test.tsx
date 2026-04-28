import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VerdictBand,
  VerdictWhy,
  getVerdictActionButtonLabel,
} from "@/components/creatives/VerdictBand";
import type {
  CreativeAction,
  CreativeActionReadiness,
  CreativeVerdict,
} from "@/lib/creative-verdict";

const ACTION_EXPECTATIONS: Array<{
  action: CreativeAction;
  label: string;
  shortLabel: string;
}> = [
  { action: "scale", label: "Promote to Scale", shortLabel: "Ready to Scale" },
  { action: "cut", label: "Cut Now", shortLabel: "Cut Now" },
  { action: "refresh", label: "Refresh Creative", shortLabel: "Refresh Required" },
  { action: "protect", label: "Keep Active", shortLabel: "Keep Active" },
  { action: "keep_testing", label: "Continue Testing", shortLabel: "Continue Testing" },
  { action: "diagnose", label: "Investigate", shortLabel: "Investigate" },
];

function verdict(
  overrides: Partial<CreativeVerdict> & { action?: CreativeAction } = {},
): CreativeVerdict {
  return {
    contractVersion: "creative-verdict.v1",
    phase: "test",
    phaseSource: "default_test",
    headline: "Test Winner",
    action: overrides.action ?? "scale",
    actionReadiness: "ready",
    confidence: 0.92,
    evidence: [
      { tag: "above_break_even", weight: "primary" },
      { tag: "scale_maturity", weight: "supporting" },
      { tag: "target_pack_configured", weight: "supporting" },
    ],
    blockers: [],
    derivedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("VerdictBand", () => {
  for (const expectation of ACTION_EXPECTATIONS) {
    it(`renders ${expectation.action} with the correct full-size action label`, () => {
      const html = renderToStaticMarkup(
        <VerdictBand verdict={verdict({ action: expectation.action })} />,
      );

      expect(html).toContain(expectation.label);
      expect(html).toContain(expectation.shortLabel);
      expect(html).toContain("Confidence 0.92");
    });
  }

  for (const readiness of ["ready", "needs_review", "blocked"] as CreativeActionReadiness[]) {
    it(`renders ${readiness} readiness state`, () => {
      const html = renderToStaticMarkup(
        <VerdictBand
          verdict={verdict({
            actionReadiness: readiness,
            blockers: readiness === "blocked" ? ["hard_truth_blocker"] : [],
          })}
        />,
      );

      if (readiness === "ready") {
        expect(html).toContain("Promote to Scale");
        expect(html).not.toContain("disabled");
      } else if (readiness === "needs_review") {
        expect(html).toContain("Promote to Scale (review)");
      } else {
        expect(html).toContain("disabled");
        expect(html).toContain("Hard Truth Blocker");
      }
    });
  }

  it("renders compact mode with phase, headline, and no full action button label", () => {
    const html = renderToStaticMarkup(
      <VerdictBand verdict={verdict({ headline: "Scale Performer", phase: "scale" })} size="compact" />,
    );

    expect(html).toContain("SCALE");
    expect(html).toContain("Scale Performer");
    expect(html).not.toContain("Promote to Scale</button>");
  });

  it("renders legacy null-phase snapshots as needs analysis", () => {
    const html = renderToStaticMarkup(
      <VerdictBand verdict={verdict({ phase: null, headline: "Needs Diagnosis" })} />,
    );

    expect(html).toContain("NEEDS ANALYSIS");
    expect(html).toContain("Needs Diagnosis");
  });

  it("keeps action label helper stable for buyer comprehension scoring", () => {
    expect(getVerdictActionButtonLabel(verdict({ action: "refresh" }))).toBe("Refresh Creative");
    expect(
      getVerdictActionButtonLabel(
        verdict({ action: "cut", actionReadiness: "needs_review" }),
      ),
    ).toBe("Cut Now (review)");
  });
});

describe("VerdictWhy", () => {
  it("caps visible evidence at three and blockers at two", () => {
    const html = renderToStaticMarkup(
      <VerdictWhy
        verdict={verdict({
          evidence: [
            { tag: "above_break_even", weight: "primary" },
            { tag: "scale_maturity", weight: "primary" },
            { tag: "target_pack_configured", weight: "supporting" },
            { tag: "baseline_strong", weight: "supporting" },
          ],
          blockers: [
            "trust_degraded_missing_truth",
            "business_validation_missing",
            "deployment_lane_limited",
          ],
        })}
      />,
    );

    expect(html).toContain("Above break-even");
    expect(html).toContain("Mature evidence");
    expect(html).toContain("Target pack configured");
    expect(html).not.toContain("Baseline Strong");
    expect(html).toContain("Trust degraded");
    expect(html).toContain("Business validation missing");
    expect(html).not.toContain("Deployment limited");
    expect(html).toContain("Show all evidence (2 more)");
  });

  it("keeps the break-even median proxy evidence link visible", () => {
    const html = renderToStaticMarkup(
      <VerdictWhy
        verdict={verdict({
          evidence: [{ tag: "break_even_proxy_used", weight: "primary" }],
        })}
      />,
    );

    expect(html).toContain("Break-even: median proxy");
    expect(html).toContain("/commercial-truth");
  });
});
