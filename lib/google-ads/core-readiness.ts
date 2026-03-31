export interface GoogleAdsCoreReadinessState {
  coreUsable: boolean;
  effectiveHistoricalTotalDays: number;
  overallCompletedDays: number;
  overallAccountCompletedDays: number;
  historicalReadyThroughDate: string | null;
  productPendingSurfaces: string[];
  historicalProgressPercent: number;
  needsBootstrap: boolean;
}

export function buildGoogleAdsCoreReadiness(input: {
  connected: boolean;
  assignedAccountCount: number;
  totalDays: number;
  accountCoverageDays: number;
  campaignCoverageDays: number;
  campaignReadyThroughDate: string | null;
}): GoogleAdsCoreReadinessState {
  const effectiveHistoricalTotalDays = Math.max(1, input.totalDays);
  const overallCompletedDays = Math.max(
    0,
    Math.min(input.campaignCoverageDays, effectiveHistoricalTotalDays)
  );
  const overallAccountCompletedDays = Math.max(
    0,
    Math.min(input.accountCoverageDays, effectiveHistoricalTotalDays)
  );
  const coreUsable =
    input.connected &&
    input.assignedAccountCount > 0 &&
    overallAccountCompletedDays > 0 &&
    overallCompletedDays > 0;
  const productPendingSurfaces = [
    overallAccountCompletedDays < effectiveHistoricalTotalDays ? "account_daily" : null,
    overallCompletedDays < effectiveHistoricalTotalDays ? "campaign_daily" : null,
  ].filter((value): value is string => Boolean(value));
  const historicalProgressPercent =
    effectiveHistoricalTotalDays > 0
      ? Math.min(100, Math.round((overallCompletedDays / effectiveHistoricalTotalDays) * 100))
      : 0;

  return {
    coreUsable,
    effectiveHistoricalTotalDays,
    overallCompletedDays,
    overallAccountCompletedDays,
    historicalReadyThroughDate: input.campaignReadyThroughDate,
    productPendingSurfaces,
    historicalProgressPercent,
    needsBootstrap:
      input.connected &&
      input.assignedAccountCount > 0 &&
      overallCompletedDays < effectiveHistoricalTotalDays,
  };
}
