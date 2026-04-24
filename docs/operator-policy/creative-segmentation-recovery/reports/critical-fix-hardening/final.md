# Critical Fix Hardening Final

Date: 2026-04-24

Status: fixed.

## Verdict

The PR #56 Codex review issues were real and have been hardened without changing the broader Creative policy direction.

This pass did not retune thresholds, change taxonomy, redesign UI, loosen queue/apply/push safety, alter Commercial Truth, change benchmark-scope semantics, or import old-rule behavior.

## P1 Active-Test Gating

Issue: real.

Root cause:

- `isActiveTestCampaign` treated `activeDelivery` alone as enough to enter active-test campaign override branches.
- That made ordinary active campaigns eligible for test-campaign override behavior, so strong ordinary `hold_no_touch` winners could skip `protected_winner` and become `Scale Review` or `Test More`.

Fix:

- active-test override now requires explicit test context:
  - `campaignIsTestLike === true`
  - campaign/ad set delivery is active, or campaign status is active
  - `pausedDelivery !== true`
- ordinary active campaigns no longer trigger active-test routing.
- explicit active test campaigns still route strong relative winners to `Scale Review` or `Test More`.
- campaign/ad set blockers still route to `Campaign Check`.

Fixture coverage:

- ordinary active non-test `hold_no_touch` winner remains `Protect`
- active delivery alone does not trigger active-test branch
- `campaignIsTestLike: false` blocks active-test override
- paused test-campaign delivery does not trigger active-test override
- explicit active test strong-relative winner remains `Scale Review`
- explicit active test moderate relative winner remains `Test More`

## P2 Paused Retest Mapping

Issue: real.

Root cause:

- policy could produce paused historical winner `needs_new_variant` outcomes for non-`hold_no_touch` primary actions.
- surface mapping only showed `Retest` when `primaryAction === "hold_no_touch"`, so some paused reactivation cases could render as `Refresh`.

Fix:

- policy retest candidate logic now explicitly excludes true `refresh_replace` and `block_deploy` cases.
- surface mapping mirrors the policy candidate shape:
  - paused delivery
  - `needs_new_variant`
  - historical winner or scale-ready context
  - retest-capable primary action
- true Refresh cases remain `Refresh`.
- Retest remains review-only and does not affect queue/apply safety.

Fixture coverage:

- paused historical winner with `hold_no_touch` shows `Retest`
- paused historical winner with non-hold primary action shows `Retest`
- true paused Refresh case remains `Refresh`
- weak paused creative does not become `Retest`
- Retest label, bucket, and instruction align

## Sanitized Live Test-Context Behavior

The recent media-buyer fixes remain intact in deterministic fixtures:

- explicit active test strong-relative winners still become `Scale Review`
- explicit active test moderate relative winners still become `Test More`
- mature trend-collapse losers still become `Cut` or `Refresh`
- mature CPA/below-baseline losers still become `Cut`
- paused historical winners still become `Retest`

The hardening prevents those active-test overrides from leaking into ordinary non-test active campaigns.

## Validation

Targeted validation run:

- `npx vitest run lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts lib/creative-decision-os.test.ts lib/operator-prescription.test.ts`

Result:

- `4` test files passed
- `116` tests passed

Full validation is recorded in the PR body and STATE after the complete check run.

## Readiness

Creative Recovery can be accepted after this hardening PR passes checks and merges, assuming no new correctness blocker appears in CI.
