import { describe, expect, it } from "vitest";
import { getDemoCreatives, getDemoPlatformTable } from "@/src/services/data-service-demo";
import { Platform, PlatformLevel } from "@/src/types";

describe("data-service demo repository", () => {
  it("returns filtered demo platform rows with selected metrics only", async () => {
    const rows = await getDemoPlatformTable(
      Platform.META,
      PlatformLevel.CAMPAIGN,
      "demo-business",
      null,
      { startDate: "2026-03-01", endDate: "2026-03-07" },
      ["spend", "roas"]
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].platform).toBe(Platform.META);
    expect(rows[0].level).toBe(PlatformLevel.CAMPAIGN);
    expect(Object.keys(rows[0].metrics).sort()).toEqual(["roas", "spend"]);
  });

  it("filters and sorts demo creatives by requested criteria", async () => {
    const rows = await getDemoCreatives("11111111-1111-4111-8111-111111111111", {
      platforms: [Platform.META],
      format: "image",
      sortBy: "roas",
      search: "promo",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBe(Platform.META);
    expect(rows[0].format).toBe("image");
    expect(rows[0].name).toContain("Promo");
  });
});
