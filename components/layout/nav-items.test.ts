import { describe, expect, it } from "vitest";
import { getNavItems } from "@/components/layout/nav-items";

describe("getNavItems", () => {
  it("places Commercial Truth in the Main navigation group", () => {
    const navItems = getNavItems("en");

    const commercialTruth = navItems.find((item) => item.href === "/commercial-truth");

    expect(commercialTruth).toMatchObject({
      label: "Commercial Truth",
      group: "Main",
      requiredPlan: "growth",
    });
  });

  it("keeps Settings in Manage and separate from Commercial Truth", () => {
    const navItems = getNavItems("en");

    expect(navItems.find((item) => item.href === "/settings")).toMatchObject({
      label: "Settings",
      group: "Manage",
    });
  });
});
