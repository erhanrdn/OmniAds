import { describe, expect, it } from "vitest";
import { verifyReleaseAuthorityManifestIntegrity } from "@/lib/release-authority/integrity";

describe("release authority manifest integrity", () => {
  it("keeps manifest references and doc banners in sync", () => {
    const report = verifyReleaseAuthorityManifestIntegrity();

    expect(report.missingPaths).toEqual([]);
    expect(report.missingDocs).toEqual([]);
    expect(report.bannerFailures).toEqual([]);
  });
});
