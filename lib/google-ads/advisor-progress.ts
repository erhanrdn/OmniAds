export interface GoogleAdsAdvisorProgressCoverageInput {
  completedDays?: number | null;
}

export interface GoogleAdsAdvisorProgressState {
  percent: number;
  visible: boolean;
  summary: string;
}

export function buildGoogleAdsAdvisorProgress(input: {
  connected: boolean;
  assignedAccountCount: number;
  coreUsable: boolean;
  advisorReady: boolean;
  coverages: GoogleAdsAdvisorProgressCoverageInput[];
  coverageUnavailableCount?: number;
}): GoogleAdsAdvisorProgressState {
  const normalizedCoverages = input.coverages.filter(
    (coverage) => coverage.completedDays != null && Number.isFinite(Number(coverage.completedDays))
  );
  const coverageUnavailableCount = Math.max(
    0,
    input.coverages.length - normalizedCoverages.length + (input.coverageUnavailableCount ?? 0)
  );
  const missingCoverage = normalizedCoverages.some(
    (coverage) => Math.max(0, Math.min(90, Number(coverage.completedDays ?? 0))) < 90
  );
  const averageCoverageRatio =
    normalizedCoverages.reduce((sum, coverage) => {
      const completedDays = Math.max(0, Math.min(90, Number(coverage.completedDays ?? 0)));
      return sum + completedDays / 90;
    }, 0) / Math.max(1, normalizedCoverages.length);

  const percent = input.advisorReady
    ? 100
    : coverageUnavailableCount > 0 && normalizedCoverages.length > 0
      ? Math.max(
          input.coreUsable ? 95 : 10,
          Math.min(99, Math.round(averageCoverageRatio * 100))
        )
    : !missingCoverage
      ? 100
      : Math.max(
          input.coreUsable ? 10 : 0,
          Math.min(99, Math.round(averageCoverageRatio * 100))
        );

  const summary = !input.coreUsable
    ? "Campaign history is still being prepared for analysis."
    : coverageUnavailableCount > 0
      ? "Finalizing growth analysis."
    : !missingCoverage
      ? "Finalizing growth analysis."
      : "Campaign, search term, and product history are still being prepared for analysis.";

  return {
    percent,
    visible:
      input.connected &&
      input.assignedAccountCount > 0 &&
      percent < 100 &&
      (missingCoverage || coverageUnavailableCount > 0),
    summary,
  };
}
