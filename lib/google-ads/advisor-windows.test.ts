import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsAdvisorWindows,
  countInclusiveDays,
  getGoogleAdsAdvisorRequestedDays,
} from "@/lib/google-ads/advisor-windows";

describe("countInclusiveDays", () => {
  it("counts both start and end dates", () => {
    expect(countInclusiveDays("2026-03-27", "2026-03-27")).toBe(1);
    expect(countInclusiveDays("2026-03-25", "2026-03-27")).toBe(3);
  });
});

describe("getGoogleAdsAdvisorRequestedDays", () => {
  it("preserves actual custom window length", () => {
    expect(
      getGoogleAdsAdvisorRequestedDays({
        dateRange: "custom",
        customStart: "2026-03-27",
        customEnd: "2026-03-27",
      })
    ).toBe(1);

    expect(
      getGoogleAdsAdvisorRequestedDays({
        dateRange: "custom",
        customStart: "2026-03-25",
        customEnd: "2026-03-27",
      })
    ).toBe(3);
  });

  it("uses preset day counts for non-custom windows", () => {
    expect(
      getGoogleAdsAdvisorRequestedDays({
        dateRange: "7",
      })
    ).toBe(7);
  });
});

describe("buildGoogleAdsAdvisorWindows", () => {
  it("keeps the selected custom window exact while support windows anchor on the same end date", () => {
    const windows = buildGoogleAdsAdvisorWindows({
      dateRange: "custom",
      customStart: "2026-03-27",
      customEnd: "2026-03-27",
    });

    expect(windows.requestedDays).toBe(1);
    expect(windows.selectedWindow.customStart).toBe("2026-03-27");
    expect(windows.selectedWindow.customEnd).toBe("2026-03-27");
    expect(windows.selectedWindow.label).toBe("selected 1d");
    expect(windows.supportWindows.find((window) => window.key === "last3")).toMatchObject({
      customStart: "2026-03-25",
      customEnd: "2026-03-27",
      days: 3,
    });
  });
});
