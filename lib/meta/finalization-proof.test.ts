import { describe, expect, it } from "vitest";
import { createMetaFinalizationCompletenessProof } from "@/lib/meta/finalization-proof";

describe("meta finalization proof", () => {
  it("rejects missing source run id for passed proofs", () => {
    expect(() =>
      createMetaFinalizationCompletenessProof({
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-07",
        scope: "account",
        sourceRunId: null,
        complete: true,
        validationStatus: "passed",
      }),
    ).toThrowError("meta_finalization_proof_missing_source_run_id");
  });
});
