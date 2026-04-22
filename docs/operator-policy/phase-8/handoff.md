# Phase 8 Handoff

Phase 7 prepares Adsecute for production rollout as an operator decision system, but account-push automation remains intentionally disabled and gated.

## What Phase 7 Completed

- Production-safe staged telemetry helper for operator decisions.
- Aggregate rollout counters that avoid pseudonymous action keys by default.
- Explicit stdout telemetry gate through `OPERATOR_DECISION_TELEMETRY_STDOUT=1`.
- Creative scale instructions that name the preferred target ad set in the primary sentence when available.
- Target-unavailable wording when deployment context is incomplete.
- Clearer hold-monitor wording to separate monitor holds from blocked review, protected winners, and truth gates.
- Small performance/network safeguard for Creative quick-filter bucketing.

## Remaining Before Account-Push Automation

- Add a production metrics/log sink with sampling, retention, and alert ownership.
- Add compact Command Center action lookup for preview/apply instead of rebuilding broad snapshots.
- Share or memoize Meta Decision OS compilation between recommendations and decision-os routes.
- Reduce Creative metadata/history and Decision OS source-read overlap.
- Add live connected-account monitoring for target-context quality, unavailable target rates, blocked_from_push spikes, and queue-ready volume.

## Required Safety Gates For Push-To-Account

- Provenance and action fingerprint must be present and current.
- Evidence source must be live.
- Deterministic policy must allow queue/push.
- Apply action type must be in the supported execution allowlist.
- Operator approval must be recorded before any provider mutation.
- Rollback or manual recovery instructions must exist for each executable action family.
- Contextual, demo, snapshot, fallback, non-live, missing-provenance, and policy-blocked rows must remain non-push eligible.

## Rollback Requirements

- Every executable provider action needs a preflight preview.
- The preview must show source provenance, old value, new value, assumptions, and unsupported rollback gaps.
- Rollback state must be recorded before apply.
- Failed apply and failed rollback states must remain visible in Command Center.

## Approval Requirements

- Account-push automation should begin with manual operator approval only.
- High-impact actions need a second confirmation or elevated role.
- Budget/bid changes with unavailable or review-required amount guidance must remain manual-only.
- Creative deployment actions with unavailable target context must remain review-required.

## Monitoring Requirements

- Alert on sudden increases in `blocked_from_push`, `targetContextStatus=unavailable`, `amountGuidanceStatus=unavailable`, and missing evidence counts.
- Track queue-ready volume by source system and instruction kind.
- Track apply failures separately from queue eligibility.
- Track runtime latency and payload size for Meta, Creative, and Command Center operator surfaces.

## Canary Rollout Plan

1. Enable telemetry aggregation only, no provider mutation.
2. Monitor seeded and connected accounts for one release cycle.
3. Enable preview-only apply flows for supported Meta action types.
4. Require manual approval and operator notes for every mutation.
5. Expand one action family at a time only after failure and rollback telemetry is stable.

## Recommended Phase 8 Branch

`feature/adsecute-account-push-readiness-canary`

## Recommended Phase 8 Acceptance Criteria

- Production telemetry sink is enabled with safe sampling and no sensitive identifiers.
- Compact Command Center action lookup exists for preview/apply paths.
- Runtime and performance checks pass for Meta, Creative, and Command Center.
- Push-to-account remains disabled until preview, approval, apply, rollback, monitoring, and canary gates pass.
- No selected reporting range can authorize a provider mutation.
- All existing provenance, policy, prescription, queue, push, and apply safety tests pass.
