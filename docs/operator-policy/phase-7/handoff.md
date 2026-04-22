# Phase 7 Handoff

Phase 6 completed the bounded-parameter and production-readiness layer on top of the deterministic Meta and Creative operator policies.

## What Phase 6 Completed

- Bounded Meta budget bands where current daily budget is available.
- Explicit unavailable/not-applicable amount guidance when no safe number can be computed.
- Creative scale target context from preferred ad set/campaign deployment data.
- Target-unavailable and review-required wording when deployment context is incomplete.
- Evidence-based urgency reasons.
- Reduced HOLD ambiguity with `Hold: verify` copy and clearer target/urgency lines.
- Production-safe operator-decision telemetry attached to instructions.
- Command Center safety hardening so instruction text cannot loosen policy, queue, push, or apply gates.

## Remaining Production Rollout Concerns

- Telemetry currently lives on instruction objects; Phase 7 should decide where and how to export it.
- Runtime smoke is seeded-localhost coverage, not full connected-account production sampling.
- Connected accounts should be monitored for noisy target labels, missing deployment context, and amount-band comprehension.
- Auth setup still reports benign `NO_COLOR` / `FORCE_COLOR` warnings during smoke.

## Account-Push Readiness Gaps

- No automatic account-push execution was added in Phase 6.
- Unsupported action families must remain manual/review-only.
- Budget bands are not apply commands.
- Bid and cost-control parameters remain unavailable until reliable source values exist.
- Missing provenance, non-live evidence, contextual rows, and policy blocks must continue to fail closed.

## Observability Gaps

- Add a metrics/log sink for `operator-decision-telemetry.v1`.
- Track aggregate counts by source system, instruction kind, push readiness, amount status, target-context status, and blocked reason.
- Avoid raw business IDs, ad account IDs, entity names, actor identifiers, and free-form notes.
- Add alerting for unexpected increases in `blocked_from_push`, `targetContextStatus=unavailable`, and `amountGuidanceStatus=unavailable`.

## Performance And Network Concerns

- Keep telemetry emission asynchronous and non-blocking.
- Do not add per-row network calls for instruction rendering.
- Preserve deterministic source-window behavior; reporting-range changes must remain non-authoritative.

## Recommended Phase 7 Branch

`feature/adsecute-operator-observability-rollout`

## Recommended Phase 7 Acceptance Criteria

- Telemetry export path exists and is disabled or sampled safely by default.
- Telemetry is sanitized and tested against raw identifier leakage.
- Production rollout checklist covers seeded smoke, live smoke, and post-deploy monitoring.
- Command Center queue/apply/push gates remain unchanged.
- No automatic account push is enabled without explicit product and safety approval.
- Existing Meta, Creative, provenance, Command Center, and instruction tests pass.
- Runtime smoke passes on the approved localhost/server path.
