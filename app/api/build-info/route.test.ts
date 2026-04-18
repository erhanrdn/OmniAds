import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/build-info/route";

vi.mock("@/lib/build-runtime", () => ({
  getCurrentRuntimeBuildId: vi.fn(() => "build-1"),
}));

vi.mock("@/lib/sync/runtime-contract", () => ({
  assertRuntimeContractStartup: vi.fn(() => ({
    contractVersion: 1,
    service: "web",
    runtimeRole: "web",
    instanceId: "web:test:1",
    buildId: "build-1",
    nodeEnv: "production",
    providerScopes: ["meta"],
    dbTarget: {
      host: "db",
      port: 5432,
      database: "adsecute_prod",
      searchPath: null,
      sslMode: null,
    },
    dbFingerprint: "db-fingerprint",
    configFingerprint: "cfg-fingerprint",
    config: {
      metaAuthoritativeFinalizationV2: true,
      metaRetentionExecutionEnabled: false,
      releaseCanaryBusinesses: ["biz-1"],
      releaseCanaryConfigured: true,
      releaseCanaryHasMandatoryCanary: true,
      deployGateMode: "block",
      releaseGateMode: "measure_only",
    },
    validation: {
      pass: true,
      issues: [],
    },
  })),
  upsertRuntimeContractInstance: vi.fn(async () => null),
  getRuntimeRegistryStatus: vi.fn(async () => ({
    sampledAt: "2026-04-15T12:00:00.000Z",
    buildId: "build-1",
    freshnessWindowMinutes: 10,
    contractValid: true,
    serviceHealth: {
      web: null,
      worker: null,
    },
    webPresent: true,
    workerPresent: true,
    dbFingerprintMatch: true,
    configFingerprintMatch: true,
    issues: [],
  })),
}));

vi.mock("@/lib/sync/release-gates", () => ({
  getLatestSyncGateRecords: vi.fn(async () => ({
    deployGate: {
      id: "dg-1",
      gateKind: "deploy_gate",
      verdict: "pass",
      gateScope: "service_liveness",
    },
    releaseGate: {
      id: "rg-1",
      gateKind: "release_gate",
      verdict: "measure_only",
      gateScope: "release_readiness",
    },
  })),
}));

vi.mock("@/lib/sync/repair-planner", () => ({
  getLatestSyncRepairPlan: vi.fn(async () => ({
    id: "rp-1",
    buildId: "build-1",
    environment: "production",
    providerScope: "meta",
    eligible: true,
    blockedReason: null,
    recommendations: [],
  })),
  evaluateAndPersistSyncRepairPlan: vi.fn(async (input) => ({
    id: "rp-healed",
    buildId: input?.buildId ?? "build-1",
    environment: input?.environment ?? "test",
    providerScope: input?.providerScope ?? "meta",
    planMode: "dry_run",
    eligible: true,
    blockedReason: null,
    breakGlass: false,
    summary: "Sync repair dry-run found no safe recommendations for the current build.",
    recommendations: [],
    emittedAt: "2026-04-15T12:00:00.000Z",
  })),
}));

vi.mock("@/lib/sync/remediation-executions", () => ({
  getLatestSyncRepairExecutionSummary: vi.fn(async () => ({
    buildId: "build-1",
    environment: "production",
    providerScope: "meta",
    latestStartedAt: "2026-04-15T12:00:00.000Z",
    latestFinishedAt: "2026-04-15T12:05:00.000Z",
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
  })),
}));

vi.mock("@/lib/sync/control-plane-persistence", () => ({
  getSyncControlPlanePersistenceStatus: vi.fn(async () => ({
    identity: {
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
    },
    exact: {
      deployGate: {
        id: "dg-1",
        buildId: "build-1",
        environment: "production",
        gateKind: "deploy_gate",
        verdict: "pass",
        emittedAt: "2026-04-15T12:00:00.000Z",
      },
      releaseGate: {
        id: "rg-1",
        buildId: "build-1",
        environment: "production",
        gateKind: "release_gate",
        verdict: "measure_only",
        emittedAt: "2026-04-15T12:00:00.000Z",
      },
      repairPlan: {
        id: "rp-1",
        buildId: "build-1",
        environment: "production",
        providerScope: "meta",
        eligible: true,
        emittedAt: "2026-04-15T12:00:00.000Z",
      },
    },
    fallbackByBuild: {
      deployGate: null,
      releaseGate: null,
      repairPlan: null,
    },
    latest: {
      deployGate: null,
      releaseGate: null,
      repairPlan: null,
    },
    missingExact: [],
    exactRowsPresent: true,
  })),
}));

const repairPlanner = await import("@/lib/sync/repair-planner");
const controlPlanePersistence = await import("@/lib/sync/control-plane-persistence");

