import { describe, expect, it } from "vitest";
import {
  buildAuditSummary,
  isExpectedNullProviderAccountRef,
} from "@/scripts/db-normalization-audit";

describe("db normalization audit", () => {
  it("treats the search_console not selected row as expected after legacy removal", () => {
    expect(
      isExpectedNullProviderAccountRef({
        legacyPhase: "removed",
        tableName: "provider_connections",
        refColumn: "provider_account_ref_id",
        provider: "search_console",
        providerAccountId: null,
        providerAccountName: "Not selected",
        businessRefId: "biz-1",
      }),
    ).toBe(true);
  });

  it("does not broaden the expected-null rule", () => {
    expect(
      isExpectedNullProviderAccountRef({
        legacyPhase: "compat_retained",
        tableName: "provider_connections",
        refColumn: "provider_account_ref_id",
        provider: "search_console",
        providerAccountId: null,
        providerAccountName: "Not selected",
        businessRefId: "biz-1",
      }),
    ).toBe(false);
    expect(
      isExpectedNullProviderAccountRef({
        legacyPhase: "removed",
        tableName: "provider_connections",
        refColumn: "provider_account_ref_id",
        provider: "search_console",
        providerAccountId: "acct-1",
        providerAccountName: "Not selected",
        businessRefId: "biz-1",
      }),
    ).toBe(false);
    expect(
      isExpectedNullProviderAccountRef({
        legacyPhase: "removed",
        tableName: "provider_connections",
        refColumn: "provider_account_ref_id",
        provider: "ga4",
        providerAccountId: null,
        providerAccountName: "Not selected",
        businessRefId: "biz-1",
      }),
    ).toBe(false);
  });

  it("counts expected null refs separately from blocking gaps", () => {
    const summary = buildAuditSummary({
      refCoverage: [
        {
          tableName: "provider_connections",
          refColumn: "provider_account_ref_id",
          totalRows: 1,
          nullRefRows: 1,
          populatedRefRows: 0,
          expectedNullRefRows: 1,
          blockingNullRefRows: 0,
        },
        {
          tableName: "meta_sync_runs",
          refColumn: "provider_account_ref_id",
          totalRows: 3,
          nullRefRows: 1,
          populatedRefRows: 2,
          expectedNullRefRows: 0,
          blockingNullRefRows: 1,
        },
      ],
      expectedNullRefs: [
        {
          tableName: "provider_connections",
          refColumn: "provider_account_ref_id",
          rowCount: 1,
          reason: "search_console_not_selected",
        },
      ],
      coreLegacyState: {
        legacyPhase: "removed",
        tables: [
          { tableName: "integrations", exists: false, rows: null },
          {
            tableName: "provider_account_assignments",
            exists: false,
            rows: null,
          },
          {
            tableName: "provider_account_snapshots",
            exists: false,
            rows: null,
          },
        ],
        providerConnectionsRows: 1,
        businessProviderAccountsRows: 1,
        snapshotRunsRows: 1,
        snapshotItemsRows: 1,
      },
    });

    expect(summary.tablesWithRefGaps).toBe(1);
    expect(summary.tablesWithBlockingRefGaps).toBe(1);
    expect(summary.providerRefGapTables).toBe(1);
    expect(summary.expectedNullRefTables).toBe(1);
    expect(summary.expectedNullRefRows).toBe(1);
  });
});
