import { describe, expect, it } from "vitest";
import {
  deriveMetaAnalysisStatus,
  didMetaAnalysisRefetchProduceUsableData,
  metaAnalysisRunRangeMatches,
} from "@/lib/meta/analysis-state";

const range = {
  businessId: "biz",
  startDate: "2026-04-01",
  endDate: "2026-04-21",
};

function decisionOs(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "meta-decision-os.v1",
    generatedAt: "2026-04-21T10:00:00.000Z",
    ...range,
    summary: {
      sourceHealth: [],
      readReliability: {
        status: "stable",
        detail: "Stable read.",
        determinism: "stable",
      },
      surfaceSummary: {
        actionCoreCount: 1,
        watchlistCount: 0,
        archiveCount: 0,
        degradedCount: 0,
      },
    },
    commercialTruthCoverage: {
      missingInputs: [],
    },
    authority: {
      truthState: "live_confident",
      completeness: "complete",
      freshness: {
        status: "fresh",
        updatedAt: "2026-04-21T10:00:00.000Z",
        reason: null,
      },
      missingInputs: [],
      reasons: [],
    },
    ...overrides,
  } as never;
}

function recommendations(system: "decision_os" | "snapshot_fallback" | "demo" = "decision_os", overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    ...range,
    summary: {} as never,
    recommendations: [],
    analysisSource: {
      system,
      decisionOsAvailable: system === "decision_os",
      ...(system === "snapshot_fallback" ? { fallbackReason: "decision_os_unavailable" } : {}),
    },
    ...overrides,
  } as never;
}

