import { describe, expect, it } from "vitest";

import {
  buildShopifyCleanupAuditArtifact,
  parseShopifyCleanupAuditArgs,
} from "@/scripts/shopify-cleanup-audit";

describe("shopify cleanup audit", () => {
  it("parses required cli args", () => {
    expect(
      parseShopifyCleanupAuditArgs([
        "--business-id",
        "biz-1",
        "--start-date",
        "2026-03-01",
        "--end-date",
        "2026-03-31",
      ]),
    ).toEqual({
      businessId: "biz-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      jsonOut: null,
    });
  });

  it("fails closed when archive or dimension coverage has gaps", () => {
    const artifact = buildShopifyCleanupAuditArtifact({
      businessId: "biz-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      archiveCoverage: [
        {
          key: "shopify_orders",
          label: "Shopify orders archive coverage",
          scopedRows: 10,
          archivedRows: 9,
          missingArchiveRows: 1,
          ready: false,
        },
      ],
      dimensionCoverage: [
        {
          key: "shopify_product_dimensions",
          label: "Shopify product dimension coverage",
          referencedRows: 12,
          dimensionRows: 11,
          missingDimensionRows: 1,
          ready: false,
        },
      ],
      inlineLegacyDetailCoverage: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.blockingIssues).toEqual(
      expect.arrayContaining([
        "Shopify orders archive coverage is missing 1 archived rows in the scoped window.",
        "Shopify product dimension coverage is missing 1 canonical dimension rows in the scoped window.",
      ]),
    );
  });

  it("does not block on already-removed inline legacy detail columns", () => {
    const artifact = buildShopifyCleanupAuditArtifact({
      businessId: "biz-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      archiveCoverage: [],
      dimensionCoverage: [],
      inlineLegacyDetailCoverage: [
        {
          key: "shopify_sync_state",
          label: "Shopify sync-state inline legacy detail coverage",
          legacyColumnsPresent: false,
          scopedLegacyRows: 0,
          archivedRows: 0,
          missingArchiveRows: 0,
          ready: true,
        },
      ],
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.blockingIssues).toEqual([]);
  });
});
