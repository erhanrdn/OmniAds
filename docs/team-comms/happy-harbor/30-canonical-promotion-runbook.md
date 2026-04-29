# Canonical Resolver Promotion Runbook

Date: 2026-04-29

Scope: production promotion path for canonical resolver after Round 4 review. This runbook does not authorize rollout by itself.

## Step 1: Merge Without Auto-Deploy

Action:

- Merge PR #84 only after Claude and ChatGPT Pro approve Round 4.
- Verify `.github/workflows/ci.yml` path guards are present.
- Confirm merge does not start a production deploy from auto-deploy-on-merge.

Go/no-go:

- Go only if CI is green and no production deploy is automatically dispatched.
- No-go if a merge starts `dispatch-deploy` without explicit promotion approval.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 2: Nightly Snapshot Confirmation

Action:

- Wait for the next nightly snapshot generation cycle.
- Confirm canonical resolver computes alongside legacy without errors.
- Confirm `canonicalDecision` attaches to all new creative snapshots for the allowlist businesses.

Go/no-go:

- Go only if fallback/re-run badge rate is `<=10%` and all new snapshots have canonical payloads.
- No-go if canonical computation errors, null payloads, or snapshot schema issues appear.

Approvers:

- Engineering owner.

## Step 3: Internal Allowlist Activation

Action:

- Activate only IwaStore and TheSwaf via admin allowlist.
- Do not set percentage rollout.

Go/no-go:

- Go only if both businesses route to `canonical-v1` with source `allowlist`.
- No-go if any non-allowlisted business routes to `canonical-v1`.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 4: Manual Deploy

Action:

Run manual workflow dispatch:

```text
sha=<7f133ba descendant or merge commit SHA>
require_current_main_head=true
run_migrations=true
break_glass=false
override_reason=canonical resolver staging activation, allowlist only
```

Go/no-go:

- Go only if deploy gate, release gate, web image, worker image, and build-info all converge to the exact SHA.
- No-go on any failed gate, stale worker heartbeat, or non-matching build SHA.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 5: Seven-Day Allowlist Observation

Required window:

- 7 full days after Step 4.

Metrics:

- `critical_high_conf_override_rate`: `ok`, denominator `>=30`.
- `high_plus_critical_override_rate`: `ok`, denominator `>=30`.
- `all_severe_override_rate`: `ok`, denominator `>=30`.
- `overdiagnose_override_rate`: `ok`, denominator `>=30`.
- `fallback_rerun_badge_rate`: `ok`, denominator `>=30`.
- `critical_realtime_queue_volume`: `ok`.
- `confidence_histogram_per_business`: no collapse into low-confidence majority without written approval.
- `readiness_distribution`: no unexpected `blocked` spike.

Go/no-go:

- Go only if every metric above is `ok`.
- No-go if any hard stop fires or any warning remains unresolved.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 6: 25% Cohort Rollout

Action:

- Set `rollout_percent=25` in admin config.
- Cohort assignment source must be `rollout_percent_assigned` on first assignment and `sticky_assigned` afterward.

Go/no-go:

- Go only if kill switch has been tested within the last 24 hours and returns all decisions to legacy within the next request.
- No-go if sticky cohort assignment is not persisted.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 7: Seven-Day 25% Observation

Required window:

- 7 full days after Step 6.

Go/no-go:

- Go only if all GATE-1 metrics stay `ok` with denominator `>=30` per business where applicable.
- No-go if critical high-confidence override rate exceeds `1%`, overdiagnose override rate exceeds `25%`, or complaint volume doubles.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 8: 50% Cohort

Action:

- Set `rollout_percent=50`.

Go/no-go:

- Same as Step 7.
- Any per-business hard stop blocks promotion to 100%.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 9: 100% Cohort

Action:

- Set `rollout_percent=100` only after 50% cohort clears observation.

Go/no-go:

- Go only if 50% cohort has no unresolved warnings and no hard stops.
- No-go if action distribution drift exceeds `20pp` without explicit product approval.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Rollback Order

1. Kill switch: set `CANONICAL_RESOLVER_KILL_SWITCH=true` or run `scripts/canonical-resolver-kill-switch.ts on`.
2. Flag flip: set rollout percent to `0`, clear allowlist if needed, and confirm next request resolves to legacy.
3. SHA revert: deploy previous known-good SHA through `deploy-hetzner.yml`.

Rollback is mandatory if any hard stop fires:

- `critical_high_conf_override_rate >1%` with denominator `>=30`.
- `overdiagnose_override_rate >25%` with denominator `>=30`.
- `fallback_rerun_badge_rate >10%` sustained with denominator `>=30`.
- Production UI consistency check fails.