describe("deriveMetaAnalysisStatus", () => {
  it("returns not_run before manual analysis has data", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("not_run");
    expect(status.decisionOsLabel).toBe("Not run");
    expect(status.recommendationSource).toBe("none");
    expect(status.presentationMode).toBe("no_guidance");
    expect(status.message).toContain("Run analysis");
  });

  it("returns running without claiming Decision OS is running when only recommendations fetch", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsIsFetching: true,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("running");
    expect(status.decisionOsStatus).toBe("not_run");
    expect(status.presentationMode).toBe("loading");
    expect(status.isAnalysisRunning).toBe(true);
  });

  it("returns Decision OS running only while the Decision OS query is fetching", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsIsFetching: false,
      decisionOsIsFetching: true,
    });

    expect(status.state).toBe("running");
    expect(status.decisionOsStatus).toBe("running");
  });

  it("labels Decision OS sourced recommendations", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsData: recommendations("decision_os"),
      decisionOsData: decisionOs(),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("decision_os_ready");
    expect(status.decisionOsStatus).toBe("ready");
    expect(status.recommendationSource).toBe("decision_os");
    expect(status.presentationMode).toBe("decision_os_primary");
    expect(status.recommendationSourceLabel).toBe("Decision OS");
  });

  it("does not mark the Decision OS surface ready when only recommendations are Decision OS sourced", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsData: recommendations("decision_os"),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("not_run");
    expect(status.decisionOsStatus).toBe("not_run");
    expect(status.recommendationSource).toBe("decision_os");
    expect(status.presentationMode).toBe("decision_os_recommendation_context");
    expect(status.message).toContain("Decision OS surface is not loaded");
  });

  it("keeps Decision OS surface error separate from Decision OS recommendation source", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsData: recommendations("decision_os"),
      decisionOsError: new Error("failed"),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("error");
    expect(status.decisionOsStatus).toBe("error");
    expect(status.recommendationSource).toBe("decision_os");
    expect(status.presentationMode).toBe("decision_os_recommendation_context");
    expect(status.message).toContain("Decision OS surface failed to load");
  });

  it("keeps ready Decision OS surface separate from snapshot fallback recommendation source", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsData: recommendations("snapshot_fallback"),
      decisionOsData: decisionOs(),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("recommendation_fallback");
    expect(status.decisionOsStatus).toBe("ready");
    expect(status.recommendationSource).toBe("snapshot_fallback");
    expect(status.presentationMode).toBe("fallback_context");
  });

  it("labels snapshot fallback recommendations with the fallback reason", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsData: recommendations("snapshot_fallback"),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("recommendation_fallback");
    expect(status.decisionOsStatus).toBe("not_run");
    expect(status.recommendationSourceLabel).toBe("Snapshot fallback");
    expect(status.detailReasons).toContain("decision_os_unavailable");
  });

  it("labels demo recommendations as context instead of no guidance", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsData: recommendations("demo", {
        recommendations: [{ id: "rec-1" }],
      }),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("not_run");
    expect(status.decisionOsStatus).toBe("not_run");
    expect(status.recommendationSource).toBe("demo");
    expect(status.presentationMode).toBe("demo_context");
    expect(status.presentationModeLabel).toBe("Demo context");
    expect(status.message).toContain("demo recommendation context");
  });

  it("returns safe error state without exposing raw errors", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsError: new Error("database password leaked"),
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
    });

    expect(status.state).toBe("error");
    expect(status.safeErrorMessage).toBe("Analysis could not complete safely. Run analysis again for this range.");
    expect(status.safeErrorMessage).not.toContain("password");
  });

  it("returns error when a response does not match the selected range", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
      decisionOsData: decisionOs({
        businessId: "other-biz",
      }),
    });

    expect(status.state).toBe("error");
    expect(status.rangeMismatch).toBe(true);
    expect(status.decisionOsStatus).toBe("mismatch");
    expect(status.message).toContain("does not match");
  });

  it("does not false-mismatch ISO timestamp dates against date-only current params", () => {
    const status = deriveMetaAnalysisStatus({
      ...range,
      recommendationsIsFetching: false,
      decisionOsIsFetching: false,
      decisionOsData: decisionOs({
        startDate: "2026-04-01T00:00:00.000Z",
        endDate: "2026-04-21T23:59:59.999Z",
      }),
    });

    expect(status.rangeMismatch).toBe(false);
    expect(status.decisionOsStatus).toBe("ready");
  });

  it("does not treat refetch error results as successful analysis", () => {
    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "error",
          error: new Error("failed"),
          data: recommendations("decision_os"),
        },
        decisionOsResult: {
          status: "success",
          data: null,
        },
        expectedRange: range,
      }),
    ).toBe(false);
  });

  it("treats one successful usable refetch response as a successful analysis", () => {
    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "success",
          data: recommendations("snapshot_fallback"),
        },
        decisionOsResult: {
          status: "error",
          error: new Error("failed"),
          data: null,
        },
        expectedRange: range,
      }),
    ).toBe(true);
  });

  it("does not treat usable recommendations from a previous date range as successful analysis", () => {
    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "success",
          data: recommendations("decision_os", {
            startDate: "2026-03-01",
            endDate: "2026-03-21",
          }),
        },
        decisionOsResult: {
          status: "success",
          data: null,
        },
        expectedRange: range,
      }),
    ).toBe(false);
  });

  it("does not treat usable Decision OS data from a previous business as successful analysis", () => {
    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "success",
          data: null,
        },
        decisionOsResult: {
          status: "success",
          data: decisionOs({
            businessId: "previous-biz",
          }),
        },
        expectedRange: range,
      }),
    ).toBe(false);
  });

  it("does not stamp success when a usable same-run refetch payload is mismatched", () => {
    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "success",
          data: recommendations("decision_os", {
            startDate: "2026-04-02",
          }),
        },
        decisionOsResult: {
          status: "success",
          data: decisionOs(),
        },
        expectedRange: range,
      }),
    ).toBe(false);
  });

  it("does not treat usable refetch data with missing range fields as successful analysis", () => {
    const dataWithoutBusinessId = Object.fromEntries(
      Object.entries(
        recommendations("decision_os") as Record<string, unknown>,
      ).filter(([key]) => key !== "businessId"),
    );

    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "success",
          data: dataWithoutBusinessId as never,
        },
        decisionOsResult: {
          status: "success",
          data: null,
        },
        expectedRange: range,
      }),
    ).toBe(false);
  });

  it("normalizes refetch response dates before comparing the active range", () => {
    expect(
      didMetaAnalysisRefetchProduceUsableData({
        recommendationsResult: {
          status: "success",
          data: null,
        },
        decisionOsResult: {
          status: "success",
          data: decisionOs({
            startDate: "2026-04-01T00:00:00.000Z",
            endDate: "2026-04-21T23:59:59.999Z",
          }),
        },
        expectedRange: range,
      }),
    ).toBe(true);
  });

  it("matches the active analysis range with normalized dates", () => {
    expect(
      metaAnalysisRunRangeMatches(
        {
          businessId: "biz",
          startDate: "2026-04-01T00:00:00.000Z",
          endDate: "2026-04-21T23:59:59.999Z",
        },
        range,
      ),
    ).toBe(true);
  });

  it("rejects stale analyze completions after the active range changes", () => {
    expect(
      metaAnalysisRunRangeMatches(
        {
          businessId: "biz",
          startDate: "2026-04-08",
          endDate: "2026-04-21",
        },
        range,
      ),
    ).toBe(false);
  });

  it("rejects stale analyze completions after the active business changes", () => {
    expect(
      metaAnalysisRunRangeMatches(
        {
          businessId: "other-biz",
          startDate: "2026-04-01",
          endDate: "2026-04-21",
        },
        range,
      ),
    ).toBe(false);
  });
});
