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
});
