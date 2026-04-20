import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  buildId: string | null;
  environment: string | null;
  providerScope: string;
  breakGlass: boolean;
  overrideReason: string | null;
  enforceDeployGate: boolean;
};

const GOOGLE_ADS_CONTROL_PLANE_SCOPES = [
  "account_daily",
  "campaign_daily",
  "search_term_daily",
  "product_daily",
  "asset_group_daily",
  "asset_daily",
  "geo_daily",
  "device_daily",
  "audience_daily",
] as const;

type GoogleAdsControlPlaneBusiness = {
  businessId: string;
  businessName: string | null;
  assignedAccountCount: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    buildId: null,
    environment: null,
    providerScope: "meta",
    breakGlass: false,
    overrideReason: null,
    enforceDeployGate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--build-id") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --build-id");
      parsed.buildId = value;
      index += 1;
      continue;
    }
    if (arg === "--environment") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --environment");
      parsed.environment = value;
      index += 1;
      continue;
    }
    if (arg === "--provider-scope") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --provider-scope");
      parsed.providerScope = value;
      index += 1;
      continue;
    }
    if (arg === "--break-glass") {
      parsed.breakGlass = true;
      continue;
    }
    if (arg === "--override-reason") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --override-reason");
      parsed.overrideReason = value;
      index += 1;
      continue;
    }
    if (arg === "--enforce-deploy-gate") {
      parsed.enforceDeployGate = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function readConnectedGoogleAdsControlPlaneBusinesses() {
  const { getDb } = await import("@/lib/db");
  const sql = getDb();
  const rows = await sql`
    SELECT
      bpa.business_id,
      business.name AS business_name,
      COUNT(*)::int AS assigned_account_count
    FROM business_provider_accounts bpa
    INNER JOIN provider_connections connection
      ON connection.business_id = bpa.business_id
     AND connection.provider = bpa.provider
     AND connection.status = 'connected'
    LEFT JOIN businesses business
      ON business.id::text = bpa.business_id
    WHERE bpa.provider = 'google'
    GROUP BY bpa.business_id, business.name
    ORDER BY business.name NULLS LAST, bpa.business_id
  ` as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessName:
      typeof row.business_name === "string" && row.business_name.trim().length > 0
        ? row.business_name.trim()
        : null,
    assignedAccountCount: Number(row.assigned_account_count ?? 0),
  })) satisfies GoogleAdsControlPlaneBusiness[];
}

async function buildGoogleAdsReleaseGateCanaries(
  businesses: GoogleAdsControlPlaneBusiness[],
) {
  const {
    getGoogleAdsCheckpointHealth,
    getGoogleAdsQueueHealth,
    getGoogleAdsSyncState,
    getLatestGoogleAdsSyncHealth,
  } = await import("@/lib/google-ads/warehouse");
  const { getGoogleAdsWorkerSchedulingState } = await import("@/lib/sync/google-ads-sync");
  const {
    buildProviderProgressEvidence,
    deriveProviderActivityState,
    deriveProviderProgressState,
    deriveProviderStallFingerprints,
    deriveUnifiedSyncTruth,
  } = await import("@/lib/sync/provider-status-truth");
  const {
    buildGoogleAdsReleaseReadinessCandidate,
  } = await import("@/lib/google-ads/control-plane");

  return Promise.all(
    businesses.map(async (business) => {
      const [queueHealth, checkpointHealth, latestSyncHealth, workerState, ...scopeStates] =
        await Promise.all([
          getGoogleAdsQueueHealth({
            businessId: business.businessId,
          }),
          getGoogleAdsCheckpointHealth({
            businessId: business.businessId,
            providerAccountId: null,
          }).catch(() => null),
          getLatestGoogleAdsSyncHealth({
            businessId: business.businessId,
            providerAccountId: null,
          }).catch(() => null),
          getGoogleAdsWorkerSchedulingState({
            businessId: business.businessId,
          }).catch(() => null),
          ...GOOGLE_ADS_CONTROL_PLANE_SCOPES.map((scope) =>
            getGoogleAdsSyncState({
              businessId: business.businessId,
              scope,
            }).catch(() => []),
          ),
        ]);

      const latestGoogleActivityAt =
        queueHealth.latestCoreActivityAt ??
        queueHealth.latestExtendedActivityAt ??
        queueHealth.latestMaintenanceActivityAt ??
        null;
      const progressEvidence = buildProviderProgressEvidence({
        states: scopeStates.flatMap((rows) => rows),
        checkpointUpdatedAt: checkpointHealth?.latestCheckpointUpdatedAt ?? null,
        recentActivityWindowMinutes: 20,
        aggregation: "latest",
      });
      const latestSyncStatus =
        latestSyncHealth?.status != null ? String(latestSyncHealth.status) : null;
      const blocked =
        queueHealth.deadLetterPartitions > 0 || latestSyncStatus === "failed";
      const progressState = deriveProviderProgressState({
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
        checkpointLagMinutes: checkpointHealth?.checkpointLagMinutes ?? null,
        latestPartitionActivityAt: latestGoogleActivityAt,
        blocked,
        fullyReady:
          latestSyncStatus === "succeeded" &&
          queueHealth.queueDepth === 0 &&
          queueHealth.deadLetterPartitions === 0,
        staleRunPressure: 0,
        progressEvidence,
      });
      const activityState = deriveProviderActivityState({
        progressState,
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
        blocked,
      });
      const stallFingerprints = deriveProviderStallFingerprints({
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
        checkpointLagMinutes: checkpointHealth?.checkpointLagMinutes ?? null,
        latestPartitionActivityAt: latestGoogleActivityAt,
        blocked,
        staleRunPressure: 0,
        progressEvidence,
        blockedReasonCodes: queueHealth.deadLetterPartitions > 0
          ? ["required_dead_letter_partitions"]
          : latestSyncStatus === "failed"
            ? ["latest_sync_failed"]
            : [],
        historicalBacklogDepth:
          queueHealth.extendedHistoricalQueueDepth +
          queueHealth.extendedHistoricalLeasedPartitions,
      });
      const unifiedTruth = deriveUnifiedSyncTruth({
        activityState,
        progressState,
        workerOnline: workerState?.healthy ?? null,
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
      });
      const candidate = buildGoogleAdsReleaseReadinessCandidate({
        connected: true,
        assignedAccountCount: business.assignedAccountCount,
        activityState,
        progressState,
        workerOnline: workerState?.healthy ?? null,
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
        retryableFailedPartitions: 0,
        deadLetterPartitions: queueHealth.deadLetterPartitions,
        staleLeasePartitions: 0,
        syncTruthState: unifiedTruth.syncTruthState,
        stallFingerprints,
      });

      return {
        businessId: business.businessId,
        businessName: business.businessName,
        pass: candidate?.pass ?? false,
        blockerClass: candidate?.blockerClass ?? "not_release_ready",
        evidence: {
          ...(candidate?.evidence ?? {}),
          latestSyncStatus,
        },
      };
    }),
  );
}

