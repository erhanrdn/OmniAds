import { describe, expect, it } from "vitest";

import {
  isBindAllHostname,
  normalizeBindAllHostForBrowser,
  normalizeBindAllOriginForBrowser,
} from "@/lib/public-url";

describe("public URL helpers", () => {
  it("detects bind-all hostnames that are not browser destinations", () => {
    expect(isBindAllHostname("0.0.0.0")).toBe(true);
    expect(isBindAllHostname("::")).toBe(true);
    expect(isBindAllHostname("localhost")).toBe(false);
  });

  it("normalizes 0.0.0.0 URLs to localhost for browser redirects", () => {
    expect(normalizeBindAllHostForBrowser("http://0.0.0.0:3000/shopify/connect")).toBe(
      "http://localhost:3000/shopify/connect",
    );
    expect(normalizeBindAllOriginForBrowser("http://0.0.0.0:3000")).toBe(
      "http://localhost:3000",
    );
  });
});
