import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/hooks/use-currency", () => ({
  useCurrencySymbol: () => "$",
}));

const { MetaCampaignList } = await import("@/components/meta/meta-campaign-list");

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmp_1",
    name: "Campaign One",
    status: "ACTIVE",
    objective: "Sales",
    roas: 3.2,
    spend: 1200,
    laneLabel: "Scaling",
    ...overrides,
  };
}

describe("MetaCampaignList render contract", () => {
  it("renders the account overview row and visible campaign subset", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignOperatorSummaries={
          new Map([
            [
              "cmp_1",
              {
                campaignId: "cmp_1",
                ownerType: "ad_set",
                ownerLabel: "Winner Ad Set",
                item: {
                  id: "adset:1",
                  title: "Winner Ad Set",
                  primaryAction: "Increase budget",
                  authorityState: "act_now",
                  reason: "Strong signal.",
                  blocker: null,
                  confidence: "High",
                  secondaryLabels: ["Lowest Cost"],
                  metrics: [],
                },
              },
            ],
          ])
        }
      />
    );

    expect(html).toContain("Account Overview");
    expect(html).toContain("Campaign One");
    expect(html).toContain("Sales");
    expect(html).toContain("Increase budget");
    expect(html).toContain("Act now");
    expect(html).toContain("spend");
    expect(html).toContain("Winner Ad Set");
  });

  it("reflects the selected campaign row in the rendered active-row semantics", () => {
    const selectedHtml = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId="cmp_1"
        onSelect={vi.fn()}
      />
    );
    const unselectedHtml = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    expect(selectedHtml).toContain("Campaign One</p>");
    expect(selectedHtml).toContain("text-foreground");
    expect(unselectedHtml).toContain("text-slate-700");
  });

  it("renders operator authority states that are visible on the current page", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[
          campaign({ id: "cmp_act", name: "Act Campaign" }) as any,
          campaign({ id: "cmp_truth", name: "Truth Campaign" }) as any,
          campaign({ id: "cmp_watch", name: "Watch Campaign" }) as any,
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignOperatorSummaries={new Map([
          [
            "cmp_act",
            {
              campaignId: "cmp_act",
              ownerType: "campaign",
              ownerLabel: "Prospecting Scale",
              item: {
                id: "campaign:cmp_act",
                title: "Act Campaign",
                primaryAction: "Increase budget",
                authorityState: "act_now",
                reason: "Strong signal.",
                blocker: null,
                confidence: "High",
                secondaryLabels: [],
                metrics: [],
              },
            },
          ],
          [
            "cmp_truth",
            {
              campaignId: "cmp_truth",
              ownerType: "campaign",
              ownerLabel: "Prospecting Scale",
              item: {
                id: "campaign:cmp_truth",
                title: "Truth Campaign",
                primaryAction: "Needs truth",
                authorityState: "needs_truth",
                reason: "Profitable, but capped.",
                blocker: "Missing target pack.",
                confidence: "Medium",
                secondaryLabels: [],
                metrics: [],
              },
            },
          ],
          [
            "cmp_watch",
            {
              campaignId: "cmp_watch",
              ownerType: "campaign",
              ownerLabel: "Prospecting Scale",
              item: {
                id: "campaign:cmp_watch",
                title: "Watch Campaign",
                primaryAction: "Wait",
                authorityState: "watch",
                reason: "Still learning.",
                blocker: null,
                confidence: "Limited",
                secondaryLabels: [],
                metrics: [],
              },
            },
          ],
        ])}
      />
    );

    expect(html).toContain("Act now");
    expect(html).toContain("Needs truth");
    expect(html).toContain("Watch");
  });

  it("renders the action owner and blocker when operator summary data exists", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignOperatorSummaries={
          new Map([
            [
              "cmp_1",
              {
                campaignId: "cmp_1",
                ownerType: "campaign",
                ownerLabel: "Prospecting Scale",
                item: {
                  id: "campaign:cmp_1",
                  title: "Campaign One",
                  primaryAction: "Review cost cap",
                  authorityState: "needs_truth",
                  reason: "Profitable, but capped.",
                  blocker: "Missing target pack.",
                  confidence: "Medium",
                  secondaryLabels: ["Cost Cap"],
                  metrics: [],
                },
              },
            ],
          ])
        }
      />
    );

    expect(html).toContain("Prospecting Scale");
    expect(html).toContain("Review cost cap");
    expect(html).toContain("Missing target pack");
    expect(html).toContain("Cost Cap");
  });

  it("sorts campaign rows in operator-first order before spend-only ordering", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[
          campaign({ id: "cmp_watch", name: "Watch Campaign", spend: 900 }) as any,
          campaign({ id: "cmp_blocked", name: "Blocked Campaign", spend: 800 }) as any,
          campaign({ id: "cmp_truth", name: "Truth Campaign", spend: 700 }) as any,
          campaign({ id: "cmp_act", name: "Act Campaign", spend: 100 }) as any,
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignOperatorSummaries={
          new Map([
            [
              "cmp_watch",
              {
                campaignId: "cmp_watch",
                ownerType: "campaign",
                ownerLabel: "Watch Campaign",
                item: {
                  id: "campaign:cmp_watch",
                  title: "Watch Campaign",
                  primaryAction: "Hold steady",
                  authorityState: "watch",
                  reason: "Still learning.",
                  blocker: null,
                  confidence: "Limited",
                  secondaryLabels: [],
                  metrics: [],
                },
              },
            ],
            [
              "cmp_blocked",
              {
                campaignId: "cmp_blocked",
                ownerType: "campaign",
                ownerLabel: "Blocked Campaign",
                item: {
                  id: "campaign:cmp_blocked",
                  title: "Blocked Campaign",
                  primaryAction: "Fix blocker",
                  authorityState: "blocked",
                  reason: "Deployment truth is blocked.",
                  blocker: "Preview missing.",
                  confidence: "Medium",
                  secondaryLabels: [],
                  metrics: [],
                },
              },
            ],
            [
              "cmp_truth",
              {
                campaignId: "cmp_truth",
                ownerType: "campaign",
                ownerLabel: "Truth Campaign",
                item: {
                  id: "campaign:cmp_truth",
                  title: "Truth Campaign",
                  primaryAction: "Needs truth",
                  authorityState: "needs_truth",
                  reason: "Profitable, but capped.",
                  blocker: "Missing target pack.",
                  confidence: "Medium",
                  secondaryLabels: [],
                  metrics: [],
                },
              },
            ],
            [
              "cmp_act",
              {
                campaignId: "cmp_act",
                ownerType: "campaign",
                ownerLabel: "Act Campaign",
                item: {
                  id: "campaign:cmp_act",
                  title: "Act Campaign",
                  primaryAction: "Increase budget",
                  authorityState: "act_now",
                  reason: "Strong signal.",
                  blocker: null,
                  confidence: "High",
                  secondaryLabels: [],
                  metrics: [],
                },
              },
            ],
          ])
        }
      />
    );

    expect(html.indexOf("Act Campaign")).toBeLessThan(html.indexOf("Truth Campaign"));
    expect(html.indexOf("Truth Campaign")).toBeLessThan(html.indexOf("Blocked Campaign"));
    expect(html.indexOf("Blocked Campaign")).toBeLessThan(html.indexOf("Watch Campaign"));
  });
});
