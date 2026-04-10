import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/store/preferences-store", () => ({
  usePreferencesStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ language: "en" }),
}));

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
        campaignRecStates={new Map([["cmp_1", "act"]])}
      />
    );

    expect(html).toContain("Account Overview");
    expect(html).toContain("Campaign One");
    expect(html).toContain("Sales");
    expect(html).toContain("act");
    expect(html).toContain("spend");
  });

  it("reflects the selected campaign row in the rendered active-row semantics", () => {
    const selectedHtml = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId="cmp_1"
        onSelect={vi.fn()}
        campaignRecStates={new Map()}
      />
    );
    const unselectedHtml = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignRecStates={new Map()}
      />
    );

    expect(selectedHtml).toContain("Campaign One</p>");
    expect(selectedHtml).toContain("text-foreground");
    expect(unselectedHtml).toContain("text-slate-700");
  });

  it("renders recommendation badge states that are visible on the current page", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[
          campaign({ id: "cmp_act", name: "Act Campaign" }) as any,
          campaign({ id: "cmp_test", name: "Test Campaign" }) as any,
          campaign({ id: "cmp_watch", name: "Watch Campaign" }) as any,
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignRecStates={new Map([
          ["cmp_act", "act"],
          ["cmp_test", "test"],
          ["cmp_watch", "watch"],
        ])}
      />
    );

    expect(html).toContain("act");
    expect(html).toContain("test");
    expect(html).toContain("watch");
  });

  it("renders campaign role, primary action, and no-touch hints when Decision OS data exists", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignList
        campaigns={[campaign() as any]}
        selectedId={null}
        onSelect={vi.fn()}
        campaignRecStates={new Map()}
        campaignDecisionMeta={
          new Map([
            [
              "cmp_1",
              {
                role: "Prospecting Scale",
                primaryAction: "scale_budget",
                noTouch: true,
                confidence: 0.84,
              },
            ],
          ])
        }
      />
    );

    expect(html).toContain("Prospecting Scale");
    expect(html).toContain("scale budget");
    expect(html).toContain("no-touch");
  });
});
