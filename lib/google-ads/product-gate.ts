import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getIntegrationMetadata } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  getGoogleAdsCheckpointHealth,
  getGoogleAdsQueueHealth,
  getGoogleAdsSyncState,
  getLatestGoogleAdsSyncHealth,
} from "@/lib/google-ads/warehouse";
import { getLatestGoogleAdsAdvisorSnapshot, isGoogleAdsAdvisorSnapshotFresh } from "@/lib/google-ads/advisor-snapshots";
import {
  getGoogleAdsAutomationConfig,
  getGoogleAdsDecisionEngineConfig,
  getGoogleAdsWritebackCapabilityGate,
} from "@/lib/google-ads/decision-engine-config";
import {
  getGoogleAdsRetentionRuntimeStatus,
  getLatestGoogleAdsRetentionRun,
} from "@/lib/google-ads/warehouse-retention";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";

export type GoogleAdsProductGateLevel = "PASS" | "WARN" | "FAIL" | "NOT VERIFIED";

export interface GoogleAdsProductGateSection {
  key:
    | "feature_flag_posture"
    | "warehouse_sync_health"
    | "state_consistency"
    | "advisor_readiness_contract"
    | "recovery_tooling_availability"
    | "admin_visibility_contract"
    | "product_exit_criteria"
    | "known_limitations";
  title: string;
  level: GoogleAdsProductGateLevel;
  summary: string;
  details: string[];
  data?: Record<string, unknown> | null;
}

export interface GoogleAdsProductGateBuildCheck {
  skipped: boolean;
  ok?: boolean;
  summary: string;
}

export interface GoogleAdsProductGateResult {
  businessId: string;
  checkedAt: string;
  startDate: string | null;
  endDate: string | null;
  sinceIso: string | null;
  strict: boolean;
  sections: GoogleAdsProductGateSection[];
  overallLevel: GoogleAdsProductGateLevel;
  buildCheck: GoogleAdsProductGateBuildCheck;
}

export interface RunGoogleAdsProductGateInput {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
  sinceIso?: string | null;
  strict?: boolean;
  skipAdmin?: boolean;
  buildCheck: GoogleAdsProductGateBuildCheck;
}

function section(
  input: GoogleAdsProductGateSection
): GoogleAdsProductGateSection {
  return input;
}

function hasDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.DATABASE_URL?.trim());
}

function readPackageScripts() {
  try {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    return packageJson.scripts ?? {};
  } catch {
    return {};
  }
}

function levelPriority(level: GoogleAdsProductGateLevel) {
  switch (level) {
    case "PASS":
      return 0;
    case "WARN":
      return 1;
    case "NOT VERIFIED":
      return 2;
    case "FAIL":
      return 3;
  }
}

