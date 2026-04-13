export const GOOGLE_ADS_ADVISOR_READINESS_MODEL = "recent_84d_required_support";
export const GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS = 84;
export const GOOGLE_ADS_ADVISOR_REQUIRED_SURFACES = [
  "campaign_daily",
  "search_term_daily",
  "product_daily",
] as const;

export type GoogleAdsAdvisorRequiredSurface =
  (typeof GOOGLE_ADS_ADVISOR_REQUIRED_SURFACES)[number];

export const GOOGLE_ADS_SEARCH_TERM_DAILY_RETENTION_DAYS = 120;
export const GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS = 761;
