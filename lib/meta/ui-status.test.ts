import { describe, expect, it } from "vitest";
import { getMetaPageStatusMessaging } from "@/lib/meta/ui-status";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

function buildStatus(overrides: Partial<MetaStatusResponse> = {}): MetaStatusResponse {
  return {
    state: "partial",
    connected: true,
    assignedAccountIds: ["act_1"],
    currentDateInTimezone: "2026-04-05",
    primaryAccountTimezone: "UTC",
    pageReadiness: {
      state: "partial",
      usable: true,
      complete: false,
      selectedRangeMode: "historical_warehouse",
      reason: "Placement breakdown data is still being prepared for the selected range.",
      missingRequiredSurfaces: ["breakdowns.placement"],
      requiredSurfaces: {} as never,
      optionalSurfaces: {} as never,
    },
    ...overrides,
  };
}

describe("meta page ui status messaging", () => {
  it("maps current-day syncing to one coherent message set", () => {
    const model = getMetaPageStatusMessaging(
      buildStatus({
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
      }),
      "en"
    );

    expect(model.state).toBe("syncing_current_day");
    expect(model.pill.label).toBe("Preparing today");
    expect(model.banner.title).toBe("Current-day Meta data is preparing");
    expect(model.emptyState.title).toBe("Current-day Meta data is preparing");
  });

  it("maps historical syncing to one coherent message set", () => {
    const model = getMetaPageStatusMessaging(
      buildStatus({
        pageReadiness: {
          state: "syncing",
          usable: false,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Campaign warehouse data is still being prepared for the selected range.",
          missingRequiredSurfaces: ["campaigns"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
      }),
      "en"
    );

    expect(model.state).toBe("syncing_historical");
    expect(model.pill.label).toBe("Preparing range");
    expect(model.banner.title).toBe("Selected range is preparing");
  });

  it("maps partial but usable to coherent partial language", () => {
    const model = getMetaPageStatusMessaging(buildStatus(), "en");

    expect(model.state).toBe("partial_historical");
    expect(model.pill.label).toBe("Partially ready");
    expect(model.banner.title).toBe("Meta page is partially ready");
    expect(model.emptyState.title).toBe("Campaign data is still being prepared");
  });

  it("maps blocked to warning language across pill and banner", () => {
    const model = getMetaPageStatusMessaging(
      buildStatus({
        pageReadiness: {
          state: "blocked",
          usable: false,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Placement breakdown data is only supported from 2026-04-10 onward for the selected range.",
          missingRequiredSurfaces: ["breakdowns.placement"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
      }),
      "en"
    );

    expect(model.state).toBe("blocked");
    expect(model.pill.label).toBe("Needs attention");
    expect(model.banner.tone).toBe("warning");
    expect(model.emptyState.title).toBe("The selected range is currently blocked");
  });

  it("maps not_connected to provider-unavailable page language", () => {
    const model = getMetaPageStatusMessaging(
      buildStatus({
        connected: false,
        assignedAccountIds: [],
        pageReadiness: {
          state: "not_connected",
          usable: false,
          complete: false,
          selectedRangeMode: "historical_warehouse",
          reason: "Meta integration is not connected.",
          missingRequiredSurfaces: ["summary", "campaigns"],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
      }),
      "en"
    );

    expect(model.state).toBe("not_connected");
    expect(model.pill.visible).toBe(false);
    expect(model.emptyState.title).toBe("Finish connecting Meta");
  });

  it("maps ready but empty separately from syncing", () => {
    const model = getMetaPageStatusMessaging(
      buildStatus({
        state: "ready",
        pageReadiness: {
          state: "ready",
          usable: true,
          complete: true,
          selectedRangeMode: "historical_warehouse",
          reason: null,
          missingRequiredSurfaces: [],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
      }),
      "en",
      { readyButEmpty: true }
    );

    expect(model.state).toBe("ready_empty");
    expect(model.pill.label).toBe("Active");
    expect(model.emptyState.title).toBe("No campaigns were found for this range");
    expect(model.banner.visible).toBe(false);
  });

  it("maps ready to active without a banner", () => {
    const model = getMetaPageStatusMessaging(
      buildStatus({
        state: "ready",
        pageReadiness: {
          state: "ready",
          usable: true,
          complete: true,
          selectedRangeMode: "historical_warehouse",
          reason: null,
          missingRequiredSurfaces: [],
          requiredSurfaces: {} as never,
          optionalSurfaces: {} as never,
        },
      }),
      "en"
    );

    expect(model.state).toBe("ready");
    expect(model.pill.label).toBe("Active");
    expect(model.banner.visible).toBe(false);
  });
});
