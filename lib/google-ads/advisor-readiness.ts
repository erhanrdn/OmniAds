import { GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS } from "@/lib/google-ads/google-contract";
export {
  GOOGLE_ADS_ADVISOR_READINESS_MODEL,
  GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS,
  GOOGLE_ADS_ADVISOR_REQUIRED_SURFACES,
} from "@/lib/google-ads/google-contract";
export type { GoogleAdsAdvisorRequiredSurface } from "@/lib/google-ads/google-contract";

export function isGoogleAdsAdvisorWindowReady(completedDays: number | null | undefined) {
  return Number(completedDays ?? 0) >= GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS;
}
