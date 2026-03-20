import { describe, expect, it } from "vitest";
import { classifySeoQueryIntent } from "@/lib/seo/intelligence";

describe("classifySeoQueryIntent", () => {
  it("treats branded queries as navigational instead of informational", () => {
    expect(classifySeoQueryIntent("urbantrail", "sc-domain:urbantrail.co")).toBe("navigational");
    expect(classifySeoQueryIntent("urbantrail backpack", "sc-domain:urbantrail.co")).toBe("navigational");
  });

  it("treats short product-category phrases as commercial", () => {
    expect(classifySeoQueryIntent("office wall decor")).toBe("commercial");
    expect(classifySeoQueryIntent("travel backpack")).toBe("commercial");
  });
});
