# Creative Decision Center V2.1 Context Pack

This is the first file future GPT/Codex/Claude chats should read before working on the Adsecute / OmniAds Creative page migration.

## Summary

Adsecute's Creative page should become a media buyer decision center, not a metrics dashboard. The core user question is:

> What should I do, why, and with how much confidence?

Current conclusion: evolve existing `creative-decision-os-v2` into V2.1. Do not create a new standalone decision core unless `DECISION_LOG.md` is updated with a new ADR and repo evidence proves V2 cannot be safely extended.

## Required Read Order

1. [CONTEXT_SNAPSHOT.md](./CONTEXT_SNAPSHOT.md)
2. [DECISION_LOG.md](./DECISION_LOG.md)
3. [ARCHITECTURE.md](./ARCHITECTURE.md)
4. [VOCABULARY_MAPPING.md](./VOCABULARY_MAPPING.md)
5. [DATA_READINESS.md](./DATA_READINESS.md)
6. [GOLDEN_CASES.md](./GOLDEN_CASES.md)
7. [INVARIANTS.md](./INVARIANTS.md)
8. [CONTRACTS.md](./CONTRACTS.md)
9. [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)
10. [PR_SEQUENCE.md](./PR_SEQUENCE.md)
11. [RISK_REGISTER.md](./RISK_REGISTER.md)
12. [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)

**Before implementing resolver changes, read DECISION_LOG.md, DATA_READINESS.md, GOLDEN_CASES.md, and INVARIANTS.md.**

## Non-Negotiables

- Do not create a new standalone decision core by default.
- Keep engine `primaryDecision` separate from `buyerAction`.
- UI must render `decisionCenter`; UI must not compute `buyerAction`.
- `brief_variation` is never a row-level buyer action.
- Missing data means `diagnose_data` or capped confidence, not fake certainty.
- Existing V1/operator snapshots must remain renderable through backward-compatible adapters.
- Do not rename routes in the first migration PR.
- Do not delete V1, V2, operator-policy, operator-surface, old snapshots, or existing consumers early.

## Known Blockers

- V2 input likely lacks `ctr`, `cpm`, `frequency`, `firstSeenAt`, `firstSpendAt`, `reviewStatus`, `disapprovalReason`, `limitedReason`, and `spend24h`.
- `fix_delivery`, `fix_policy`, `watch_launch`, and reliable fatigue decisions require data enrichment before confident emission.
- `creative-operator-policy` and `creative-operator-surface` are first-class decision/vocabulary layers, not simple helpers.
- Live before/after shadow and historical backtest are not completed in this context pack.

## Next Recommended PR

PR 2: golden fixtures + invariant tests, or PR 1 completion if the owner wants the repo audit/mapping expanded first. Do not start resolver behavior changes before data readiness and invariants are locked.

## Files

- [CONTEXT_SNAPSHOT.md](./CONTEXT_SNAPSHOT.md)
- [DECISION_LOG.md](./DECISION_LOG.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [VOCABULARY_MAPPING.md](./VOCABULARY_MAPPING.md)
- [DATA_READINESS.md](./DATA_READINESS.md)
- [BEFORE_AFTER_SHADOW_REPORT.md](./BEFORE_AFTER_SHADOW_REPORT.md)
- [GOLDEN_CASES.md](./GOLDEN_CASES.md)
- [INVARIANTS.md](./INVARIANTS.md)
- [CONTRACTS.md](./CONTRACTS.md)
- [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)
- [PR_SEQUENCE.md](./PR_SEQUENCE.md)
- [RISK_REGISTER.md](./RISK_REGISTER.md)
- [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)
- [PROMPTS.md](./PROMPTS.md)
- [GLOSSARY.md](./GLOSSARY.md)
- [NEXT_CHAT_PROMPT.md](./NEXT_CHAT_PROMPT.md)
- [CONTEXT_MANIFEST.json](./CONTEXT_MANIFEST.json)

