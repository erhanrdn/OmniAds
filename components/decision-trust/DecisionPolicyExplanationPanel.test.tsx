import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionPolicyExplanationPanel } from "@/components/decision-trust/DecisionPolicyExplanationPanel";

describe("DecisionPolicyExplanationPanel", () => {
  it("renders compare, evidence, and ceiling details", () => {
    const html = renderToStaticMarkup(
      <DecisionPolicyExplanationPanel
        title="Policy Review"
        explanation={{
          summary: "Shared ladder kept the safer branch active.",
          evidenceHits: [
            {
              key: "objective_family",
              label: "Objective family",
              status: "met",
              current: "sales",
              required: "policy-compatible objective",
              reason: null,
            },
          ],
          missingEvidence: [
            {
              key: "deployment_compatibility",
              label: "Deployment compatibility",
              status: "watch",
              current: "limited",
              required: "compatible live lane",
              reason: "No compatible lane is ready yet.",
            },
          ],
          blockers: [],
          degradedReasons: ["target_pack"],
          actionCeiling: "Test-only until deployment alignment improves.",
          protectedWinnerHandling: null,
          fatigueOrComeback: null,
          supplyPlanning: "Expand the angle set before saturation.",
          compare: {
            compareMode: true,
            baselineAction: "promote_to_scaling",
            candidateAction: "keep_in_test",
            selectedAction: "keep_in_test",
            cutoverState: "candidate_active",
            reason: "Candidate branch stayed inside the safe cutover guard.",
          },
        }}
      />,
    );

    expect(html).toContain("Policy Review");
    expect(html).toContain("candidate active");
    expect(html).toContain("Objective family");
    expect(html).toContain("Deployment compatibility");
    expect(html).toContain("Degraded reasons");
    expect(html).toContain("Action ceiling");
    expect(html).toContain("Supply planning");
  });
});
