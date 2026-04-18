import { describe, expect, it } from "vitest";
import {
  compareKeyedParityRows,
  META_SHORT_GATE_PRIMARY_CANARY,
  META_SHORT_GATE_RELEASE_CANARIES,
  selectMetaCreativeGateBusiness,
} from "@/scripts/meta-parity-check";

describe("meta parity check", () => {
  it("detects exact row and field diffs with numeric tolerance", () => {
    const result = compareKeyedParityRows({
      surface: "campaigns",
      keyField: "id",
      currentRows: [
        { id: "cmp-1", spend: 10.005, status: "ACTIVE" },
        { id: "cmp-2", spend: 5, status: "PAUSED" },
      ],
      referenceRows: [
        { id: "cmp-1", spend: 10.0, status: "ACTIVE" },
        { id: "cmp-3", spend: 5, status: "PAUSED" },
      ],
    });

    expect(result.blockingDiffs).toEqual([
      {
        surface: "campaigns",
        kind: "missing_reference_row",
        key: "cmp-2",
        currentValue: { id: "cmp-2", spend: 5, status: "PAUSED" },
      },
      {
        surface: "campaigns",
        kind: "missing_current_row",
        key: "cmp-3",
        referenceValue: { id: "cmp-3", spend: 5, status: "PAUSED" },
      },
    ]);
  });

  it("falls back to the first release canary with non-zero creative rows", async () => {
    const result = await selectMetaCreativeGateBusiness({
      requestedBusinessId: META_SHORT_GATE_PRIMARY_CANARY.businessId,
      fetchPayload: async (businessId) => {
        if (businessId === META_SHORT_GATE_PRIMARY_CANARY.businessId) {
          return { status: "ok", rows: [] };
        }
        if (businessId === META_SHORT_GATE_RELEASE_CANARIES[1]?.businessId) {
          return { status: "ok", rows: [{ id: "creative-1" }] };
        }
        return { status: "ok", rows: [] };
      },
    });

    expect(result).toEqual({
      requestedBusinessId: META_SHORT_GATE_PRIMARY_CANARY.businessId,
      selectedBusinessId: META_SHORT_GATE_RELEASE_CANARIES[1]?.businessId,
      selectedBusinessLabel: META_SHORT_GATE_RELEASE_CANARIES[1]?.label,
      fallbackUsed: true,
      reason: "fallback_non_zero",
      attempts: [
        {
          label: "TheSwaf",
          businessId: META_SHORT_GATE_PRIMARY_CANARY.businessId,
          status: "ok",
          rowCount: 0,
        },
        {
          label: "Grandmix",
          businessId: META_SHORT_GATE_RELEASE_CANARIES[1]?.businessId ?? "",
          status: "ok",
          rowCount: 1,
        },
      ],
    });
  });
});
