# Agent Instructions

For Creative Decision Center / Creative page work, first read:

docs/creative-decision-center/START_HERE.md

Rules:

- Do not implement resolver changes before reading DECISION_LOG.md, DATA_READINESS.md, GOLDEN_CASES.md, and INVARIANTS.md.
- Do not create a new standalone decision core unless DECISION_LOG.md is updated with a new ADR.
- Do not add row-level brief_variation.
- Do not let UI compute buyerAction.
- Do not emit high-confidence decisions when required data is missing.
- Do not delete V1/operator/V2 snapshot compatibility without a migration plan.
- Do not rename routes in the first migration PR.
- Prefer small PRs with explicit rollback.
