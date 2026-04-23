import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreativeBenchmarkScopeControl } from "@/components/creatives/CreativeBenchmarkScopeControl";

describe("CreativeBenchmarkScopeControl", () => {
  it("renders account-wide as the default active scope", () => {
    const html = renderToStaticMarkup(
      <CreativeBenchmarkScopeControl
        value="account"
        campaignContext={null}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("Benchmark");
    expect(html).toContain("Account-wide");
    expect(html).not.toContain("Within campaign");
    expect(html).toContain('data-testid="creative-benchmark-scope-active"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows an explicit campaign option without silently activating it", () => {
    const html = renderToStaticMarkup(
      <CreativeBenchmarkScopeControl
        value="account"
        campaignContext={{
          campaignId: "cmp_1",
          campaignName: "Spring Prospecting",
          rowCount: 12,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("Within campaign");
    expect(html).toContain("Spring Prospecting");
    expect(html).toContain('data-testid="creative-benchmark-scope-account"');
    expect(html).toContain('data-testid="creative-benchmark-scope-campaign"');
  });

  it("preserves the explicit campaign scope state when selected", () => {
    const html = renderToStaticMarkup(
      <CreativeBenchmarkScopeControl
        value="campaign"
        campaignContext={{
          campaignId: "cmp_1",
          campaignName: "Spring Prospecting",
          rowCount: 12,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("Spring Prospecting");
    expect(html).toContain('data-testid="creative-benchmark-scope-campaign"');
    expect(html).toContain('aria-pressed="true"');
  });
});
