# Creative Segmentation Pass 5 Current Evaluation

Last updated: 2026-04-23 by Codex

## Scope

This report evaluates the current main-branch Creative Segmentation on the live runtime-eligible cohort after implementation passes 1 through 4.

Source artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-holdout-validation.json`

## All Live Eligible Companies

- companies: `7`
- creatives: `293`
- benchmark scope usage: `account = 293`, `campaign = 0`
- baseline reliability: `strong = 287`, `medium = 6`, `weak/unavailable = 0`
- business validation availability: `missing = 266`, `favorable = 3`, `unfavorable = 24`
- push readiness: `blocked_from_push = 126`, `read_only_insight = 157`, `operator_review_required = 10`

User-facing segments:

- `Protect = 19`
- `Watch = 29`
- `Not Enough Data = 137`
- `Refresh = 17`
- `Test More = 17`
- `Not eligible for evaluation = 71`
- `Campaign Check = 3`
- `Scale Review = 0`
- `Scale = 0`
- `Retest = 0`
- `Cut = 0`

Health checks:

- strong relative winners still failing to surface: `0` under the current explicit review-floor heuristic
- context-blocked rows still looking like quality rows: `2`
- evidence-thin rows still looking like action rows: `0`
- true `Scale` confirmations in live cohort: `0`
- rows that would otherwise clear true-`Scale` evidence but are still capped by missing business validation: `4`

## Calibration Split

- companies: `5`
- creatives: `192`
- benchmark scope usage: `account = 192`
- baseline reliability: `strong = 186`, `medium = 6`
- business validation availability: `missing = 165`, `favorable = 3`, `unfavorable = 24`
- push readiness: `blocked_from_push = 81`, `read_only_insight = 101`, `operator_review_required = 10`

User-facing segments:

- `Watch = 18`
- `Refresh = 15`
- `Not Enough Data = 94`
- `Protect = 17`
- `Not eligible for evaluation = 39`
- `Test More = 9`
- `Campaign Check = 0`
- `Scale Review = 0`
- `Scale = 0`

## Holdout Split

- companies: `2`
- creatives: `101`
- benchmark scope usage: `account = 101`
- baseline reliability: `strong = 101`
- business validation availability: `missing = 101`
- push readiness: `blocked_from_push = 45`, `read_only_insight = 56`

User-facing segments:

- `Protect = 2`
- `Watch = 11`
- `Not Enough Data = 43`
- `Refresh = 2`
- `Test More = 8`
- `Not eligible for evaluation = 32`
- `Campaign Check = 3`
- `Scale Review = 0`
- `Scale = 0`

Holdout-specific observations:

- explicit `Campaign Check` is present where campaign context is genuinely thin
- no evidence-thin holdout row is surfacing as an action-forward label
- no holdout row qualified cleanly for true `Scale`
- one holdout row (`company-01/company-01-creative-03`) sits on the live boundary between `Watch` and a possible review-only relative-winner label

## Current Reading

Current main-branch behavior on the live cohort is mostly coherent:

- `Campaign Check`, `Refresh`, and `Protect` are surviving live holdout reads
- `Not Enough Data` and `Test More` are no longer leaking into obvious action-forward states
- the major remaining ambiguity is not data accuracy or benchmark scope authority
- the remaining ambiguity is a boundary problem inside `Watch` / `Scale Review` / `Protect` for strong live rows that still lack business validation
