import { describe, expect, it } from "vitest";
import {
  chooseDeterministicBenchmarkBusiness,
  compareNormalizationArtifacts,
  parsePhase,
  buildNormalizationRunDir,
} from "@/scripts/db-normalization-support";

describe("db normalization support", () => {
  it("chooses the deterministic benchmark business from provider winners", () => {
    const chosen = chooseDeterministicBenchmarkBusiness([
      { provider: "meta", businessId: "biz-a", rowCount: 10 },
      { provider: "google", businessId: "biz-a", rowCount: 6 },
      { provider: "shopify", businessId: "biz-b", rowCount: 20 },
      { provider: "meta", businessId: "biz-c", rowCount: 30 },
    ]);

    expect(chosen?.businessId).toBe("biz-a");
    expect(chosen?.providerCount).toBe(2);
    expect(chosen?.totalRowCount).toBe(16);
  });

  it("falls back to lexicographic ordering on ties", () => {
    const chosen = chooseDeterministicBenchmarkBusiness([
      { provider: "meta", businessId: "biz-b", rowCount: 10 },
      { provider: "google", businessId: "biz-b", rowCount: 10 },
      { provider: "meta", businessId: "biz-a", rowCount: 10 },
      { provider: "google", businessId: "biz-a", rowCount: 10 },
    ]);

    expect(chosen?.businessId).toBe("biz-a");
  });

  it("builds a stable run directory when one is not provided", () => {
    const dir = buildNormalizationRunDir({
      at: new Date("2026-04-17T00:00:00.000Z"),
    });

    expect(dir).toContain("docs/benchmarks/db-normalization/2026-04-17T00-00-00-000Z");
  });

  it("defaults the phase to before", () => {
    expect(parsePhase(null)).toBe("before");
    expect(parsePhase("after")).toBe("after");
  });

  it("compares captures and reports benchmark deltas", () => {
    const before = {
      phase: "before",
      capturedAt: "2026-04-17T00:00:00.000Z",
      runDir: "/tmp/run",
      artifactDir: "/tmp/run/before",
      baselineSql: { path: "docs/architecture/live-db-baseline-checks.sql", sha256: "a", sizeBytes: 1 },
      hostMemory: {
        platform: "linux",
        source: "os_fallback",
        totalBytes: 100,
        availableBytes: 40,
        freeBytes: 25,
        swapTotalBytes: null,
        swapFreeBytes: null,
        details: {},
      },
      postgresConfig: { serverVersion: "1", settings: {} },
      dbSize: {
        databaseBytes: 100,
        tableBytes: 60,
        indexBytes: 40,
        relationCount: 2,
        byTable: [
          { schemaName: "public", tableName: "a", family: "core", approxRows: 10, tableBytes: 10, indexBytes: 5, totalBytes: 15 },
        ],
        byFamily: [
          { family: "core", tableCount: 1, approxRows: 10, tableBytes: 10, indexBytes: 5, totalBytes: 15 },
        ],
      },
      dbRuntime: { sampledAt: "2026-04-17T00:00:00.000Z" },
      storage: {
        relationSizes: [],
        indexSizes: [],
        activitySummary: [],
        longTransactions: [],
        blockedLocks: [],
        pgStatStatements: { enabled: false, error: null, topStatements: [] },
      },
      baselineChecks: {
        file: { path: "docs/architecture/live-db-baseline-checks.sql", sha256: "a", sizeBytes: 1 },
        tableCoverage: { rows: [], familyCounts: [] },
        duplicateNaturalKeys: [{ table_name: "integrations", row_count: 1 }],
        nullAnomalies: [{ table_name: "integrations", null_rows: 0 }],
        coverageGaps: [],
        projectionParity: [],
        providerSanityAggregates: [],
      },
      readBenchmark: {
        selectedBusinessId: "biz-a",
        selectionMode: "explicit",
        selectionEvidence: {},
        capturedAt: "2026-04-17T00:00:00.000Z",
        scenarios: [
          {
            name: "overview_data_no_trends_30d",
            iterations: 1,
            averageMs: 10,
            minMs: 10,
            maxMs: 10,
            p50Ms: 10,
            p95Ms: 10,
            sampleCardinality: 1,
            validityNote: "valid",
            sourceKey: "a",
          },
        ],
      },
      writeBenchmark: {
        selectedBusinessId: "biz-a",
        selectionMode: "benchmark_business",
        selectionEvidence: {},
        capturedAt: "2026-04-17T00:00:00.000Z",
        scenarios: [
          {
            name: "core_write_cycle",
            iterations: 1,
            averageMs: 20,
            minMs: 20,
            maxMs: 20,
            p50Ms: 20,
            p95Ms: 20,
            sampleCardinality: 1,
            validityNote: "valid",
            sourceKey: "core_cycle",
          },
        ],
      },
    } as any;
    const after = {
      ...before,
      capturedAt: "2026-04-17T00:05:00.000Z",
      dbSize: {
        ...before.dbSize,
        databaseBytes: 80,
        tableBytes: 50,
        indexBytes: 30,
      },
      readBenchmark: {
        ...before.readBenchmark,
        scenarios: [
          {
            ...before.readBenchmark.scenarios[0],
            averageMs: 8,
            minMs: 8,
            maxMs: 8,
            p50Ms: 8,
            p95Ms: 8,
          },
        ],
      },
      writeBenchmark: {
        ...before.writeBenchmark,
        scenarios: [
          {
            ...before.writeBenchmark.scenarios[0],
            averageMs: 16,
            minMs: 16,
            maxMs: 16,
            p50Ms: 16,
            p95Ms: 16,
          },
        ],
      },
    } as any;

    const comparison = compareNormalizationArtifacts(before, after);
    expect(comparison.dbSize.databaseBytes.delta).toBe(-20);
    expect(comparison.benchmarks.read[0]?.delta?.averageMs).toBe(-2);
    expect(comparison.benchmarks.write?.[0]?.delta?.averageMs).toBe(-4);
  });
});

