export interface MetaWatchWindowAcceptance {
  expectedBuildId: string;
  observedBuildId: string | null;
  buildMatched: boolean;
  exactRowsPresent: boolean;
  deployGateIdPresent: boolean;
  deployGatePass: boolean;
  deployGateModeBlock: boolean;
  releaseGateIdPresent: boolean;
  releaseGatePass: boolean;
  releaseGateModeBlock: boolean;
  repairPlanIdPresent: boolean;
  repairPlanEmpty: boolean;
  accepted: boolean;
  reasons: string[];
}

export interface MetaWatchWindowStabilityAssessment {
  immediateAcceptancePassed: boolean;
  stabilityWindowPassed: boolean;
  manualRemediationObserved: boolean;
  cleanDeployAccepted: boolean;
  reasons: string[];
}

type GenericRecord = Record<string, unknown>;

function asRecord(value: unknown): GenericRecord {
  return value && typeof value === "object" ? (value as GenericRecord) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function evaluateMetaWatchWindowAcceptance(
  payload: unknown,
  expectedBuildId: string,
  options?: { requireBlockModes?: boolean },
): MetaWatchWindowAcceptance {
  const root = asRecord(payload);
  const controlPlanePersistence = asRecord(root.controlPlanePersistence);
  const deployGate = asRecord(root.deployGate);
  const releaseGate = asRecord(root.releaseGate);
  const repairPlan = asRecord(root.repairPlan);
  const recommendations = Array.isArray(repairPlan.recommendations)
    ? repairPlan.recommendations
    : [];

  const observedBuildId = asString(root.buildId);
  const buildMatched = observedBuildId === expectedBuildId;
  const exactRowsPresent = controlPlanePersistence.exactRowsPresent === true;
  const deployGateIdPresent = Boolean(asString(deployGate.id));
  const deployGatePass = asString(deployGate.verdict) === "pass";
  const deployGateModeBlock = asString(deployGate.mode) === "block";
  const releaseGateIdPresent = Boolean(asString(releaseGate.id));
  const releaseGatePass = asString(releaseGate.verdict) === "pass";
  const releaseGateModeBlock = asString(releaseGate.mode) === "block";
  const repairPlanIdPresent = Boolean(asString(repairPlan.id));
  const repairPlanEmpty = recommendations.length === 0;
  const requireBlockModes = options?.requireBlockModes === true;

  const reasons: string[] = [];
  if (!buildMatched) reasons.push("build_id_mismatch");
  if (!exactRowsPresent) reasons.push("exact_rows_missing");
  if (!deployGateIdPresent) reasons.push("deploy_gate_missing");
  if (!deployGatePass) reasons.push("deploy_gate_not_pass");
  if (!releaseGateIdPresent) reasons.push("release_gate_missing");
  if (!releaseGatePass) reasons.push("release_gate_not_pass");
  if (!repairPlanIdPresent) reasons.push("repair_plan_missing");
  if (!repairPlanEmpty) reasons.push("repair_plan_not_empty");
  if (requireBlockModes && !deployGateModeBlock) reasons.push("deploy_gate_mode_not_block");
  if (requireBlockModes && !releaseGateModeBlock) reasons.push("release_gate_mode_not_block");

  return {
    expectedBuildId,
    observedBuildId,
    buildMatched,
    exactRowsPresent,
    deployGateIdPresent,
    deployGatePass,
    deployGateModeBlock,
    releaseGateIdPresent,
    releaseGatePass,
    releaseGateModeBlock,
    repairPlanIdPresent,
    repairPlanEmpty,
    accepted: reasons.length === 0,
    reasons,
  };
}

export function evaluateMetaWatchWindowStability(input: {
  immediateAcceptance: MetaWatchWindowAcceptance;
  stabilityAcceptance: MetaWatchWindowAcceptance | null;
  manualRemediationObserved: boolean;
}): MetaWatchWindowStabilityAssessment {
  const immediateAcceptancePassed = input.immediateAcceptance.accepted;
  const stabilityWindowPassed = Boolean(input.stabilityAcceptance?.accepted);
  const reasons: string[] = [];

  if (!immediateAcceptancePassed) {
    reasons.push(...input.immediateAcceptance.reasons.map((reason) => `immediate_${reason}`));
  }
  if (!stabilityWindowPassed) {
    if (input.stabilityAcceptance) {
      reasons.push(...input.stabilityAcceptance.reasons.map((reason) => `stability_${reason}`));
    } else {
      reasons.push("stability_window_not_evaluated");
    }
  }
  if (input.manualRemediationObserved) {
    reasons.push("manual_remediation_observed");
  }

  return {
    immediateAcceptancePassed,
    stabilityWindowPassed,
    manualRemediationObserved: input.manualRemediationObserved,
    cleanDeployAccepted:
      immediateAcceptancePassed &&
      stabilityWindowPassed &&
      !input.manualRemediationObserved,
    reasons,
  };
}
