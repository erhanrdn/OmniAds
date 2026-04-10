import { describe, expect, it } from "vitest";
import {
  getMetaRequiredPageSurfaceKeys,
  isMetaPageCurrentDayPreparing,
  rollupMetaPageReadiness,
  shouldMaskMetaKpisAsPreparing,
} from "@/lib/meta/page-readiness";
import type {
  MetaPageReadiness,
  MetaPageSelectedRangeMode,
  MetaPageSurfaceKey,
  MetaSurfaceReadiness,
  MetaStatusResponse,
} from "@/lib/meta/status-types";

function buildSurface(
  state: MetaSurfaceReadiness["state"],
  overrides: Partial<MetaSurfaceReadiness> = {}
): MetaSurfaceReadiness {
  return {
    state,
    blocking: state !== "ready",
    countsForPageCompleteness: true,
    truthClass: "historical_warehouse",
    reason: state === "ready" ? null : "Surface is still preparing.",
    ...overrides,
  };
}

function buildReadiness(
  mode: MetaPageSelectedRangeMode,
  overrides?: {
    requiredSurfaces?: MetaPageReadiness["requiredSurfaces"];
    optionalSurfaces?: MetaPageReadiness["optionalSurfaces"];
  }
): MetaPageReadiness {
  return rollupMetaPageReadiness({
    connected: true,
    hasAssignedAccounts: true,
    selectedRangeMode: mode,
    requiredSurfaces: overrides?.requiredSurfaces ?? {
      summary: buildSurface("ready"),
      campaigns: buildSurface("ready"),
      "breakdowns.age": buildSurface("ready"),
      "breakdowns.location": buildSurface("ready"),
      "breakdowns.placement": buildSurface("ready"),
    },
    optionalSurfaces: overrides?.optionalSurfaces ?? {
      adsets: buildSurface("partial", {
        blocking: false,
        countsForPageCompleteness: false,
        truthClass: "conditional_drilldown",
      }),
      recommendations: buildSurface("syncing", {
        blocking: false,
        countsForPageCompleteness: false,
        truthClass: "deterministic_decision_engine",
      }),
      operating_mode: buildSurface("syncing", {
        blocking: false,
        countsForPageCompleteness: false,
        truthClass: "deterministic_decision_engine",
      }),
      decision_os: buildSurface("syncing", {
        blocking: false,
        countsForPageCompleteness: false,
        truthClass: "deterministic_decision_engine",
      }),
    },
  });
}

function buildStatus(pageReadiness: MetaPageReadiness | null): MetaStatusResponse {
  return {
    state: "partial",
    connected: true,
    assignedAccountIds: ["act_1"],
    pageReadiness,
  };
}