async function main() {
  configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));
  const environment = args.environment ?? process.env.NODE_ENV?.trim() ?? "production";
  const {
    evaluateAndPersistSyncGates,
    evaluateDeployGate,
    shouldEnforceSyncGateFailure,
    upsertSyncGateRecord,
  } = await import("@/lib/sync/release-gates");
  const { evaluateAndPersistSyncRepairPlan } = await import("@/lib/sync/repair-planner");
  const {
    getSyncControlPlanePersistenceStatus,
  } = await import("@/lib/sync/control-plane-persistence");
  const { buildGoogleAdsReleaseGateRecord } = await import("@/lib/google-ads/control-plane");

  const gateVerdicts =
    args.providerScope === "google_ads"
      ? {
          checkedAt: new Date().toISOString(),
          deployGate: await evaluateDeployGate({
            buildId: args.buildId ?? undefined,
            environment,
            breakGlass: args.breakGlass,
            overrideReason: args.overrideReason,
            persist: true,
          }),
          releaseGate: await upsertSyncGateRecord(
              buildGoogleAdsReleaseGateRecord({
              buildId:
                args.buildId ??
                process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
                "dev-build",
              environment,
              canaries: await buildGoogleAdsReleaseGateCanaries(
                await readConnectedGoogleAdsControlPlaneBusinesses(),
              ),
              breakGlass: args.breakGlass,
              overrideReason: args.overrideReason,
            }),
          ),
        }
      : await evaluateAndPersistSyncGates({
          buildId: args.buildId ?? undefined,
          environment,
          breakGlass: args.breakGlass,
          overrideReason: args.overrideReason,
        });
  const repairPlan = await evaluateAndPersistSyncRepairPlan({
    buildId: args.buildId ?? undefined,
    environment,
    providerScope: args.providerScope,
    releaseGate: gateVerdicts.releaseGate,
  });
  const persistence = await getSyncControlPlanePersistenceStatus({
    buildId: args.buildId ?? undefined,
    environment,
    providerScope: args.providerScope,
  });

  const result = {
    identity: persistence.identity,
    gateVerdicts,
    repairPlan,
    persistence,
  };

  console.log(JSON.stringify(result, null, 2));

  if (
    args.enforceDeployGate &&
    shouldEnforceSyncGateFailure([gateVerdicts.deployGate])
  ) {
    process.exit(2);
  }

  if (!persistence.exactRowsPresent) {
    process.exit(3);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
