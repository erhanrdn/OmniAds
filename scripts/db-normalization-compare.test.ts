import { describe, expect, it } from "vitest";
import {
  classifyExpectedBaselineTransitions,
  filterBlockingBaselineDiffs,
} from "@/scripts/db-normalization-compare";

describe("db normalization compare", () => {
  it("suppresses only retired legacy table missing-relation transitions after removal", () => {
    const baselineDiffs = [
      {
        index: 3,
        beforeRowCount: 10,
        afterRowCount: null,
        rowCountDelta: null,
        beforeError: null,
        afterError: 'relation "integrations" does not exist',
        errorChanged: true,
      },
      {
        index: 4,
        beforeRowCount: 10,
        afterRowCount: null,
        rowCountDelta: null,
        beforeError: null,
        afterError: 'relation "provider_account_assignments" does not exist',
        errorChanged: true,
      },
      {
        index: 5,
        beforeRowCount: 10,
        afterRowCount: null,
        rowCountDelta: null,
        beforeError: null,
        afterError: 'relation "provider_account_snapshots" does not exist',
        errorChanged: true,
      },
      {
        index: 6,
        beforeRowCount: 10,
        afterRowCount: null,
        rowCountDelta: null,
        beforeError: null,
        afterError: 'relation "totally_unexpected" does not exist',
        errorChanged: true,
      },
    ];

    const expectedTransitions = classifyExpectedBaselineTransitions({
      baselineDiffs,
      afterLegacyPhase: "removed",
    });
    const blockingDiffs = filterBlockingBaselineDiffs({
      baselineDiffs,
      expectedBaselineTransitions: expectedTransitions,
    });

    expect(expectedTransitions.map((row) => row.tableName)).toEqual([
      "integrations",
      "provider_account_assignments",
      "provider_account_snapshots",
    ]);
    expect(blockingDiffs).toHaveLength(1);
    expect(blockingDiffs[0]?.index).toBe(6);
  });

  it("does not suppress legacy-table missing relations before removal", () => {
    const baselineDiffs = [
      {
        index: 3,
        beforeRowCount: 10,
        afterRowCount: null,
        rowCountDelta: null,
        beforeError: null,
        afterError: 'relation "integrations" does not exist',
        errorChanged: true,
      },
    ];

    const expectedTransitions = classifyExpectedBaselineTransitions({
      baselineDiffs,
      afterLegacyPhase: "compat_retained",
    });
    const blockingDiffs = filterBlockingBaselineDiffs({
      baselineDiffs,
      expectedBaselineTransitions: expectedTransitions,
    });

    expect(expectedTransitions).toHaveLength(0);
    expect(blockingDiffs).toHaveLength(1);
  });
});
