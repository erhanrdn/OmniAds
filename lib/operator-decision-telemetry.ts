import type {
  OperatorDecisionTelemetry,
  OperatorInstruction,
} from "@/src/types/operator-decision";

export const OPERATOR_DECISION_TELEMETRY_EVENT_VERSION =
  "operator-decision-telemetry-event.v1" as const;

export const OPERATOR_DECISION_TELEMETRY_STDOUT_ENV =
  "OPERATOR_DECISION_TELEMETRY_STDOUT" as const;
export const OPERATOR_DECISION_TELEMETRY_SINK_ENV =
  "OPERATOR_DECISION_TELEMETRY_SINK" as const;

export type OperatorDecisionTelemetryEventName =
  | "instruction_rendered"
  | "command_center_evaluated"
  | "runtime_smoke";

export type OperatorDecisionTelemetrySourceSurface =
  | "meta_decision_os"
  | "creative_decision_os"
  | "command_center"
  | "unknown";

export type OperatorDecisionTelemetryEvidenceSource =
  | "live"
  | "demo"
  | "snapshot"
  | "fallback"
  | "unknown";

export interface OperatorDecisionTelemetryEvent {
  contractVersion: typeof OPERATOR_DECISION_TELEMETRY_EVENT_VERSION;
  telemetryContractVersion: OperatorDecisionTelemetry["contractVersion"];
  eventName: OperatorDecisionTelemetryEventName;
  emittedAt: string | null;
  policyVersion: string | null;
  sourceSystem: OperatorDecisionTelemetry["sourceSystem"];
  sourceSurface: OperatorDecisionTelemetrySourceSurface;
  instructionKind: OperatorDecisionTelemetry["instructionKind"];
  pushReadiness: OperatorDecisionTelemetry["pushReadiness"];
  queueEligible: boolean;
  canApply: boolean;
  evidenceStrength: OperatorDecisionTelemetry["evidenceStrength"];
  urgency: OperatorDecisionTelemetry["urgency"];
  amountGuidanceStatus: OperatorDecisionTelemetry["amountGuidanceStatus"];
  targetContextStatus: OperatorDecisionTelemetry["targetContextStatus"];
  evidenceSource: OperatorDecisionTelemetryEvidenceSource | null;
  blockedReason: string | null;
  missingEvidence: string[];
  missingEvidenceCount: number;
  invalidActionCount: number;
  nextObservationCount: number;
  actionFingerprint: string | null;
  evidenceHash: string | null;
}

export interface OperatorDecisionTelemetryAggregate {
  contractVersion: "operator-decision-telemetry-aggregate.v1";
  eventCount: number;
  sourceSystemCounts: Record<string, number>;
  instructionKindCounts: Record<string, number>;
  pushReadinessCounts: Record<string, number>;
  amountGuidanceCounts: Record<string, number>;
  targetContextCounts: Record<string, number>;
  blockedReasonCounts: Record<string, number>;
}

export interface OperatorDecisionTelemetrySinkPosture {
  contractVersion: "operator-decision-telemetry-sink.v1";
  sink: "disabled" | "stdout_staged";
  productionReady: boolean;
  retention: "not_configured" | "external_sink";
  alerts: "not_configured" | "external_sink";
  note: string;
}

function incrementCount(bucket: Record<string, number>, key: string | null | undefined) {
  const safeKey = key?.trim() || "none";
  bucket[safeKey] = (bucket[safeKey] ?? 0) + 1;
}

function telemetrySafeToken(value: string | null | undefined) {
  const raw = String(value ?? "");
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return null;
  if (!/^[A-Za-z0-9_:-]+$/.test(raw.trim())) return "redacted";
  if (normalized.includes("token") || normalized.includes("cookie")) return "redacted";
  if (raw.includes("@")) return "redacted";
  if (/\d{5,}/.test(normalized)) return "redacted";
  if (normalized.length > 64) return "redacted";
  return normalized;
}

function sanitizeTelemetryTokenList(values: string[]) {
  return values
    .map(telemetrySafeToken)
    .filter((value): value is string => Boolean(value));
}

function normalizeSourceSurface(
  instruction: OperatorInstruction,
): OperatorDecisionTelemetrySourceSurface {
  const sourceSurface = instruction.telemetry.sourceSurface.toLowerCase();
  if (
    instruction.policySource.sourceSystem === "meta" ||
    sourceSurface.includes("meta")
  ) {
    return "meta_decision_os";
  }
  if (
    instruction.policySource.sourceSystem === "creative" ||
    sourceSurface.includes("creative")
  ) {
    return "creative_decision_os";
  }
  if (
    instruction.policySource.sourceSystem === "command_center" ||
    sourceSurface.includes("command")
  ) {
    return "command_center";
  }
  return "unknown";
}

