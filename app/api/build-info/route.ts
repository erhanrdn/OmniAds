import { NextResponse } from "next/server";
import { getCurrentRuntimeBuildId } from "@/lib/build-runtime";
import {
  assertRuntimeContractStartup,
  upsertRuntimeContractInstance,
  getRuntimeRegistryStatus,
} from "@/lib/sync/runtime-contract";
import { getLatestSyncGateRecords } from "@/lib/sync/release-gates";
import {
  evaluateAndPersistSyncRepairPlan,
  getLatestSyncRepairPlan,
} from "@/lib/sync/repair-planner";
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
  let repairPlan = repairPlanResult.value;
  let repairPlanError = repairPlanResult.error;
  let persistence = persistenceResult.value;
  let persistenceError = persistenceResult.error;

  if (
    registry &&
    gates.releaseGate &&
    persistence?.exact?.repairPlan == null
  ) {
    const healedRepairPlan = await evaluateAndPersistSyncRepairPlan({
      ...controlPlaneIdentity,
      persist: true,
      releaseGate: gates.releaseGate,
      runtimeRegistry: registry,
    })
      .then((value) => ({ value, error: null }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      }));

    if (healedRepairPlan.value) {
      repairPlan = healedRepairPlan.value;
      repairPlanError = null;

      const refreshedPersistence = await getSyncControlPlanePersistenceStatus({
        ...controlPlaneIdentity,
      })
        .then((value) => ({ value, error: null }))
        .catch((error) => ({
          value: persistence,
          error: error instanceof Error ? error.message : String(error),
        }));

      persistence = refreshedPersistence.value;
      persistenceError = refreshedPersistence.error;
    } else if (!repairPlanError) {
      repairPlanError = healedRepairPlan.error;
    }
  }

  return NextResponse.json(
    {
      buildId: getCurrentRuntimeBuildId(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      controlPlaneIdentity,
      controlPlanePersistence: persistence,
      runtimeContract: contract,
      runtimeRegistry: registry,
      deployGate: gates.deployGate,
      releaseGate: gates.releaseGate,
      repairPlan,
      remediationSummary: remediationSummaryResult.value,
      controlPlaneErrors: {
        runtimeRegistry: registryResult.error,
        syncGates: gateResult.error,
        repairPlan: repairPlanError,
        remediationSummary: remediationSummaryResult.error,
        controlPlanePersistence: persistenceError,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
