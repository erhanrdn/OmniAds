export const GOOGLE_ADS_ADVISOR_READINESS_MODEL = "recent_90d_required_support";
export const GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS = 90;
export const GOOGLE_ADS_ADVISOR_REQUIRED_SURFACES = [
  "campaign_daily",
  "search_term_daily",
  "product_daily",
] as const;

export type GoogleAdsAdvisorRequiredSurface =
  (typeof GOOGLE_ADS_ADVISOR_REQUIRED_SURFACES)[number];

export function isGoogleAdsAdvisorWindowReady(completedDays: number | null | undefined) {
  return Number(completedDays ?? 0) >= GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS;
}
