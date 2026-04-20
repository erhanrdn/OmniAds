import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderReadinessIndicator } from "@/components/sync/provider-readiness-indicator";

describe("ProviderReadinessIndicator", () => {
  it("renders Data ready for ready data surfaces", () => {
    const html = renderToStaticMarkup(
      <ProviderReadinessIndicator
        readinessLevel="ready"
        domainReadiness={{
          coreSurfacesReady: ["summary", "campaigns"],
          deepSurfacesPending: [],
          blockingSurfaces: [],
          summary: "Summary and campaign data are available.",
        }}
      />
    );

    expect(html).toContain("Data ready");
    expect(html).not.toContain(">Ready<");
  });
});
