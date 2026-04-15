import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("runtime contract", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/adsecute_prod";
    delete process.env.SYNC_WORKER_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("marks production contract invalid when critical sync posture is implicit", async () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    delete process.env.META_AUTHORITATIVE_FINALIZATION_V2;
    delete process.env.META_RETENTION_EXECUTION_ENABLED;
    delete process.env.SYNC_DEPLOY_GATE_MODE;
    delete process.env.SYNC_RELEASE_GATE_MODE;
    delete process.env.SYNC_RELEASE_CANARY_BUSINESSES;

    const { buildRuntimeContract } = await import("@/lib/sync/runtime-contract");
    const contract = buildRuntimeContract({ service: "web" });

    expect(contract.validation.pass).toBe(false);
    expect(contract.validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "meta_finalization_implicit",
        "meta_retention_implicit",
        "deploy_gate_mode_implicit",
        "release_gate_mode_implicit",
        "release_canary_unconfigured",
      ]),
    );
  });

  it("accepts production contract when explicit posture and canaries are present", async () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    process.env.META_AUTHORITATIVE_FINALIZATION_V2 = "1";
    process.env.META_RETENTION_EXECUTION_ENABLED = "0";
    process.env.SYNC_DEPLOY_GATE_MODE = "block";
    process.env.SYNC_RELEASE_GATE_MODE = "measure_only";
    process.env.SYNC_RELEASE_CANARY_BUSINESSES =
      "172d0ab8-495b-4679-a4c6-ffa404c389d3,5dbc7147-f051-4681-a4d6-20617170074f";

    const { buildRuntimeContract } = await import("@/lib/sync/runtime-contract");
    const contract = buildRuntimeContract({ service: "web" });

    expect(contract.validation.pass).toBe(true);
    expect(contract.config.releaseCanaryConfigured).toBe(true);
    expect(contract.config.releaseCanaryHasMandatoryCanary).toBe(true);
    expect(contract.config.deployGateMode).toBe("block");
    expect(contract.config.releaseGateMode).toBe("measure_only");
  });

  it("throws on invalid production startup contract", async () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    delete process.env.META_AUTHORITATIVE_FINALIZATION_V2;
    process.env.META_RETENTION_EXECUTION_ENABLED = "0";
    process.env.SYNC_DEPLOY_GATE_MODE = "block";
    process.env.SYNC_RELEASE_GATE_MODE = "measure_only";

    const { assertRuntimeContractStartup } = await import("@/lib/sync/runtime-contract");

    expect(() => assertRuntimeContractStartup({ service: "web" })).toThrow(
      /Runtime contract invalid/,
    );
  });
});