function maxLevel(levels: GoogleAdsProductGateLevel[]) {
  return levels.reduce<GoogleAdsProductGateLevel>(
    (current, candidate) =>
      levelPriority(candidate) > levelPriority(current) ? candidate : current,
    "PASS"
  );
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function isOlderThan(value: string | null | undefined, sinceIso: string | null | undefined) {
  if (!value || !sinceIso) return false;
  return new Date(value).getTime() < new Date(sinceIso).getTime();
}

export function shouldGoogleAdsProductGateFailStrict(
  result: Pick<GoogleAdsProductGateResult, "sections">
) {
  return result.sections.some((entry) => entry.level !== "PASS");
}

export async function runGoogleAdsProductGate(
  input: RunGoogleAdsProductGateInput
): Promise<GoogleAdsProductGateResult> {
  const checkedAt = new Date().toISOString();
  const sections: GoogleAdsProductGateSection[] = [];
  const decisionConfig = getGoogleAdsDecisionEngineConfig();
  const automationConfig = getGoogleAdsAutomationConfig();
  const writebackGate = getGoogleAdsWritebackCapabilityGate();
  const retentionRuntime = getGoogleAdsRetentionRuntimeStatus();
  const runtimeAvailable = hasDatabaseUrl();

  sections.push(
    section({
      key: "feature_flag_posture",
      title: "Feature Flag Posture",
      level:
        decisionConfig.decisionEngineV2Enabled && !decisionConfig.writebackEnabled
          ? "PASS"
          : decisionConfig.writebackEnabled
            ? "WARN"
            : "FAIL",
      summary:
        decisionConfig.decisionEngineV2Enabled && !decisionConfig.writebackEnabled
          ? "Decision Engine V2 is enabled and write-back stays disabled as expected."
          : decisionConfig.writebackEnabled
            ? "Write-back is enabled, but the current product target is still manual-plan-first."
            : "Decision Engine V2 is disabled.",
      details: [
        `GOOGLE_ADS_DECISION_ENGINE_V2: ${decisionConfig.decisionEngineV2Enabled ? "enabled" : "disabled"}`,
        `GOOGLE_ADS_WRITEBACK_ENABLED: ${decisionConfig.writebackEnabled ? "enabled" : "disabled"}`,
        `Write-back gate: ${writebackGate.reason}`,
        `Write-back pilot: ${automationConfig.writebackPilotEnabled ? "enabled" : "disabled"}`,
        `Semi-autonomous bundles: ${automationConfig.semiAutonomousBundlesEnabled ? "enabled" : "disabled"}`,
        `Controlled autonomy: ${automationConfig.controlledAutonomyEnabled ? "enabled" : "disabled"}`,
        `Autonomy kill switch: ${automationConfig.autonomyKillSwitchActive ? "active" : "inactive"}`,
        `Manual approval required: ${automationConfig.manualApprovalRequired ? "yes" : "no"}`,
        `Autonomy allowlist: ${automationConfig.actionAllowlist.join(", ") || "none"}`,
        `Retention gate: ${retentionRuntime.gateReason}`,
      ],
      data: {
        decisionEngineV2Enabled: decisionConfig.decisionEngineV2Enabled,
        writebackEnabled: decisionConfig.writebackEnabled,
        retentionExecutionEnabled: retentionRuntime.executionEnabled,
        writebackPilotEnabled: automationConfig.writebackPilotEnabled,
        semiAutonomousBundlesEnabled: automationConfig.semiAutonomousBundlesEnabled,
        controlledAutonomyEnabled: automationConfig.controlledAutonomyEnabled,
        autonomyKillSwitchActive: automationConfig.autonomyKillSwitchActive,
        manualApprovalRequired: automationConfig.manualApprovalRequired,
        autonomyAllowlist: automationConfig.actionAllowlist,
      },
    })
  );

  if (!runtimeAvailable) {
    sections.push(
      section({
        key: "warehouse_sync_health",
        title: "Warehouse / Sync Health",
        level: "NOT VERIFIED",
        summary: "DATABASE_URL is unavailable, so warehouse and queue health could not be verified.",
        details: ["Runtime DB access is required for queue depth, sync state, and checkpoint verification."],
        data: null,
      }),
      section({
        key: "state_consistency",
        title: "State Consistency",
        level: "NOT VERIFIED",
        summary: "State rows could not be verified without database access.",
        details: ["google_ads_sync_state and related partition truth were not reachable in this runtime."],
        data: null,
      }),
      section({
        key: "advisor_readiness_contract",
        title: "Advisor Readiness Contract",
        level: "NOT VERIFIED",
        summary: "Advisor snapshot readiness and action-contract posture could not be verified without database access.",
        details: ["Snapshot freshness, native-vs-legacy contract source, and readiness evidence require DB reads."],
        data: null,
      })
    );
  } else {
    const primaryStateScopes = [
      "account_daily",
      "campaign_daily",
      "search_term_daily",
      "product_daily",
    ] as const;
    const [integration, assignments, queueHealth, latestSyncHealth, syncStateRowsByScope, checkpointHealth, latestSnapshot] =
      await Promise.all([
        getIntegrationMetadata(input.businessId, "google").catch(() => null),
        getProviderAccountAssignments(input.businessId, "google").catch(() => null),
        getGoogleAdsQueueHealth({ businessId: input.businessId }).catch(() => null),
        getLatestGoogleAdsSyncHealth({
          businessId: input.businessId,
          providerAccountId: null,
        }).catch(() => null),
        Promise.all(
          primaryStateScopes.map((scope) =>
            getGoogleAdsSyncState({
              businessId: input.businessId,
              providerAccountId: null,
              scope,
            }).catch(() => [])
          )
        ),
        getGoogleAdsCheckpointHealth({
          businessId: input.businessId,
          providerAccountId: null,
        }).catch(() => null),
        getLatestGoogleAdsAdvisorSnapshot({
          businessId: input.businessId,
          accountId: null,
        }).catch(() => null),
      ]);

    const connected = integration?.status === "connected";
    const assignedCount = assignments?.account_ids?.length ?? 0;
    const deadLetters = queueHealth?.deadLetterPartitions ?? 0;
    const queueLevel: GoogleAdsProductGateLevel =
      !connected || assignedCount === 0
        ? "FAIL"
        : deadLetters > 0
          ? "WARN"
          : latestSyncHealth?.lastError
            ? "WARN"
            : "PASS";

    sections.push(
      section({
        key: "warehouse_sync_health",
        title: "Warehouse / Sync Health",
        level: queueLevel,
        summary:
          queueLevel === "PASS"
            ? "Warehouse sync state is connected, assigned, and free of immediate dead-letter pressure."
            : !connected
              ? "Google Ads is not connected for this business."
              : assignedCount === 0
                ? "No Google Ads account is assigned to this business."
                : "Warehouse sync is present, but queue or recent sync warnings remain.",
        details: [
          `Integration status: ${integration?.status ?? "unknown"}`,
          `Assigned account count: ${assignedCount}`,
          `Queue depth: ${queueHealth?.queueDepth ?? 0}`,
          `Dead-letter partitions: ${deadLetters}`,
          `Latest sync error: ${latestSyncHealth?.lastError ?? "none"}`,
          `Latest checkpoint scope: ${checkpointHealth?.latestCheckpointScope ?? "none"}`,
        ],
        data: {
          queueHealth,
          latestSyncHealth,
          checkpointHealth,
        },
      })
    );

    const stateRows = Array.isArray(syncStateRowsByScope)
      ? syncStateRowsByScope.flat()
      : [];
    const stateDeadLetters = stateRows.reduce(
      (sum, row) => sum + Number(row.deadLetterCount ?? 0),
      0
    );
    const stateLevel: GoogleAdsProductGateLevel =
      stateRows.length === 0
        ? "WARN"
        : stateDeadLetters > 0
          ? "FAIL"
          : "PASS";

    sections.push(
      section({
        key: "state_consistency",
        title: "State Consistency",
        level: stateLevel,
        summary:
          stateLevel === "PASS"
            ? "google_ads_sync_state rows are present without recorded dead-letter counts."
            : stateRows.length === 0
              ? "No google_ads_sync_state rows were found for this business."
              : "State rows exist, but dead-letter counts remain.",
        details: [
          `State rows: ${stateRows.length}`,
          `State dead-letter count: ${stateDeadLetters}`,
          ...stateRows.slice(0, 5).map(
            (row) =>
              `${row.scope}: completed ${row.completedDays ?? 0}d, ready through ${row.readyThroughDate ?? "unknown"}`
          ),
        ],
        data: {
          stateRowCount: stateRows.length,
          stateDeadLetters,
        },
      })
    );

    const actionContract =
      latestSnapshot?.advisorPayload?.metadata?.actionContract ?? null;
    const snapshotFresh = isGoogleAdsAdvisorSnapshotFresh(latestSnapshot);
    const advisorLevel: GoogleAdsProductGateLevel =
      !latestSnapshot
        ? "WARN"
        : actionContract?.source !== "native"
          ? "WARN"
          : snapshotFresh
            ? "PASS"
            : "WARN";

    sections.push(
      section({
        key: "advisor_readiness_contract",
        title: "Advisor Readiness Contract",
        level: advisorLevel,
        summary:
          advisorLevel === "PASS"
            ? "A fresh advisor snapshot exists and advertises the native action-first contract."
            : !latestSnapshot
              ? "No advisor snapshot is currently available."
              : actionContract?.source !== "native"
                ? "Advisor snapshot exists, but it is still in legacy compatibility mode."
                : "Advisor snapshot exists, but it is stale.",
        details: [
          `Snapshot as-of date: ${latestSnapshot?.asOfDate ?? "none"}`,
          `Snapshot fresh: ${snapshotFresh ? "yes" : "no"}`,
          `Action contract version: ${actionContract?.version ?? "unknown"}`,
          `Action contract source: ${actionContract?.source ?? "unknown"}`,
        ],
        data: {
          snapshotAsOfDate: latestSnapshot?.asOfDate ?? null,
          snapshotFresh,
          actionContract,
        },
      })
    );
  }

  const packageScripts = readPackageScripts();
  const requiredScripts = [
    "google:ads:cleanup",
    "google:ads:replay-dead-letter",
    "google:ads:reschedule",
    "google:ads:refresh-state",
    "google:ads:repair-scope",
    "google:ads:state-check",
    "google:ads:advisor-readiness",
  ];
  const missingScripts = requiredScripts.filter((script) => !packageScripts[script]);
  sections.push(
    section({
      key: "recovery_tooling_availability",
      title: "Recovery Tooling Availability",
      level: missingScripts.length === 0 ? "PASS" : "FAIL",
      summary:
        missingScripts.length === 0
          ? "Cleanup, replay, reschedule, refresh-state, and readiness tooling are present."
          : "Some required recovery scripts are missing from package.json.",
      details:
        missingScripts.length === 0
          ? requiredScripts.map((script) => `${script}: present`)
          : missingScripts.map((script) => `${script}: missing`),
      data: {
        requiredScripts,
        missingScripts,
      },
    })
  );

  if (input.skipAdmin) {
    sections.push(
      section({
        key: "admin_visibility_contract",
        title: "Admin Visibility Contract",
        level: "NOT VERIFIED",
        summary: "Admin visibility was skipped at the caller's request.",
        details: ["Use the gate without --skip-admin to verify sync-health visibility for this business."],
        data: null,
      })
    );
  } else if (!runtimeAvailable) {
    sections.push(
      section({
        key: "admin_visibility_contract",
        title: "Admin Visibility Contract",
        level: "NOT VERIFIED",
        summary: "Admin sync-health visibility could not be verified without database access.",
        details: ["Admin operations health depends on warehouse and worker state tables."],
        data: null,
      })
    );
  } else {
    const adminHealth = await getAdminOperationsHealth().catch(() => null);
    const visibleBusiness = adminHealth?.syncHealth.googleAdsBusinesses?.find(
      (entry) => entry.businessId === input.businessId
    );
    sections.push(
      section({
        key: "admin_visibility_contract",
        title: "Admin Visibility Contract",
        level: visibleBusiness ? "PASS" : "WARN",
        summary: visibleBusiness
          ? "Admin sync-health exposes this Google Ads business with queue and readiness telemetry."
          : "Admin sync-health did not surface this business in the Google Ads list.",
        details: visibleBusiness
          ? [
              `Queue depth: ${visibleBusiness.queueDepth}`,
              `Dead-letter partitions: ${visibleBusiness.deadLetterPartitions}`,
              `Progress state: ${visibleBusiness.progressState ?? "unknown"}`,
            ]
          : ["Check /admin/sync-health and worker/warehouse records for this business."],
        data: visibleBusiness ?? null,
      })
    );
  }

  const latestRetentionRun =
    runtimeAvailable ? await getLatestGoogleAdsRetentionRun().catch(() => null) : null;
  const limitations: string[] = [
    decisionConfig.writebackEnabled
      ? "Write-back is enabled by flag, but mutate/rollback are not marked verified."
      : "Write-back remains disabled by default.",
    automationConfig.writebackPilotEnabled
      ? "A narrow write-back pilot flag is enabled; keep blast radius constrained and operator-reviewed."
      : "No verified write-back pilot is enabled.",
    automationConfig.semiAutonomousBundlesEnabled
      ? "Semi-autonomous bundles are enabled; manual approval must still remain explicit."
      : "Semi-autonomous bundles remain disabled by default.",
    automationConfig.controlledAutonomyEnabled
      ? automationConfig.autonomyKillSwitchActive
        ? "Controlled autonomy is flagged on, but the kill switch remains active."
        : "Controlled autonomy is enabled; verify allowlists and kill switch posture before use."
      : "Controlled autonomy remains disabled by default.",
    latestRetentionRun
      ? `Latest retention run mode: ${latestRetentionRun.executionMode} at ${latestRetentionRun.finishedAt ?? "unknown"}`
      : runtimeAvailable
        ? "No recorded Google Ads retention run was found yet."
        : "Retention runtime could not be verified without DATABASE_URL.",
    input.sinceIso
      ? `Observations were evaluated relative to sinceIso ${input.sinceIso}.`
      : "No sinceIso boundary was supplied for freshness assertions.",
  ];
  sections.push(
    section({
      key: "known_limitations",
      title: "Known Limitations / Deferred Items",
      level: "PASS",
      summary: "The product remains manual-plan-first, and some future automation capabilities stay intentionally gated.",
      details: limitations,
      data: {
        retentionRuntime: retentionRuntime,
        latestRetentionRun,
      },
    })
  );

  const exitCriteriaDetails = [
    `Build: ${input.buildCheck.summary}`,
    `Advisor contract section: ${sections.find((entry) => entry.key === "advisor_readiness_contract")?.level ?? "unknown"}`,
    `Retention runtime: ${retentionRuntime.mode}`,
    `Write-back default: ${decisionConfig.writebackEnabled ? "enabled" : "disabled"}`,
  ];
  const exitCriteriaLevel = maxLevel([
    input.buildCheck.skipped
      ? "WARN"
      : input.buildCheck.ok
        ? "PASS"
        : "FAIL",
    sections.find((entry) => entry.key === "feature_flag_posture")?.level ?? "FAIL",
    sections.find((entry) => entry.key === "warehouse_sync_health")?.level ?? "NOT VERIFIED",
    sections.find((entry) => entry.key === "advisor_readiness_contract")?.level ?? "NOT VERIFIED",
  ]);
  sections.push(
    section({
      key: "product_exit_criteria",
      title: "Product Exit Criteria",
      level: exitCriteriaLevel,
      summary:
        exitCriteriaLevel === "PASS"
          ? "Build and core product gates passed for the current runtime."
          : "One or more core product gates remain warned, failed, or not verified.",
      details: exitCriteriaDetails,
      data: {
        buildCheck: input.buildCheck,
      },
    })
  );

  return {
    businessId: input.businessId,
    checkedAt,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    sinceIso: input.sinceIso ?? null,
    strict: Boolean(input.strict),
    sections,
    overallLevel: maxLevel(sections.map((entry) => entry.level)),
    buildCheck: input.buildCheck,
  };
}
