# Phase 6 Handoff

## Phase 5 Completed

- Added deterministic operator instruction contract on top of existing Meta and Creative policies.
- Exposed first-level operator prescription copy for Meta rows, Creative rows, Creative detail, and Command Center.
- Kept push readiness, provenance, queue eligibility, and selected-range firewall unchanged.
- Added tests for prescription behavior, non-live evidence, protected winners, blocked Meta actions, Creative watch states, and Command Center fail-closed instruction recomputation.

## What Phase 6 Should Address

Phase 6 should focus on production rollout, observability, and operational hardening. It should not loosen queue/push eligibility by default.

Recommended branch:

`feature/adsecute-operator-rollout-observability`

## Remaining Production Concerns

- Runtime performance on large connected accounts with many Meta and Creative rows.
- Network behavior when Decision OS and Command Center requests run concurrently.
- Observability for prescription state distribution, blocked reasons, missing evidence, and queue eligibility.
- Alerting when policy output and instruction output diverge.
- Stale action prevention across long-lived sessions.
- Browser smoke coverage for prescription rendering on connected high-volume accounts.

## Rollout Requirements

- Add telemetry for instructionKind, pushReadiness, evidenceStrength, and missingEvidence counts.
- Capture sanitized actionFingerprint-level audit events when users view, queue, approve, or reject operator instructions.
- Add release gate dashboards for command-ready count, blocked count, contextual-only count, and policy/instruction mismatch count.
- Add feature flag fallback that can hide prescription sections without disabling deterministic policy.

## Future Account-Push Readiness

Do not enable account push until all of these are true:

- Provider execution identifiers are complete and verified.
- Provenance includes execution-safe provider ids, not only grouped UI ids.
- Rollback/cooldown logic is validated in staging.
- Queue/apply flows enforce policy and instruction consistency.
- Budget/bid amount recommendations are deterministic, bounded, and tested.
- Human approval and audit trails are mandatory for destructive or budget-affecting actions.

## Phase 6 Acceptance Criteria

- Existing Meta and Creative policy tests continue passing.
- Prescription tests continue passing.
- Command Center safety tests continue passing.
- Runtime smoke passes on the documented localhost/server path.
- Telemetry does not expose secrets, account ids, business ids, or customer-identifying values.
- No selected reporting range can authorize primary actions.
- No freeform LLM output can approve, queue, or apply final decisions.
- Phase 6 ends with a rollout readiness report and clear go/no-go criteria for future execution work.