function normalizeEvidenceSource(
  value: string | null | undefined,
): OperatorDecisionTelemetryEvidenceSource | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "live" ||
    normalized === "demo" ||
    normalized === "snapshot" ||
    normalized === "fallback" ||
    normalized === "unknown"
  ) {
    return normalized;
  }
  return "unknown";
}

export function buildOperatorDecisionTelemetryEvent(input: {
  instruction: OperatorInstruction;
  eventName?: OperatorDecisionTelemetryEventName;
  emittedAt?: string | null;
}): OperatorDecisionTelemetryEvent {
  const telemetry = input.instruction.telemetry;
  const missingEvidence = sanitizeTelemetryTokenList(telemetry.missingEvidence);
  return {
    contractVersion: OPERATOR_DECISION_TELEMETRY_EVENT_VERSION,
    telemetryContractVersion: telemetry.contractVersion,
    eventName: input.eventName ?? "instruction_rendered",
    emittedAt: input.emittedAt ?? null,
    policyVersion: telemetry.policyVersion,
    sourceSystem: telemetry.sourceSystem,
    sourceSurface: normalizeSourceSurface(input.instruction),
    instructionKind: telemetry.instructionKind,
    pushReadiness: telemetry.pushReadiness,
    queueEligible: telemetry.queueEligible,
    canApply: telemetry.canApply,
    evidenceStrength: telemetry.evidenceStrength,
    urgency: telemetry.urgency,
    amountGuidanceStatus: telemetry.amountGuidanceStatus,
    targetContextStatus: telemetry.targetContextStatus,
    evidenceSource: normalizeEvidenceSource(input.instruction.reliability.evidenceSource),
    blockedReason: telemetrySafeToken(telemetry.blockedReason),
    missingEvidence,
    missingEvidenceCount: missingEvidence.length,
    invalidActionCount: telemetry.invalidActionCount,
    nextObservationCount: telemetry.nextObservationCount,
    actionFingerprint: telemetry.actionFingerprint,
    evidenceHash: telemetry.evidenceHash,
  };
}

export function buildOperatorDecisionTelemetryAggregate(
  events: OperatorDecisionTelemetryEvent[],
): OperatorDecisionTelemetryAggregate {
  const aggregate: OperatorDecisionTelemetryAggregate = {
    contractVersion: "operator-decision-telemetry-aggregate.v1",
    eventCount: events.length,
    sourceSystemCounts: {},
    instructionKindCounts: {},
    pushReadinessCounts: {},
    amountGuidanceCounts: {},
    targetContextCounts: {},
    blockedReasonCounts: {},
  };

  for (const event of events) {
    incrementCount(aggregate.sourceSystemCounts, event.sourceSystem);
    incrementCount(aggregate.instructionKindCounts, event.instructionKind);
    incrementCount(aggregate.pushReadinessCounts, event.pushReadiness);
    incrementCount(aggregate.amountGuidanceCounts, event.amountGuidanceStatus);
    incrementCount(aggregate.targetContextCounts, event.targetContextStatus);
    incrementCount(aggregate.blockedReasonCounts, event.blockedReason);
  }

  return aggregate;
}

export function emitOperatorDecisionTelemetryEvent(input: {
  instruction: OperatorInstruction;
  eventName?: OperatorDecisionTelemetryEventName;
  emittedAt?: string | null;
  env?: Partial<
    Pick<
      NodeJS.ProcessEnv,
      | typeof OPERATOR_DECISION_TELEMETRY_STDOUT_ENV
      | typeof OPERATOR_DECISION_TELEMETRY_SINK_ENV
    >
  >;
}) {
  const event = buildOperatorDecisionTelemetryEvent(input);
  const env = input.env ?? process.env;
  if (
    env[OPERATOR_DECISION_TELEMETRY_STDOUT_ENV] === "1" ||
    env[OPERATOR_DECISION_TELEMETRY_SINK_ENV] === "stdout"
  ) {
    console.info("[operator-decision-telemetry]", event);
  }
  return event;
}

export function getOperatorDecisionTelemetrySinkPosture(input?: {
  env?: Partial<Pick<NodeJS.ProcessEnv, typeof OPERATOR_DECISION_TELEMETRY_SINK_ENV>>;
}): OperatorDecisionTelemetrySinkPosture {
  const env = input?.env ?? process.env;
  if (env[OPERATOR_DECISION_TELEMETRY_SINK_ENV] === "stdout") {
    return {
      contractVersion: "operator-decision-telemetry-sink.v1",
      sink: "stdout_staged",
      productionReady: false,
      retention: "not_configured",
      alerts: "not_configured",
      note:
        "Operator telemetry is staged to stdout only; wire a retained metrics/log sink and alerts before live push rollout.",
    };
  }
  return {
    contractVersion: "operator-decision-telemetry-sink.v1",
    sink: "disabled",
    productionReady: false,
    retention: "not_configured",
    alerts: "not_configured",
    note:
      "Operator telemetry emission is disabled until OPERATOR_DECISION_TELEMETRY_SINK is configured.",
  };
}
