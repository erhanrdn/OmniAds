import { describe, expect, it } from "vitest";
import { classifyQuery } from "@/lib/geo-query-classification";

describe("classifyQuery", () => {
  it("treats branded queries as navigational when site context is available", () => {
    expect(classifyQuery("urbantrail", { siteUrl: "sc-domain:urbantrail.co" }).intent).toBe(
      "navigational",
    );
    expect(
      classifyQuery("urbantrail backpack", { siteUrl: "sc-domain:urbantrail.co" }).intent,
    ).toBe("navigational");
  });

  it("treats short product discovery queries as commercial", () => {
    expect(classifyQuery("office wall decor").intent).toBe("commercial");
    expect(classifyQuery("travel backpack").intent).toBe("commercial");
  });
});
