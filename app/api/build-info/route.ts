import { NextResponse } from "next/server";
import { getCurrentRuntimeBuildId } from "@/lib/build-runtime";
import {
  assertRuntimeContractStartup,
  upsertRuntimeContractInstance,
  getRuntimeRegistryStatus,
} from "@/lib/sync/runtime-contract";
import { getLatestSyncGateRecords } from "@/lib/sync/release-gates";
import { getLatestSyncRepairPlan } from "@/lib/sync/repair-planner";
import { getLatestSyncRepairExecutionSummary } from "@/lib/sync/remediation-executions";

export async function GET() {
  const contract = assertRuntimeContractStartup({ service: "web" });
  await upsertRuntimeContractInstance({
    contract,
  }).catch(() => null);
  const [registryResult, gateResult, repairPlanResult, remediationSummaryResult] = await Promise.all([
    getRuntimeRegistryStatus({
      buildId: contract.buildId,
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })),
    getLatestSyncGateRecords({
      buildId: contract.buildId,
      environment: process.env.NODE_ENV ?? "unknown",
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: {
          deployGate: null,
          releaseGate: null,
        },
        error: error instanceof Error ? error.message : String(error),
      })),
    getLatestSyncRepairPlan({
      buildId: contract.buildId,
      environment: process.env.NODE_ENV ?? "unknown",
      providerScope: "meta",
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })),
    getLatestSyncRepairExecutionSummary({
      buildId: contract.buildId,
      environment: process.env.NODE_ENV ?? "unknown",
      providerScope: "meta",
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })),
  ]);
  const registry = registryResult.value;
  const gates = gateResult.value;
  const repairPlan = repairPlanResult.value;
  return NextResponse.json(
    {
      buildId: getCurrentRuntimeBuildId(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      runtimeContract: contract,
      runtimeRegistry: registry,
      deployGate: gates.deployGate,
      releaseGate: gates.releaseGate,
      repairPlan,
      remediationSummary: remediationSummaryResult.value,
      controlPlaneErrors: {
        runtimeRegistry: registryResult.error,
        syncGates: gateResult.error,
        repairPlan: repairPlanResult.error,
        remediationSummary: remediationSummaryResult.error,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
