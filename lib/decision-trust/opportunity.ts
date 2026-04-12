import { normalizeDecisionReasons } from "@/lib/decision-trust/kernel";
import type {
  DecisionEvidenceFloor,
  DecisionEvidenceFloorStatus,
  DecisionOpportunityQueueEligibility,
  DecisionTruthState,
} from "@/src/types/decision-trust";

function resolveDecisionEvidenceFloorStatus(input: {
  status?: DecisionEvidenceFloorStatus;
  met?: boolean;
  watch?: boolean;
}) {
  if (input.status) return input.status;
  if (input.met) return "met" as const;
  if (input.watch) return "watch" as const;
  return "blocked" as const;
}

export function buildDecisionEvidenceFloor(input: {
  key: string;
  label: string;
  current: string;
  required: string;
  status?: DecisionEvidenceFloorStatus;
  met?: boolean;
  watch?: boolean;
  reason?: string | null;
}): DecisionEvidenceFloor {
  const status = resolveDecisionEvidenceFloorStatus(input);
  return {
    key: input.key,
    label: input.label,
    status,
    current: input.current,
    required: input.required,
    reason:
      status === "met"
        ? null
        : input.reason?.trim() || `${input.label} floor is not fully met.`,
  };
}

export function evaluateDecisionOpportunityQueue(input: {
  truthState: DecisionTruthState;
  authorityReady?: boolean;
  floors: DecisionEvidenceFloor[];
  blockedReasons?: Array<string | null | undefined>;
  watchReasons?: Array<string | null | undefined>;
}): DecisionOpportunityQueueEligibility {
  const floorBlockedReasons = input.floors
    .filter((floor) => floor.status === "blocked")
    .map((floor) => floor.reason ?? `${floor.label} floor is blocked.`);
  const floorWatchReasons = input.floors
    .filter((floor) => floor.status === "watch")
    .map((floor) => floor.reason ?? `${floor.label} floor still needs review.`);
  const sharedTruthBlockers = normalizeDecisionReasons(
    input.truthState !== "live_confident"
      ? ["Shared authority is still degraded, so this opportunity stays out of queue."]
      : [],
  );

  const blockedReasons = normalizeDecisionReasons([
    ...sharedTruthBlockers,
    ...(!input.authorityReady
      ? ["This opportunity is not yet authoritative enough for the queue."]
      : []),
    ...floorBlockedReasons,
    ...(input.blockedReasons ?? []),
  ]);
  const watchReasons = normalizeDecisionReasons([
    ...floorWatchReasons,
    ...(input.watchReasons ?? []),
  ]);

  return {
    eligible: blockedReasons.length === 0 && watchReasons.length === 0,
    blockedReasons,
    watchReasons,
    eligibilityTrace: {
      verdict:
        blockedReasons.length === 0 && watchReasons.length === 0
          ? "queue_ready"
          : blockedReasons.some((reason) => reason.toLowerCase().includes("protect"))
            ? "protected"
            : watchReasons.length > 0 && floorBlockedReasons.length === 0
              ? "board_only"
              : "blocked",
      evidenceFloors: {
        met: input.floors
          .filter((floor) => floor.status === "met")
          .map((floor) => `${floor.label}: ${floor.current}`),
        watch: input.floors
          .filter((floor) => floor.status === "watch")
          .map((floor) => floor.reason ?? `${floor.label} needs review.`),
        blocked: input.floors
          .filter((floor) => floor.status === "blocked")
          .map((floor) => floor.reason ?? `${floor.label} is blocked.`),
      },
      sharedTruthBlockers,
      queueCompilerDecision:
        blockedReasons.length === 0 && watchReasons.length === 0
          ? "Queue compiler accepted this opportunity into the default queue."
          : blockedReasons.length > 0
            ? "Queue compiler kept this opportunity out of the default queue."
            : "Queue compiler kept this opportunity on the board for operator review.",
      protectedReasons: blockedReasons.filter((reason) =>
        reason.toLowerCase().includes("protect"),
      ),
      blockedReasons,
      watchReasons,
    },
  };
}
