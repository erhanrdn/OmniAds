import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicCreativeSharePage } from "@/components/creatives/PublicCreativeSharePage";
import { MOCK_SHARE_PAYLOAD } from "@/components/creatives/shareCreativeMock";

vi.mock("@/components/creatives/CreativeRenderSurface", () => ({
  CreativeRenderSurface: () =>
    React.createElement("div", { "data-testid": "creative-render-surface-stub" }),
}));

describe("PublicCreativeSharePage", () => {
  it("renders selected creative analyses in the exported share link", () => {
    const html = renderToStaticMarkup(
      <PublicCreativeSharePage payload={MOCK_SHARE_PAYLOAD} />,
    );

    expect(html).toContain("Creative action plan");
    expect(html).toContain("Scale review: UGC Reel - Morning routine hook");
    expect(html).toContain("Amount: No safe amount calculated");
    expect(html).toContain("Send this to the media buyer for a controlled scale review.");
    expect(html).toContain("Do not scale from ROAS alone without buyer confirmation.");
    expect(html).toContain("Leave the creative active and monitor weekly movement.");
  });
});
