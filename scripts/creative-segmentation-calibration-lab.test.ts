import { describe, expect, it } from "vitest";
import {
  classifyZeroRowSourceHealth,
  collapseCandidateRowsByBusiness,
  createEmptyCoverageSummary,
  recordCoverage,
  resolveCandidateSkipReason,
  summarizeCandidateEligibility,
  type SourceBusinessRow,
} from "./creative-segmentation-calibration-lab";

function candidate(overrides: Partial<SourceBusinessRow>): SourceBusinessRow {
  return {
    business_id: "business",
    max_end_date: "2026-04-22",
    max_row_count: 1,
    latest_synced_at: "2026-04-23T00:00:00.000Z",
    connection_status: "connected",
    has_access_token: true,
    assigned_account_count: 1,
    ...overrides,
  };
}

describe("creative segmentation calibration lab helpers", () => {
  it("skips historical snapshot businesses that are not currently Meta eligible", () => {
    expect(resolveCandidateSkipReason(candidate({ connection_status: null }))).toBe(
      "no_current_meta_connection",
    );
    expect(resolveCandidateSkipReason(candidate({ connection_status: "disconnected" }))).toBe(
      "meta_connection_not_connected",
    );
    expect(resolveCandidateSkipReason(candidate({ has_access_token: false }))).toBe(
      "no_access_token",
    );
    expect(resolveCandidateSkipReason(candidate({ assigned_account_count: 0 }))).toBe(
      "no_accounts_assigned",
    );
    expect(resolveCandidateSkipReason(candidate({}))).toBeNull();
  });

  it("summarizes eligible and skipped candidates without exposing raw ids", () => {
    const summary = summarizeCandidateEligibility([
      candidate({ business_id: "raw-business-1" }),
      candidate({ business_id: "raw-business-2", connection_status: null }),
      candidate({ business_id: "raw-business-3", assigned_account_count: 0 }),
    ]);

    expect(summary.eligible).toHaveLength(1);
    expect(summary.skippedCandidates).toBe(2);
    expect(summary.skippedCandidatesByReason.no_current_meta_connection).toBe(1);
    expect(summary.skippedCandidatesByReason.no_accounts_assigned).toBe(1);
  });

  it("collapses duplicate provider rows to one eligible business candidate", () => {
    const summary = summarizeCandidateEligibility([
      candidate({
        business_id: "raw-business-1",
        connection_status: "disconnected",
        has_access_token: false,
        assigned_account_count: 1,
      }),
      candidate({
        business_id: "raw-business-1",
        connection_status: "connected",
        has_access_token: true,
        assigned_account_count: 1,
        max_row_count: 9,
      }),
    ]);

    expect(summary.uniqueCandidateBusinesses).toBe(1);
    expect(summary.dedupedDuplicateRows).toBe(1);
    expect(summary.eligible).toHaveLength(1);
    expect(summary.skippedCandidates).toBe(0);
  });

  it("collapses duplicate credential rows and keeps the token-bearing candidate", () => {
    const collapsed = collapseCandidateRowsByBusiness([
      candidate({
        business_id: "raw-business-1",
        has_access_token: false,
        max_row_count: 8,
      }),
      candidate({
        business_id: "raw-business-1",
        has_access_token: true,
        max_row_count: 8,
        latest_synced_at: "2026-04-23T01:00:00.000Z",
      }),
    ]);

    expect(collapsed.duplicateRows).toBe(1);
    expect(collapsed.candidates).toHaveLength(1);
    expect(collapsed.candidates[0]?.has_access_token).toBe(true);
  });

  it("counts the same business once even under multiplicative duplicate rows", () => {
    const summary = summarizeCandidateEligibility([
      candidate({ business_id: "raw-business-1", max_row_count: 3 }),
      candidate({ business_id: "raw-business-1", max_row_count: 4 }),
      candidate({ business_id: "raw-business-1", max_row_count: 5 }),
      candidate({ business_id: "raw-business-1", max_row_count: 6 }),
      candidate({ business_id: "raw-business-2", assigned_account_count: 0 }),
    ]);

    expect(summary.uniqueCandidateBusinesses).toBe(2);
    expect(summary.dedupedDuplicateRows).toBe(3);
    expect(summary.eligible).toHaveLength(1);
    expect(summary.skippedCandidates).toBe(1);
  });

  it("classifies zero-row cases with spend-bearing live rows as source mapping bugs", () => {
    const diagnosis = classifyZeroRowSourceHealth({
      decisionOsRows: 0,
      tableRows: 0,
      sourceStatus: "no_data",
      liveInsightsProbe: {
        assignedAccountCount: 2,
        accountsAttempted: 2,
        accountsSucceeded: 2,
        accountsWithInsights: 1,
        accountFetchFailures: 0,
        totalInsightRows: 3,
        spendBearingInsightRows: 2,
        failureStatusCounts: {},
        metaErrorCounts: {},
      },
    });

    expect(diagnosis.zeroRowClassification).toBe("source_mapping_bug");
    expect(diagnosis.blocksCalibration).toBe(true);
  });

  it("classifies zero-row cases with no spend-bearing activity as non-blocking inactivity", () => {
    const diagnosis = classifyZeroRowSourceHealth({
      decisionOsRows: 0,
      tableRows: 0,
      sourceStatus: "no_data",
      liveInsightsProbe: {
        assignedAccountCount: 1,
        accountsAttempted: 1,
        accountsSucceeded: 1,
        accountsWithInsights: 1,
        accountFetchFailures: 0,
        totalInsightRows: 2,
        spendBearingInsightRows: 0,
        failureStatusCounts: {},
        metaErrorCounts: {},
      },
    });

    expect(diagnosis.zeroRowClassification).toBe("no_current_creative_activity");
    expect(diagnosis.blocksCalibration).toBe(false);
  });

  it("classifies eligibility short-circuit statuses as connection or account mismatches", () => {
    const diagnosis = classifyZeroRowSourceHealth({
      decisionOsRows: 0,
      tableRows: 0,
      sourceStatus: "no_access_token",
      liveInsightsProbe: null,
    });

    expect(diagnosis.zeroRowClassification).toBe("connection_or_account_mismatch");
    expect(diagnosis.blocksCalibration).toBe(true);
  });

  it("keeps internal segment coverage separate from quick-filter coverage", () => {
    const coverage = createEmptyCoverageSummary();

    recordCoverage({
      coverage,
      internalSegment: "contextual_only",
      quickFilter: "needs_truth",
      userFacingSegment: "Not eligible for evaluation",
      oldRuleSegment: "watch",
      baselineReliability: "strong",
      pushReadiness: "blocked_from_push",
    });

    expect(coverage.internalSegments).toEqual({ contextual_only: 1 });
    expect(coverage.quickFilters).toEqual({ needs_truth: 1 });
    expect(coverage.userFacingSegments).toEqual({ "Not eligible for evaluation": 1 });
    expect(coverage.oldRuleSegments).toEqual({ watch: 1 });
    expect(coverage.baselineReliability).toEqual({ strong: 1 });
    expect(coverage.pushReadiness).toEqual({ blocked_from_push: 1 });
  });
});