describe("meta page readiness", () => {
  it("returns ready when all required surfaces are ready", () => {
    const readiness = buildReadiness("historical_warehouse");

    expect(readiness.state).toBe("ready");
    expect(readiness.usable).toBe(true);
    expect(readiness.complete).toBe(true);
    expect(readiness.missingRequiredSurfaces).toEqual([]);
  });

  it("returns partial when breakdowns are missing but summary and campaigns are ready", () => {
    const readiness = rollupMetaPageReadiness({
      connected: true,
      hasAssignedAccounts: true,
      selectedRangeMode: "historical_warehouse",
      requiredSurfaces: {
        summary: buildSurface("ready"),
        campaigns: buildSurface("ready"),
        "breakdowns.age": buildSurface("syncing", {
          reason: "Age breakdown is still preparing.",
        }),
        "breakdowns.location": buildSurface("syncing", {
          reason: "Location breakdown is still preparing.",
        }),
        "breakdowns.placement": buildSurface("ready"),
      },
      optionalSurfaces: {
        adsets: buildSurface("ready", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "conditional_drilldown",
        }),
        recommendations: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        operating_mode: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        decision_os: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
      },
    });

    expect(readiness.state).toBe("partial");
    expect(readiness.usable).toBe(true);
    expect(readiness.complete).toBe(false);
    expect(readiness.missingRequiredSurfaces).toEqual([
      "breakdowns.age",
      "breakdowns.location",
    ]);
  });

  it("returns syncing when required surfaces are not yet usable but active work exists", () => {
    const readiness = rollupMetaPageReadiness({
      connected: true,
      hasAssignedAccounts: true,
      selectedRangeMode: "historical_warehouse",
      requiredSurfaces: {
        summary: buildSurface("syncing", {
          reason: "Summary warehouse data is still being prepared.",
        }),
        campaigns: buildSurface("syncing", {
          reason: "Campaign warehouse data is still being prepared.",
        }),
        "breakdowns.age": buildSurface("syncing"),
        "breakdowns.location": buildSurface("syncing"),
        "breakdowns.placement": buildSurface("syncing"),
      },
      optionalSurfaces: {
        adsets: buildSurface("syncing", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "conditional_drilldown",
        }),
        recommendations: buildSurface("syncing", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        operating_mode: buildSurface("syncing", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        decision_os: buildSurface("syncing", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
      },
    });

    expect(readiness.state).toBe("syncing");
    expect(readiness.usable).toBe(false);
    expect(readiness.complete).toBe(false);
  });

  it("returns not_connected when integration or assignment is missing", () => {
    const disconnected = rollupMetaPageReadiness({
      connected: false,
      hasAssignedAccounts: true,
      selectedRangeMode: "historical_warehouse",
      requiredSurfaces: {
        summary: buildSurface("not_connected"),
        campaigns: buildSurface("not_connected"),
        "breakdowns.age": buildSurface("not_connected"),
        "breakdowns.location": buildSurface("not_connected"),
        "breakdowns.placement": buildSurface("not_connected"),
      },
      optionalSurfaces: {
        adsets: buildSurface("not_connected", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "conditional_drilldown",
        }),
        recommendations: buildSurface("not_connected", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        operating_mode: buildSurface("not_connected", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        decision_os: buildSurface("not_connected", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
      },
    });

    expect(disconnected.state).toBe("not_connected");
    expect(disconnected.usable).toBe(false);
    expect(disconnected.complete).toBe(false);
  });

  it("marks current-day preparing from the selected-range contract", () => {
    const status = buildStatus(
      buildReadiness("current_day_live", {
        requiredSurfaces: {
          summary: buildSurface("ready", {
            truthClass: "current_day_live",
          }),
          campaigns: buildSurface("ready", {
            truthClass: "current_day_live",
          }),
          "breakdowns.age": buildSurface("syncing", {
            truthClass: "current_day_live",
            reason: "Breakdown data for the current Meta account day is still preparing.",
          }),
          "breakdowns.location": buildSurface("syncing", {
            truthClass: "current_day_live",
            reason: "Breakdown data for the current Meta account day is still preparing.",
          }),
          "breakdowns.placement": buildSurface("syncing", {
            truthClass: "current_day_live",
            reason: "Breakdown data for the current Meta account day is still preparing.",
          }),
        },
      })
    );

    expect(isMetaPageCurrentDayPreparing(status)).toBe(true);
    expect(
      shouldMaskMetaKpisAsPreparing({
        status,
        hasCampaignSpend: false,
        summaryLoading: false,
      })
    ).toBe(true);
  });

  it("does not let optional surfaces block completeness", () => {
    const readiness = buildReadiness("historical_warehouse");

    expect(readiness.optionalSurfaces.adsets.countsForPageCompleteness).toBe(false);
    expect(readiness.optionalSurfaces.recommendations.countsForPageCompleteness).toBe(false);
    expect(readiness.optionalSurfaces.operating_mode.countsForPageCompleteness).toBe(false);
    expect(readiness.optionalSurfaces.decision_os.countsForPageCompleteness).toBe(false);
    expect(getMetaRequiredPageSurfaceKeys()).toEqual([
      "summary",
      "campaigns",
      "breakdowns.age",
      "breakdowns.location",
      "breakdowns.placement",
    ] satisfies MetaPageSurfaceKey[]);
  });

  it("keeps missing required surfaces deterministic and ordered", () => {
    const readiness = rollupMetaPageReadiness({
      connected: true,
      hasAssignedAccounts: true,
      selectedRangeMode: "historical_warehouse",
      requiredSurfaces: {
        summary: buildSurface("ready"),
        campaigns: buildSurface("ready"),
        "breakdowns.age": buildSurface("ready"),
        "breakdowns.location": buildSurface("syncing", {
          reason: "Location breakdown is still preparing.",
        }),
        "breakdowns.placement": buildSurface("blocked", {
          reason: "Placement breakdown is blocked.",
        }),
      },
      optionalSurfaces: {
        adsets: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "conditional_drilldown",
        }),
        recommendations: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        operating_mode: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        decision_os: buildSurface("partial", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
      },
    });

    expect(readiness.missingRequiredSurfaces).toEqual([
      "breakdowns.location",
      "breakdowns.placement",
    ]);
    expect(readiness.reason).toBe("Location breakdown is still preparing.");
  });

  it("becomes incomplete when any single required breakdown surface is not ready", () => {
    const readiness = rollupMetaPageReadiness({
      connected: true,
      hasAssignedAccounts: true,
      selectedRangeMode: "historical_warehouse",
      requiredSurfaces: {
        summary: buildSurface("ready"),
        campaigns: buildSurface("ready"),
        "breakdowns.age": buildSurface("ready"),
        "breakdowns.location": buildSurface("ready"),
        "breakdowns.placement": buildSurface("partial", {
          reason: "Placement breakdown is still preparing.",
        }),
      },
      optionalSurfaces: {
        adsets: buildSurface("ready", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "conditional_drilldown",
        }),
        recommendations: buildSurface("ready", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        operating_mode: buildSurface("ready", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
        decision_os: buildSurface("ready", {
          blocking: false,
          countsForPageCompleteness: false,
          truthClass: "deterministic_decision_engine",
        }),
      },
    });

    expect(readiness.complete).toBe(false);
    expect(readiness.missingRequiredSurfaces).toEqual(["breakdowns.placement"]);
  });
});
