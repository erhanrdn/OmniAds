import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/build-runtime", () => ({
  getCurrentRuntimeBuildId: vi.fn(() => "build-1"),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn(async () => null),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

const db = await import("@/lib/db");
const remediationExecutions = await import("@/lib/sync/remediation-executions");

describe("sync remediation execution summary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getDb).mockReturnValue(
      (async (strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("SELECT DISTINCT ON (business_id)")) {
          return [
            {
              id: "exec-1",
              build_id: "build-1",
              environment: "production",
              provider_scope: "meta",
              business_id: "biz-1",
              business_name: "TheSwaf",
              source_release_gate_id: "rg-1",
              source_repair_plan_id: "rp-1",
              post_run_release_gate_id: "rg-2",
              post_run_repair_plan_id: "rp-2",
              recommended_action: "integrity_repair_enqueue",
              executed_action: "repair_cycle",
              workflow_run_id: "run-1",
              workflow_actor: "codex",
              lock_owner: "run-1:biz-1",
              status: "completed",
              outcome_classification: "improving_not_cleared",
              expected_outcome_met: false,
              before_evidence_json: {},
              action_result_json: {},
              after_evidence_json: {},
              started_at: "2026-04-15T12:00:00.000Z",
              finished_at: "2026-04-15T12:01:00.000Z",
              created_at: "2026-04-15T12:00:00.000Z",
            },
            {
              id: "exec-2",
              build_id: "build-1",
              environment: "production",
              provider_scope: "meta",
              business_id: "biz-2",
              business_name: "Grandmix",
              source_release_gate_id: "rg-1",
              source_repair_plan_id: "rp-1",
              post_run_release_gate_id: "rg-2",
              post_run_repair_plan_id: "rp-2",
              recommended_action: "reschedule",
              executed_action: "reschedule",
              workflow_run_id: "run-1",
              workflow_actor: "codex",
              lock_owner: "run-1:biz-2",
              status: "completed",
              outcome_classification: "cleared",
              expected_outcome_met: true,
              before_evidence_json: {},
              action_result_json: {},
              after_evidence_json: {},
              started_at: "2026-04-15T12:05:00.000Z",
              finished_at: "2026-04-15T12:06:00.000Z",
              created_at: "2026-04-15T12:05:00.000Z",
            },
          ];
        }
        return [];
      }) as never,
    );
  });

  it("summarizes latest execution outcomes by business", async () => {
    const summary = await remediationExecutions.getLatestSyncRepairExecutionSummary({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
    });

    expect(summary).toEqual({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      latestStartedAt: "2026-04-15T12:05:00.000Z",
      latestFinishedAt: "2026-04-15T12:06:00.000Z",
      improvedAny: true,
      businessCount: 2,
      counts: {
        cleared: 1,
        improving_not_cleared: 1,
        no_change: 0,
        worse: 0,
        manual_follow_up_required: 0,
        locked: 0,
      },
    });
  });

  it("finalizes stale running executions instead of leaving them open forever", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:30:00.000Z"));
    vi.mocked(db.getDb).mockReturnValue(
      (async (strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("FROM sync_repair_executions") && query.includes("started_at >=")) {
          return [
            {
              id: "exec-stale",
              build_id: "build-1",
              environment: "production",
              provider_scope: "meta",
              business_id: "biz-1",
              business_name: "TheSwaf",
              execution_signature: "sig-1",
              source_release_gate_id: "rg-1",
              source_repair_plan_id: "rp-1",
              post_run_release_gate_id: null,
              post_run_repair_plan_id: null,
              recommended_action: "reschedule",
              executed_action: null,
              workflow_run_id: "run-1",
              workflow_actor: "worker",
              lock_owner: "worker:biz-1",
              status: "running",
              outcome_classification: null,
              expected_outcome_met: null,
              before_evidence_json: { queueDepth: 4 },
              action_result_json: { retryBudgetState: { recentAttemptCount: 1 } },
              after_evidence_json: {},
              started_at: "2026-04-15T12:00:00.000Z",
              finished_at: null,
              created_at: "2026-04-15T12:00:00.000Z",
            },
          ];
        }
        if (query.includes("UPDATE sync_repair_executions")) {
          return [
            {
              id: "exec-stale",
              build_id: "build-1",
              environment: "production",
              provider_scope: "meta",
              business_id: "biz-1",
              business_name: "TheSwaf",
              execution_signature: "sig-1",
              source_release_gate_id: "rg-1",
              source_repair_plan_id: "rp-1",
              post_run_release_gate_id: null,
              post_run_repair_plan_id: null,
              recommended_action: "reschedule",
              executed_action: null,
              workflow_run_id: "run-1",
              workflow_actor: "worker",
              lock_owner: "worker:biz-1",
              status: "failed",
              outcome_classification: "manual_follow_up_required",
              expected_outcome_met: false,
              before_evidence_json: { queueDepth: 4 },
              action_result_json: {
                retryBudgetState: { recentAttemptCount: 1 },
                reason: "stale_running_execution_finalized",
                staleExecutionFinalizedAt: "2026-04-15T12:30:00.000Z",
              },
              after_evidence_json: { queueDepth: 4 },
              started_at: "2026-04-15T12:00:00.000Z",
              finished_at: "2026-04-15T12:30:00.000Z",
              created_at: "2026-04-15T12:00:00.000Z",
            },
          ];
        }
        return [];
      }) as never,
    );

    const finalized = await remediationExecutions.finalizeStaleRunningSyncRepairExecutions({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      businessId: "biz-1",
      executionSignature: "sig-1",
      staleAfterMinutes: 15,
    });

    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({
      id: "exec-stale",
      status: "failed",
      outcomeClassification: "manual_follow_up_required",
      finishedAt: "2026-04-15T12:30:00.000Z",
      actionResult: expect.objectContaining({
        reason: "stale_running_execution_finalized",
      }),
    });

    vi.useRealTimers();
  });
});
