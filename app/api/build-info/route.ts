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
import { resolveSyncControlPlaneKey } from "@/lib/sync/control-plane-key";
import { getSyncControlPlanePersistenceStatus } from "@/lib/sync/control-plane-persistence";

function resolveProviderScope(request: Request) {
  try {
    const providerScope = new URL(request.url).searchParams.get("providerScope")?.trim();
    return providerScope || "meta";
  } catch {
    return "meta";
  }
}

export async function GET(request: Request) {
  const contract = assertRuntimeContractStartup({ service: "web" });
  const providerScope = resolveProviderScope(request);
  const controlPlaneIdentity = resolveSyncControlPlaneKey({
    buildId: contract.buildId,
    providerScope,
  });
  await upsertRuntimeContractInstance({
    contract,
  }).catch(() => null);
  const [registryResult, gateResult, repairPlanResult, remediationSummaryResult, persistenceResult] = await Promise.all([
    getRuntimeRegistryStatus({
      buildId: contract.buildId,
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })),
    getLatestSyncGateRecords({
      buildId: controlPlaneIdentity.buildId,
      environment: controlPlaneIdentity.environment,
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
      ...controlPlaneIdentity,
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })),
    getLatestSyncRepairExecutionSummary({
      ...controlPlaneIdentity,
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })),
    getSyncControlPlanePersistenceStatus({
      ...controlPlaneIdentity,
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
      controlPlaneIdentity,
      controlPlanePersistence: persistenceResult.value,
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
        controlPlanePersistence: persistenceResult.error,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
