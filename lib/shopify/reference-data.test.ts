import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parseShopifyTotalSalesReferenceCsv,
  summarizeShopifyTotalSalesReference,
} from "@/lib/shopify/reference-data";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

describe("Shopify total sales reference fixture", () => {
  it("parses the March 2026 daily reference export and preserves Shopify formulas", async () => {
    const csv = await readFile(
      new URL("./__fixtures__/total-sales-over-time.2026-03.csv", import.meta.url),
      "utf8"
    );

    const rows = parseShopifyTotalSalesReferenceCsv(csv);
    const summary = summarizeShopifyTotalSalesReference(rows);

    expect(summary).toEqual({
      rowCount: 31,
      orders: 376,
      totalSales: 81223.73,
    });

    for (const row of rows) {
      expect(round2(row.grossSales + row.discounts + row.returns)).toBe(row.netSales);
      expect(
        round2(
          row.netSales +
            row.shippingCharges +
            row.duties +
            row.additionalFees +
            row.taxes
        )
      ).toBe(row.totalSales);
    }

    expect(rows.find((row) => row.day === "2026-03-29")).toEqual(
      expect.objectContaining({
        totalSales: 4610.11,
        grossSales: 4722.08,
        discounts: -135.04,
        returns: -48.12,
      })
    );

    expect(rows.find((row) => row.day === "2026-03-30")).toEqual(
      expect.objectContaining({
        totalSales: 2359.62,
        grossSales: 2453.25,
        discounts: -112.42,
        returns: 0,
      })
    );

    expect(rows.find((row) => row.day === "2026-03-31")).toEqual(
      expect.objectContaining({
        totalSales: 3981.81,
        grossSales: 4084.57,
        discounts: -122.76,
        returns: 0,
      })
    );
  });
});
