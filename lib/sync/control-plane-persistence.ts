import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import {
  resolveSyncControlPlaneKey,
  type SyncControlPlaneKey,
} from "@/lib/sync/control-plane-key";

type SyncGateIdentity = {
  id: string;
  buildId: string;
  environment: string;
  gateKind: "deploy_gate" | "release_gate";
  verdict: string | null;
  emittedAt: string | null;
};

type SyncRepairPlanIdentity = {
  id: string;
  buildId: string;
  environment: string;
  providerScope: string;
  eligible: boolean | null;
  emittedAt: string | null;
};

type SyncGateIdentityMap = {
  deployGate: SyncGateIdentity | null;
  releaseGate: SyncGateIdentity | null;
};

export interface SyncControlPlanePersistenceStatus {
  identity: SyncControlPlaneKey;
  exact: SyncGateIdentityMap & {
    repairPlan: SyncRepairPlanIdentity | null;
  };
  fallbackByBuild: SyncGateIdentityMap & {
    repairPlan: SyncRepairPlanIdentity | null;
  };
  latest: SyncGateIdentityMap & {
    repairPlan: SyncRepairPlanIdentity | null;
  };
  missingExact: Array<"deployGate" | "releaseGate" | "repairPlan">;
  exactRowsPresent: boolean;
}

async function assertControlPlaneTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: ["sync_release_gates", "sync_repair_plans"],
    context,
  });
}

function toIso(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function mapGateRows(rows: Array<Record<string, unknown>>): SyncGateIdentityMap {
  return rows.reduce<SyncGateIdentityMap>(
    (accumulator, row) => {
      const gateKind = row.gate_kind === "release_gate" ? "release_gate" : "deploy_gate";
      const key = gateKind === "deploy_gate" ? "deployGate" : "releaseGate";
      if (accumulator[key]) return accumulator;
      accumulator[key] = {
        id: String(row.id),
        buildId: String(row.build_id),
        environment: String(row.environment),
        gateKind,
        verdict: typeof row.verdict === "string" ? row.verdict : null,
        emittedAt: toIso(row.emitted_at),
      };
      return accumulator;
    },
    {
      deployGate: null,
      releaseGate: null,
    },
  );
}

function mapRepairPlanRow(row: Record<string, unknown> | undefined): SyncRepairPlanIdentity | null {
  if (!row) return null;
  return {
    id: String(row.id),
    buildId: String(row.build_id),
    environment: String(row.environment),
    providerScope: String(row.provider_scope),
    eligible: typeof row.eligible === "boolean" ? row.eligible : row.eligible == null ? null : Boolean(row.eligible),
    emittedAt: toIso(row.emitted_at),
  };
}

export async function getSyncControlPlanePersistenceStatus(input?: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
}): Promise<SyncControlPlanePersistenceStatus> {
  await assertControlPlaneTablesReady("sync_control_plane_persistence:get_status");
  const sql = getDb();
  const identity = resolveSyncControlPlaneKey(input);

  const [exactGateRows, fallbackGateRows, latestGateRows, exactRepairRows, fallbackRepairRows, latestRepairRows] =
    await Promise.all([
      sql`
        SELECT id, build_id, environment, gate_kind, verdict, emitted_at
        FROM sync_release_gates
        WHERE build_id = ${identity.buildId}
          AND environment = ${identity.environment}
        ORDER BY emitted_at DESC
      ` as Promise<Array<Record<string, unknown>>>,
      sql`
        SELECT id, build_id, environment, gate_kind, verdict, emitted_at
        FROM sync_release_gates
        WHERE build_id = ${identity.buildId}
        ORDER BY emitted_at DESC
      ` as Promise<Array<Record<string, unknown>>>,
      sql`
        SELECT DISTINCT ON (gate_kind)
          id, build_id, environment, gate_kind, verdict, emitted_at
        FROM sync_release_gates
        ORDER BY gate_kind, emitted_at DESC
      ` as Promise<Array<Record<string, unknown>>>,
      sql`
        SELECT id, build_id, environment, provider_scope, eligible, emitted_at
        FROM sync_repair_plans
        WHERE build_id = ${identity.buildId}
          AND environment = ${identity.environment}
          AND provider_scope = ${identity.providerScope}
        ORDER BY emitted_at DESC
        LIMIT 1
      ` as Promise<Array<Record<string, unknown>>>,
      sql`
        SELECT id, build_id, environment, provider_scope, eligible, emitted_at
        FROM sync_repair_plans
        WHERE build_id = ${identity.buildId}
          AND provider_scope = ${identity.providerScope}
        ORDER BY emitted_at DESC
        LIMIT 1
      ` as Promise<Array<Record<string, unknown>>>,
      sql`
        SELECT id, build_id, environment, provider_scope, eligible, emitted_at
        FROM sync_repair_plans
        WHERE provider_scope = ${identity.providerScope}
        ORDER BY emitted_at DESC
        LIMIT 1
      ` as Promise<Array<Record<string, unknown>>>,
    ]);

  const exact = {
    ...mapGateRows(exactGateRows),
    repairPlan: mapRepairPlanRow(exactRepairRows[0]),
  };
  const fallbackByBuild = {
    ...mapGateRows(fallbackGateRows),
    repairPlan: mapRepairPlanRow(fallbackRepairRows[0]),
  };
  const latest = {
    ...mapGateRows(latestGateRows),
    repairPlan: mapRepairPlanRow(latestRepairRows[0]),
  };
  const missingExact = ([
    !exact.deployGate ? "deployGate" : null,
    !exact.releaseGate ? "releaseGate" : null,
    !exact.repairPlan ? "repairPlan" : null,
  ].filter(Boolean) as Array<"deployGate" | "releaseGate" | "repairPlan">);

  return {
    identity,
    exact,
    fallbackByBuild,
    latest,
    missingExact,
    exactRowsPresent: missingExact.length === 0,
  };
}