describe("GET /api/build-info", () => {
  it("surfaces pinned gate ids and remediation summary", async () => {
    const response = await GET(new Request("https://adsecute.com/api/build-info"));
    const payload = await response.json();

    expect(payload.buildId).toBe("build-1");
    expect(payload.controlPlaneIdentity).toEqual({
      buildId: "build-1",
      environment: "test",
      providerScope: "meta",
    });
    expect(payload.deployGate.id).toBe("dg-1");
    expect(payload.releaseGate.id).toBe("rg-1");
    expect(payload.repairPlan.id).toBe("rp-1");
    expect(payload.controlPlanePersistence).toMatchObject({
      exactRowsPresent: true,
      missingExact: [],
    });
    expect(payload.remediationSummary).toMatchObject({
      businessCount: 2,
      improvedAny: true,
      counts: {
        cleared: 1,
        improving_not_cleared: 1,
      },
    });
    expect(payload.controlPlaneErrors).toEqual({
      runtimeRegistry: null,
      syncGates: null,
      repairPlan: null,
      remediationSummary: null,
      controlPlanePersistence: null,
    });
  });

  it("supports provider-scoped control-plane truth without changing the default route behavior", async () => {
    vi.mocked(repairPlanner.getLatestSyncRepairPlan).mockImplementationOnce(
      async (input) => ({
        id: "rp-google",
        buildId: "build-1",
        environment: "production",
        providerScope: input?.providerScope ?? "meta",
        planMode: "dry_run",
        eligible: true,
        blockedReason: null,
        breakGlass: false,
        summary: "All clear",
        recommendations: [],
        emittedAt: "2026-04-15T12:00:00.000Z",
      }),
    );
    vi.mocked(controlPlanePersistence.getSyncControlPlanePersistenceStatus).mockImplementationOnce(
      async (input) => ({
        identity: {
          buildId: "build-1",
          environment: "production",
          providerScope: input?.providerScope ?? "meta",
        },
        exact: {
          deployGate: {
            id: "dg-1",
            buildId: "build-1",
            environment: "production",
            gateKind: "deploy_gate",
            verdict: "pass",
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
          releaseGate: {
            id: "rg-1",
            buildId: "build-1",
            environment: "production",
            gateKind: "release_gate",
            verdict: "pass",
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
          repairPlan: {
            id: "rp-google",
            buildId: "build-1",
            environment: "production",
            providerScope: input?.providerScope ?? "meta",
            eligible: true,
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
        },
        fallbackByBuild: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        latest: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        missingExact: [],
        exactRowsPresent: true,
      }),
    );

    const response = await GET(
      new Request("https://adsecute.com/api/build-info?providerScope=google_ads"),
    );
    const payload = await response.json();

    expect(payload.controlPlaneIdentity).toEqual({
      buildId: "build-1",
      environment: "test",
      providerScope: "google_ads",
    });
    expect(payload.repairPlan.providerScope).toBe("google_ads");
    expect(payload.controlPlanePersistence.identity.providerScope).toBe("google_ads");
  });

  it("self-heals a missing exact repair plan for google_ads when gates already exist", async () => {
    vi.mocked(repairPlanner.getLatestSyncRepairPlan).mockImplementationOnce(async () => null);
    vi.mocked(controlPlanePersistence.getSyncControlPlanePersistenceStatus)
      .mockImplementationOnce(async (input) => ({
        identity: {
          buildId: "build-1",
          environment: "production",
          providerScope: input?.providerScope ?? "meta",
        },
        exact: {
          deployGate: {
            id: "dg-1",
            buildId: "build-1",
            environment: "production",
            gateKind: "deploy_gate",
            verdict: "pass",
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
          releaseGate: {
            id: "rg-1",
            buildId: "build-1",
            environment: "production",
            gateKind: "release_gate",
            verdict: "pass",
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
          repairPlan: null,
        },
        fallbackByBuild: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        latest: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        missingExact: ["repairPlan"],
        exactRowsPresent: false,
      }))
      .mockImplementationOnce(async (input) => ({
        identity: {
          buildId: "build-1",
          environment: "production",
          providerScope: input?.providerScope ?? "meta",
        },
        exact: {
          deployGate: {
            id: "dg-1",
            buildId: "build-1",
            environment: "production",
            gateKind: "deploy_gate",
            verdict: "pass",
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
          releaseGate: {
            id: "rg-1",
            buildId: "build-1",
            environment: "production",
            gateKind: "release_gate",
            verdict: "pass",
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
          repairPlan: {
            id: "rp-healed",
            buildId: "build-1",
            environment: "production",
            providerScope: input?.providerScope ?? "meta",
            eligible: true,
            emittedAt: "2026-04-15T12:00:00.000Z",
          },
        },
        fallbackByBuild: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        latest: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        missingExact: [],
        exactRowsPresent: true,
      }));

    const response = await GET(
      new Request("https://adsecute.com/api/build-info?providerScope=google_ads"),
    );
    const payload = await response.json();

    expect(repairPlanner.evaluateAndPersistSyncRepairPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "build-1",
        environment: "test",
        providerScope: "google_ads",
        persist: true,
        releaseGate: expect.objectContaining({
          id: "rg-1",
        }),
      }),
    );
    expect(payload.repairPlan).toMatchObject({
      id: "rp-healed",
      providerScope: "google_ads",
    });
    expect(payload.controlPlanePersistence).toMatchObject({
      exactRowsPresent: true,
      missingExact: [],
    });
    expect(payload.controlPlaneErrors.repairPlan).toBeNull();
  });
});
