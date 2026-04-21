import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetaAnalysisStatusCard } from "@/components/meta/meta-analysis-status-card";
import type { MetaAnalysisStatus } from "@/lib/meta/analysis-state";

function status(overrides: Partial<MetaAnalysisStatus> = {}): MetaAnalysisStatus {
  return {
    state: "not_run",
    decisionOsStatus: "not_run",
    decisionOsLabel: "Not run",
    recommendationSource: "none",
    recommendationSourceLabel: "None",
    presentationMode: "no_guidance",
    presentationModeLabel: "No guidance",
    isAnalysisRunning: false,
    message: "Run analysis to generate Decision OS guidance.",
    detailReasons: [],
    safeErrorMessage: null,
    rangeMismatch: false,
    analyzedRangeLabel: null,
    lastAnalyzedAtIso: null,
    ...overrides,
  };
}

describe("MetaAnalysisStatusCard", () => {
  it("renders initial not-run state", () => {
    const html = renderToStaticMarkup(<MetaAnalysisStatusCard status={status()} />);

    expect(html).toContain("Analysis status");
    expect(html).toContain("Decision OS: Not run");
    expect(html).toContain("Recommendation source: None");
    expect(html).toContain("Presentation: No guidance");
    expect(html).toContain("Run analysis to generate Decision OS guidance.");
  });

  it("renders fallback source and analyzed range", () => {
    const html = renderToStaticMarkup(
      <MetaAnalysisStatusCard
        status={status({
          state: "recommendation_fallback",
          decisionOsStatus: "degraded",
          decisionOsLabel: "Degraded",
          recommendationSource: "snapshot_fallback",
          recommendationSourceLabel: "Snapshot fallback",
          presentationMode: "fallback_context",
          presentationModeLabel: "Fallback context",
          message: "Showing snapshot fallback. Decision OS did not produce an authoritative response.",
          detailReasons: ["decision_os_unavailable"],
          analyzedRangeLabel: "2026-04-01 to 2026-04-21",
          lastAnalyzedAtIso: "2026-04-21T10:00:00.000Z",
        })}
      />,
    );

    expect(html).toContain("Decision OS: Degraded");
    expect(html).toContain("Recommendation source: Snapshot fallback");
    expect(html).toContain("Presentation: Fallback context");
    expect(html).toContain("Last successful analysis at 2026-04-21 10:00 UTC.");
    expect(html).toContain("Analyzed for 2026-04-01 to 2026-04-21.");
    expect(html).not.toContain("Decision OS last analyzed");
    expect(html).toContain("decision_os_unavailable");
  });

  it("renders Decision OS recommendation context without claiming the full surface is ready", () => {
    const html = renderToStaticMarkup(
      <MetaAnalysisStatusCard
        status={status({
          state: "error",
          decisionOsStatus: "error",
          decisionOsLabel: "Error",
          recommendationSource: "decision_os",
          recommendationSourceLabel: "Decision OS",
          presentationMode: "decision_os_recommendation_context",
          presentationModeLabel: "Decision OS recommendation context",
          message: "Recommendation source is Decision OS, but the Decision OS surface failed to load.",
          safeErrorMessage: "Analysis could not complete safely. Run analysis again for this range.",
          analyzedRangeLabel: "2026-04-01 to 2026-04-21",
          lastAnalyzedAtIso: "2026-04-21T10:00:00.000Z",
        })}
      />,
    );

    expect(html).toContain("Decision OS: Error");
    expect(html).toContain("Recommendation source: Decision OS");
    expect(html).toContain("Presentation: Decision OS recommendation context");
    expect(html).toContain("Decision OS surface failed to load");
    expect(html).toContain("Last successful analysis at 2026-04-21 10:00 UTC.");
    expect(html).not.toContain("Decision OS: Ready");
    expect(html).not.toContain("Decision OS last analyzed");
  });

  it("renders demo source as context rather than no guidance", () => {
    const html = renderToStaticMarkup(
      <MetaAnalysisStatusCard
        status={status({
          recommendationSource: "demo",
          recommendationSourceLabel: "Demo",
          presentationMode: "demo_context",
          presentationModeLabel: "Demo context",
          message: "Showing demo recommendation context for this range.",
        })}
      />,
    );

    expect(html).toContain("Recommendation source: Demo");
    expect(html).toContain("Presentation: Demo context");
    expect(html).not.toContain("Presentation: No guidance");
  });

  it("separates running analysis from Decision OS surface status", () => {
    const html = renderToStaticMarkup(
      <MetaAnalysisStatusCard
        status={status({
          state: "running",
          decisionOsStatus: "not_run",
          decisionOsLabel: "Not run",
          presentationMode: "loading",
          presentationModeLabel: "Loading",
          isAnalysisRunning: true,
          message: "Analysis is running for the selected range.",
        })}
      />,
    );

    expect(html).toContain("Analysis: Running");
    expect(html).toContain("Decision OS: Not run");
  });
});
