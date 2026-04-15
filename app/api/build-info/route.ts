import { NextResponse } from "next/server";
import { getCurrentRuntimeBuildId } from "@/lib/build-runtime";
import {
  assertRuntimeContractStartup,
  upsertRuntimeContractInstance,
  getRuntimeRegistryStatus,
} from "@/lib/sync/runtime-contract";
import { getLatestSyncGateRecords } from "@/lib/sync/release-gates";

export async function GET() {
  const contract = assertRuntimeContractStartup({ service: "web" });
  await upsertRuntimeContractInstance({
    contract,
  }).catch(() => null);
  const [registry, gates] = await Promise.all([
    getRuntimeRegistryStatus({
      buildId: contract.buildId,
    }).catch(() => null),
    getLatestSyncGateRecords({
      buildId: contract.buildId,
      environment: process.env.NODE_ENV ?? "unknown",
    }).catch(() => ({
      deployGate: null,
      releaseGate: null,
    })),
  ]);
  return NextResponse.json(
    {
      buildId: getCurrentRuntimeBuildId(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      runtimeContract: contract,
      runtimeRegistry: registry,
      deployGate: gates.deployGate,
      releaseGate: gates.releaseGate,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
