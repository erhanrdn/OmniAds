# Fatigued Winner Cut Recalibration

Date: 2026-04-25

## Verdict

Result: targeted recalibration implemented.

This pass did not implement a baseline-first rebuild, did not add a parallel
classifier, and did not change UI taxonomy, Scale / Scale Review floors,
benchmark scope, Commercial Truth behavior, or queue/push/apply safety.

## Issue Status

The issue was real.

Main already had a catastrophic-CPA gate for `fatigued_winner` /
`refresh_replace` rows, but that gate required either very poor CPA or a
zero-recent-read CPA blowout. It did not cover the narrower supervisor target:
high-spend fatigued winners with mature evidence and ROAS materially below the
active benchmark when CPA was not catastrophic enough to trip the older gate.

## Gate Changed

Added `isFatiguedHighSpendBelowBaselineCutCandidate` in
`lib/creative-operator-policy.ts`.

The new admission routes a row to review-safe `spend_waste` / Cut only when:

- lifecycle or fatigue context indicates `fatigued_winner`
- the row is on a refresh path (`refresh_replace`, or non-protected fatigued
  `hold_no_touch` with explicit fatigue pressure)
- relative baseline context is available and reliable
- 30-day spend is at least `max(1500, 3x peer median spend)`
- purchases, impressions, and creative-age evidence are mature
- ROAS is at most `0.80x` the active benchmark ROAS
- campaign/ad set context is not the primary blocker

Rows with blocked campaign context still route to `investigate` / Campaign
Check behavior. Protected watchlist / no-touch winners remain protected unless
the failure gate applies without a protected override.

## Fixtures Added

Added deterministic policy fixtures for:

- `row-041` shape: high spend, ROAS `0.57x` active benchmark,
  `fatigued_winner` / `refresh_replace` -> Cut
- `row-043` shape: high spend, ROAS `0.64x` active benchmark,
  `fatigued_winner` / `refresh_replace` -> Cut
- `row-046` shape: high spend, ROAS `0.68x` active benchmark with weak purchase
  efficiency -> Cut
- `row-078` shape: high-spend below-baseline fatigued winner -> Cut

Regression fixtures:

- fatigued winner near benchmark remains Refresh
- fatigued winner below benchmark but below the high-spend floor remains Refresh
- campaign context blocker remains Campaign Check behavior
- weak/unreliable baseline does not invent Cut
- protected no-touch winner remains Protect
- queue/push/apply remain review-gated and not auto-apply

## Before / After

Before this pass:

- the four target high-spend below-baseline shapes could remain Refresh if CPA
  was not catastrophic enough for the older CPA-specific gate

After this pass:

| row | before | after |
| --- | --- | --- |
| `row-041` | Refresh | Cut |
| `row-043` | Refresh | Cut |
| `row-046` | Refresh | Cut |
| `row-078` | Refresh | Cut |

Cut precision / recall impact:

- targeted Refresh-as-Cut cluster coverage improves by `4` rows in deterministic
  fixtures
- a fresh live-firm audit rerun was retried through the SSH database tunnel
- the tunnel connected, but the helper failed on a database query timeout after
  `8000ms`
- no global score claim is made from fixtures alone

## Remaining Issues

Still intentionally out of scope:

- validating Watch -> Refresh admission
- lifecycle fatigue classifier up-trend guard
- Scale / Scale Review recalibration
- baseline-first classifier replacement

## Next Recommended Action

Run the next narrow pass on validating Watch -> Refresh only if the post-merge
review confirms that cluster still survives this recalibration.
