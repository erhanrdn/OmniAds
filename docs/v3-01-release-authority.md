# V3-01 Release Authority

This document is generated from `lib/release-authority/*`. Do not hand-edit it.

Current accepted authority contract for this layer:

- runtime live SHA source: `https://adsecute.com/api/build-info`
- runtime release authority source: `https://adsecute.com/api/release-authority`
- repository authority: `erhanrdn/OmniAds` `main`
- canonical doc path: `docs/v3-01-release-authority.md`
- rollback target before the next release: `6fc971574946f65f4c7217eb4a51b6e8ed66fefb`

## Literal parity

- build info URL must expose the same live SHA that `/api/release-authority` reports at runtime.
- `/api/release-authority` must expose the current remote `main` SHA.
- The rollback target in this doc must match the rollback target in `/api/release-authority`.
- The surface matrix below must stay literal with the release-authority inventory.

## Feature Matrix

| Surface | Runtime posture | Docs posture | Flag posture | Notes |
| --- | --- | --- | --- | --- |
| `Operating Mode` | `live` | `current` | n/a | Deterministic commercial-truth overlay remains live. No feature flag gates the current operating mode surface. |
| `Recommendations` | `live` | `current` | n/a | Recommendations remain operator-visible and deterministic. Decision OS supplements this surface but does not rename it. |
| `Meta Decision OS` | `live` | `current` | enabled: META_DECISION_OS_V1, META_DECISION_OS_CANARY_BUSINESSES | Current runtime posture is derived from the existing Meta Decision OS config helpers. Allowlist posture remains visible without exposing business IDs. GEO V2 uses dedicated country-only serving so GEO rows can stay live even when broader breakdown surfaces are partial. Meta Strategy Engine V2 adds additive policy metadata and a read-only winner scale candidate board without changing the execution subset. |
| `Creative Decision OS` | `live` | `current` | enabled: CREATIVE_DECISION_OS_V1, CREATIVE_DECISION_OS_CANARY_BUSINESSES | Creative Decision OS stays deterministic and read-only. The current baseline opens the surface in a dedicated resizable drawer instead of a long inline page section. Additive economics floors, deployment compatibility, protected winners, and supply planning are current when the surface is enabled. A separate selected-period historical analysis panel is additive and analysis-only; it does not change Decision Signals or live decision authority. The surface is current only when the Creative Decision OS flag posture permits it. |
| `Decision Signals` | `live` | `current` | n/a | Decision Signals remain the compatibility surface for deterministic creative actions. This phase does not change wording or action semantics. |
| `AI Commentary` | `live` | `current` | n/a | AI commentary remains bounded interpretation only. This authority layer only inventories the surface; it does not change provenance rules. |
| `Command Center Workflow` | `live` | `current` | enabled: COMMAND_CENTER_V1, COMMAND_CENTER_CANARY_BUSINESSES | Workflow state remains additive on top of deterministic decision sources. Current posture is resolved from the Command Center config helpers. Meta GEO intake only queues material queue-eligible GEO rows; pooled/watchlist GEOs stay out of the default queue. The default queue is bounded server-side and exposes overflow, owner workload, and shift digest summaries. Structured feedback and status-only batch actions are current workflow surfaces and remain retry-safe. A separate historical intelligence panel now summarizes selected-period campaign families, queue quality, degraded guidance, and deterministic calibration suggestions. |
| `Command Center Execution Preview` | `live` | `current` | enabled: COMMAND_CENTER_EXECUTION_V1 | Preview-first execution posture is tracked separately from apply/rollback authority. This surface is operator-visible only when the execution preview flag is enabled. The current preview baseline exposes an explicit per-family support matrix and rollback-truth copy without widening provider-backed scope. |
| `Command Center Apply & Rollback` | `flagged` | `current` | disabled: COMMAND_CENTER_EXECUTION_V1, META_EXECUTION_APPLY_ENABLED, META_EXECUTION_CANARY_BUSINESSES | Apply and rollback authority stay explicit and canary-gated. A disabled or allowlist-only apply posture is intentional and not treated as hidden. Duplicate client mutation IDs now replay terminal results or stop with a non-dispatching conflict instead of issuing a second provider write. |
| `/copies` | `live` | `current` | n/a | The surface remains live and intentionally unchanged in this phase. Authority coverage is explicit so /copies cannot disappear into baseline ambiguity. |
| `Legacy Meta Alias` | `legacy` | `current` | n/a | The legacy alias remains intentionally shipped as a redirect. It is marked legacy rather than hidden so drift stays explicit. |

## Unresolved Drift

| Item | Status | Detail |
| --- | --- | --- |
| none | aligned | No unresolved drift items remain. |


## Review Order

1. Review release identity through `/api/build-info` and `/api/release-authority` first.
2. Review the feature matrix next: runtime state, flag posture, and docs posture for each surface.
3. Review `docs/v3-01-release-authority.md` before older Phase 02-06 docs when deciding what is truly live.
4. Review legacy aliases after the main surfaces so redirects do not get mistaken for canonical entrypoints.
5. Resolve any unresolved drift items before treating the baseline as release-ready.
