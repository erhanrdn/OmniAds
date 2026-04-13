import type { MetaHistoricalVerificationState } from "@/lib/meta/warehouse-types";

export function isMetaHistoricalVerificationActionRequired(
  verificationState?: string | null,
): verificationState is Exclude<
  MetaHistoricalVerificationState,
  "processing" | "finalized_verified"
> {
  return (
    verificationState === "blocked" ||
    verificationState === "failed" ||
    verificationState === "repair_required"
  );
}

export function getMetaHistoricalVerificationReason(input: {
  verificationState?: string | null;
  fallbackReason: string;
}) {
  if (input.verificationState === "blocked") {
    return "Historical Meta publication is blocked because finalized work does not match the required published truth.";
  }
  if (input.verificationState === "failed") {
    return "Historical Meta verification failed for the selected range. The last published truth remains active while repair is required.";
  }
  if (input.verificationState === "repair_required") {
    return "Historical Meta data requires a fresh authoritative retry before the selected range can be treated as finalized.";
  }
  return input.fallbackReason;
}
