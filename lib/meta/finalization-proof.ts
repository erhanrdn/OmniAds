const META_FINALIZATION_PROOF_BRAND: unique symbol = Symbol("meta_finalization_proof");

type MetaFinalizationScope =
  | "account"
  | "campaign"
  | "adset"
  | "ad"
  | "breakdown";

export type MetaFinalizationCompletenessProof = Readonly<{
  businessId: string;
  providerAccountId: string;
  date: string;
  scope: MetaFinalizationScope;
  complete: true;
  validationStatus: "passed";
  sourceRunId: string | null;
  [META_FINALIZATION_PROOF_BRAND]: true;
}>;

export function createMetaFinalizationCompletenessProof(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  scope: MetaFinalizationScope;
  sourceRunId?: string | null;
  complete: boolean;
  validationStatus: "passed" | "failed" | "pending";
}) {
  if (!input.complete || input.validationStatus !== "passed") {
    throw new Error("meta_finalization_proof_incomplete");
  }
  const sourceRunId = String(input.sourceRunId ?? "").trim();
  if (!sourceRunId) {
    throw new Error("meta_finalization_proof_missing_source_run_id");
  }
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    scope: input.scope,
    complete: true,
    validationStatus: "passed",
    sourceRunId,
    [META_FINALIZATION_PROOF_BRAND]: true,
  } satisfies MetaFinalizationCompletenessProof;
}

export function assertMetaFinalizationCompletenessProof(
  proof: MetaFinalizationCompletenessProof,
  expected: {
    businessId: string;
    providerAccountId: string;
    date: string;
    scope: MetaFinalizationScope;
  },
) {
  if (
    !proof ||
    proof[META_FINALIZATION_PROOF_BRAND] !== true ||
    proof.complete !== true ||
    proof.validationStatus !== "passed" ||
    proof.businessId !== expected.businessId ||
    proof.providerAccountId !== expected.providerAccountId ||
    proof.date !== expected.date ||
    proof.scope !== expected.scope
  ) {
    throw new Error("meta_finalization_proof_invalid");
  }
}
