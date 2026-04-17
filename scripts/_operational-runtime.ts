import * as nextEnv from "@next/env";

export type OperationalScriptLane =
  | "read_only_observation"
  | "owner_maintenance";

export function configureOperationalScriptRuntime(input?: {
  lane?: OperationalScriptLane;
}) {
  nextEnv.loadEnvConfig(process.cwd());

  if (!process.env.ENABLE_RUNTIME_MIGRATIONS?.trim()) {
    process.env.ENABLE_RUNTIME_MIGRATIONS = "0";
  }

  return {
    lane: input?.lane ?? "read_only_observation",
    runtimeMigrationsEnabled: process.env.ENABLE_RUNTIME_MIGRATIONS === "1",
  };
}

function buildOwnerMaintenanceOptInError(scriptName?: string) {
  const label = scriptName?.trim() || "This script";
  return `${label} is an owner-maintenance script. Re-run with ENABLE_RUNTIME_MIGRATIONS=1 only after confirming the target DB/context.`;
}

export function assertOperationalOwnerMaintenance(input?: {
  runtimeMigrationsEnabled?: boolean;
  scriptName?: string;
}) {
  const runtimeMigrationsEnabled =
    input?.runtimeMigrationsEnabled ??
    configureOperationalScriptRuntime({ lane: "owner_maintenance" })
      .runtimeMigrationsEnabled;
  if (!runtimeMigrationsEnabled) {
    throw new Error(buildOwnerMaintenanceOptInError(input?.scriptName));
  }
  return true;
}

export async function runOperationalMigrationsIfEnabled(input?: {
  runtimeMigrationsEnabled?: boolean;
  lane?: OperationalScriptLane;
  scriptName?: string;
}) {
  const runtimeMigrationsEnabled =
    input?.runtimeMigrationsEnabled ??
    configureOperationalScriptRuntime({
      lane: input?.lane,
    }).runtimeMigrationsEnabled;
  if (!runtimeMigrationsEnabled) return false;
  if ((input?.lane ?? "read_only_observation") !== "owner_maintenance") {
    throw new Error(
      `${input?.scriptName?.trim() || "This script"} is a read-only observation script and must not run migrations.`,
    );
  }
  const { runMigrations } = await import("@/lib/migrations");
  await runMigrations();
  return true;
}

export async function withOperationalStartupLogsSilenced<T>(
  callback: () => Promise<T>,
) {
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[startup]")) return;
    originalInfo(...args);
  };
  try {
    return await callback();
  } finally {
    console.info = originalInfo;
  }
}

function getOperationalLeaseMinutes() {
  const raw = process.env.WORKER_RUNNER_LEASE_MINUTES?.trim();
  if (!raw) return 10;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export async function withOperationalRunnerLease<T>(input: {
  businessId: string;
  providerScope: "google_ads" | "meta";
  leaseOwner: string;
  run: () => Promise<T>;
}) {
  if (process.env.SYNC_WORKER_MODE !== "1") {
    return input.run();
  }

  const {
    acquireSyncRunnerLease,
    renewSyncRunnerLease,
    releaseSyncRunnerLease,
  } = await import(
    "@/lib/sync/worker-health"
  );
  const leaseMinutes = getOperationalLeaseMinutes();
  const leased = await acquireSyncRunnerLease({
    businessId: input.businessId,
    providerScope: input.providerScope,
    leaseOwner: input.leaseOwner,
    leaseMinutes,
  });
  if (!leased) {
    throw new Error(
      `Failed to acquire ${input.providerScope} runner lease for ${input.businessId}.`,
    );
  }

  const renewalIntervalMs = Math.max(
    30_000,
    Math.floor((leaseMinutes * 60_000) / 2),
  );
  let renewalTimer: NodeJS.Timeout | null = null;
  let renewalInFlight: Promise<unknown> | null = null;
  const renewLease = () => {
    renewalInFlight = renewSyncRunnerLease({
      businessId: input.businessId,
      providerScope: input.providerScope,
      leaseOwner: input.leaseOwner,
      leaseMinutes,
    }).catch(() => false);
    return renewalInFlight;
  };
  renewalTimer = setInterval(() => {
    void renewLease();
  }, renewalIntervalMs);
  renewalTimer.unref?.();

  try {
    return await input.run();
  } finally {
    if (renewalTimer) {
      clearInterval(renewalTimer);
    }
    const pendingRenewal = renewalInFlight;
    if (pendingRenewal) {
      await pendingRenewal;
    }
    await releaseSyncRunnerLease({
      businessId: input.businessId,
      providerScope: input.providerScope,
      leaseOwner: input.leaseOwner,
    }).catch(() => null);
  }
}
