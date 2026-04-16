# Meta Cleanup Inventory - 2026-04-16

This document captures the first cleanup pass after Meta release-ready closure.

## Current Production State

Observed from `https://adsecute.com/api/build-info` on 2026-04-16:

| Field | Value |
| --- | --- |
| `buildId` | `bbda7830668d75bb0cf64d6969ad64c98224cbc5` |
| `deployGate` | `pass` |
| `releaseGate` | `pass` |
| `controlPlanePersistence.exactRowsPresent` | `true` |
| `repairPlan.recommendations.length` | `0` |
| `remediationSummary` | `null` |

Interpretation:

- Meta is release-ready.
- No repair action is currently recommended.
- `remediationSummary=null` is acceptable here because there is no active remediation run on the current clean build.

## Keep

These changes closed real production incidents or encode durable domain rules. They should remain.

| Commit | Status | Reason |
| --- | --- | --- |
| `eb58279` | Keep | Runtime contract and gate truth foundation. |
| `7ea7eca` | Keep | Hard split between `deployGate` and `releaseGate`; this is now the core control-plane semantic boundary. |
| `45eb064` | Keep | Manual remediation runner, pinned rows, execution audit store. |
| `4b483ab` | Keep | Current-build control-plane persistence verification. |
| `9f54f3b`, `057dbca`, `56b6d1e`, `0bdb9fc`, `b5fec55`, `2e295e9`, `930f3b8` | Keep | Deploy/control-plane reliability fixes. These removed actual rollout failures and false blockers. |
| `099a2f6` | Keep | Proof-mode remediation semantics. Required to separate audit proof from full clearance. |
| `0414761` | Keep | Bounded after-evidence polling. Prevents false `manual_follow_up_required` outcomes. |
| `02f7ea2` | Keep | Queued work counts as progress. Prevents false negative remediation outcomes while work is actively draining. |
| `8035dda` | Keep | Continue consuming while forward progress exists. Prevents single-pass false stalls. |
| `59eb3d0` | Keep | Skip already-cleared canaries during proof runs. Prevents stale pin failures after partial recovery. |
| `c34df4f` | Keep | Exact readiness matrix capture. This was required to locate the recent-window boundary defect. |
| `462edfd`, `32e8068` | Keep | Multi-account-aware remediation budget. This is a durable domain rule, not emergency tuning. |
| `bbda783` | Keep | Regression test that locks multi-account remediation budget behavior. |

## Simplify

These are valid behaviors, but the implementation can be reduced to fewer knobs or fewer overlapping emergency-era concepts.

| Area | Current state | Simplification target |
| --- | --- | --- |
| Multi-account remediation budget | Budget currently derives from four constants in `lib/sync/meta-canary-remediation.ts`: base passes, base duration, per-account extra duration, max duration cap, plus action timeout buffer. | Collapse the budget logic into one explicit helper contract and one small set of documented invariants. Keep account-aware scaling, reduce ad hoc tuning language. |
| Remediation consume loop tuning | Pass count and duration caps both exist because they protect different failure modes. | Keep both protections, but document them as one "bounded drain" primitive rather than incident-era patches. |
| Proof-mode output | Proof-mode and clearance-mode are both necessary. | Keep both modes, but document proof-mode as the default operational path and avoid adding more mode variants. |
| Deploy persistence verification | Writer route, local verification, and public verification now all exist for good reason. | Keep the layered checks, but avoid adding more fallback writers. The writer path must stay singular. |

## Remove Later

No immediate removals are recommended today.

Reason:

- Most of the "wrong layer" fixes from the incident period have already been superseded by general primitives rather than remaining as live TheSwaf-specific branches.
- Reverting old incident fixes without a replacement simplification would re-open the exact classes of failure that were already observed in production.

## Historical Incident Patches That Should Not Be Recreated As Separate Knobs

These commits describe incident-era tuning steps. The lesson should remain, but the repository should not drift back toward business-specific overrides.

| Commit | Historical lesson | Cleanup stance |
| --- | --- | --- |
| `da977eb` | Single business needed more remediation budget than the default. | Do not restore as business-specific tuning. The account-aware budget model replaces this. |
| `0f14302` | Authoritative drain window was too short for canaries under active work. | Keep the lesson, but do not bring back canary-specific drain windows if the generalized budget already covers the case. |
| `5b27a9d` | Unbounded consume duration was dangerous. | Keep the bounded duration concept, but only as part of the consolidated budget model. |

## Active Invariants To Protect

- A business may legitimately have multiple Meta ad accounts. This must not degrade remediation, truth, or gate classification.
- `queueDepth > 0` with `activityState=busy` and `truthReady=true` is not a blocker by itself.
- `releaseGate=pass` must remain possible while background drain work is still active.
- Proof remediation must not fail simply because some selected canaries are already clean.
- Deploy success must not depend on `releaseGate=measure_only`, but it must depend on exact current-build control-plane persistence.

## Regression Coverage That Must Stay

- `lib/sync/meta-canary-remediation.test.ts`
  - proof vs clearance mode behavior
  - bounded after-evidence behavior
  - skip-cleared-canaries behavior
  - multi-account remediation budget behavior
- `lib/sync/release-gates.test.ts`
  - deploy vs release semantic split
- `lib/sync/repair-planner.test.ts`
  - planner recommendation behavior
- deploy workflow verification
  - current-build control-plane persistence
  - worker stop before migrations to avoid DB contention

## Next Cleanup Order

1. Consolidate the multi-account remediation budget into a documented helper contract without changing behavior.
2. Audit `lib/sync/meta-canary-remediation.ts` for remaining incident-era naming and comments that imply single-account or single-canary assumptions.
3. Add one regression test for "queue exists but release gate still passes" so the current closure state is locked in.
4. Watch 2-3 normal deploy cycles without adding new remediation knobs.
5. Reuse the same control model for Google only after Meta stays stable through those cycles.
