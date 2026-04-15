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

describe("GET /api/build-info", () => {
  it("surfaces pinned gate ids and remediation summary", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(payload.buildId).toBe("build-1");
    expect(payload.deployGate.id).toBe("dg-1");
    expect(payload.releaseGate.id).toBe("rg-1");
    expect(payload.repairPlan.id).toBe("rp-1");
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
    });
  });
});
