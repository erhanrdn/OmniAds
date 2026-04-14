import { describe, expect, it } from "vitest";
import {
  getMetaStatusNotice,
  getMetaSyncDescription,
  getMetaSyncTitle,
} from "@/lib/meta/ui";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

function buildStatus(overrides: Partial<MetaStatusResponse> = {}): MetaStatusResponse {
  return {
    state: "partial",
    connected: true,
    assignedAccountIds: ["act_1"],
    pageReadiness: {
      state: "partial",
      usable: true,
      complete: false,
      selectedRangeMode: "historical_warehouse",
      reason: "Breakdown warehouse data is still being prepared for the selected range.",
      missingRequiredSurfaces: ["breakdowns.age"],
      requiredSurfaces: {
        summary: {
          state: "ready",
          blocking: false,
          countsForPageCompleteness: true,
          truthClass: "historical_warehouse",
          reason: null,
        },
        campaigns: {
          state: "ready",
          blocking: false,
          countsForPageCompleteness: true,
          truthClass: "historical_warehouse",
          reason: null,
        },
        "breakdowns.age": {
          state: "syncing",
          blocking: true,
          countsForPageCompleteness: true,
          truthClass: "historical_warehouse",
          reason: "Breakdown warehouse data is still being prepared for the selected range.",
        },
        "breakdowns.location": {
          state: "syncing",
          blocking: true,
          countsForPageCompleteness: true,
          truthClass: "historical_warehouse",
          reason: "Breakdown warehouse data is still being prepared for the selected range.",
        },
        "breakdowns.placement": {
          state: "syncing",
          blocking: true,
          countsForPageCompleteness: true,
          truthClass: "historical_warehouse",
          reason: "Breakdown warehouse data is still being prepared for the selected range.",
        },
      },
      optionalSurfaces: {
        adsets: {
          state: "partial",
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "conditional_drilldown",
          reason: "Ad set drilldown becomes available when a campaign is selected and the selected range is prepared.",
        },
        recommendations: {
          state: "partial",
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
          reason: "Recommendations remain optional while selected-range core surfaces are still preparing.",
        },
        operating_mode: {
          state: "partial",
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
          reason: "Operating mode remains optional while selected-range core surfaces are still preparing.",
        },
        decision_os: {
          state: "partial",
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
          reason: "Decision OS remains optional while selected-range core surfaces are still preparing.",
        },
      },
    },
    ...overrides,
  };
}

describe("meta ui helpers", () => {
  it("prefers core-readiness copy over page completeness copy when only breakdowns lag", () => {
    const status = buildStatus({
      coreReadiness: {
        state: "ready",
        usable: true,
        complete: true,
        percent: 100,
        reason: null,
        summary: "Summary and campaign data are ready.",
        missingSurfaces: [],
        blockedSurfaces: [],
        surfaces: {
          summary: {
            state: "ready",
            blocking: false,
            countsForPageCompleteness: true,
            truthClass: "historical_warehouse",
            reason: null,
          },
          campaigns: {
            state: "ready",
            blocking: false,
            countsForPageCompleteness: true,
            truthClass: "historical_warehouse",
            reason: null,
          },
        },
      },
      extendedCompleteness: {
        state: "syncing",
        complete: false,
        percent: 33,
        reason: "Breakdown warehouse data is still being prepared for the selected range.",
        summary: "Breakdown data is still being prepared for the selected range.",
        missingSurfaces: [
          "breakdowns.age",
          "breakdowns.location",
          "breakdowns.placement",
        ],
        blockedSurfaces: [],
        surfaces: {
          "breakdowns.age": {
            state: "syncing",
            blocking: true,
            countsForPageCompleteness: true,
            truthClass: "historical_warehouse",
            reason: "Breakdown warehouse data is still being prepared for the selected range.",
          },
          "breakdowns.location": {
            state: "syncing",
            blocking: true,
            countsForPageCompleteness: true,
            truthClass: "historical_warehouse",
            reason: "Breakdown warehouse data is still being prepared for the selected range.",
          },
          "breakdowns.placement": {
            state: "syncing",
            blocking: true,
            countsForPageCompleteness: true,
            truthClass: "historical_warehouse",
            reason: "Breakdown warehouse data is still being prepared for the selected range.",
          },
        },
      },
      warehouse: {
        coverage: {
          selectedRange: {
            startDate: "2026-04-01",
            endDate: "2026-04-02",
            completedDays: 2,
            totalDays: 2,
            readyThroughDate: "2026-04-02",
            isComplete: true,
          },
        },
      } as never,
    });

    expect(getMetaSyncTitle(status, "en")).toBe("Meta core data is ready");
    expect(getMetaSyncDescription(status, "en")).toBe(
      "Summary and campaigns are ready. Breakdown surfaces for the selected range continue preparing in the background."
    );
    expect(getMetaStatusNotice(status, "en")).toBe(
      "Summary and campaigns are ready. Breakdown surfaces for the selected range continue preparing in the background."
    );
  });

  it("prefers page readiness for page-wide title and description", () => {
    const status = buildStatus();

    expect(getMetaSyncTitle(status, "en")).toBe("Meta page is partially ready");
    expect(getMetaSyncDescription(status, "en")).toBe(
      "Breakdown warehouse data is still being prepared for the selected range."
    );
  });

  it("uses page readiness reason for the page notice", () => {
    const status = buildStatus({
      state: "ready",
    });

    expect(getMetaStatusNotice(status, "en")).toBe(
      "Breakdown warehouse data is still being prepared for the selected range."
    );
  });

  it("uses current-day page messaging for current-day syncing copy", () => {
    const status = buildStatus({
      pageReadiness: {
        state: "syncing",
        usable: false,
        complete: false,
        selectedRangeMode: "current_day_live",
        reason: "Campaign data for the current Meta account day is still preparing.",
        missingRequiredSurfaces: ["campaigns"],
        requiredSurfaces: {} as never,
        optionalSurfaces: {} as never,
      },
    });

    expect(getMetaSyncTitle(status, "en")).toBe("Current-day Meta data is preparing");
    expect(getMetaSyncDescription(status, "en")).toBe(
      "Campaign data for the current Meta account day is still preparing."
    );
  });
});
