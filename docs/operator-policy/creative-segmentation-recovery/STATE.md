# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Creative Segmentation Calibration Lab data-gate hardening is merged and the 10-agent calibration panel is complete. The next step may be deterministic policy implementation backed by fixtures.

## PR #37 Hardening Result

Merged.

What changed:

- strengthened runtime readability handling for encrypted Meta credentials
- distinguished missing key vs unreadable key vs readable runtime
- prevented false `0 live businesses` conclusions from unreadable credentials
- forced runtime skip totals to equal classified runtime skip reasons

Review issues:

- decryption-key presence check was a real issue
- runtime skip total drift was a real issue

Updated gate status after hardening: still `passed`

## Live Meta Connectivity Status

Live Meta connectivity was real in the checked production-equivalent runtime.

Recovered status:

- DB-eligible Meta-connected candidates: 8
- Runtime-eligible live-readable candidates: 7
- Runtime-skipped candidates: 1

The runtime-skipped candidate is `candidate-01`, which failed live Meta reads with an OAuth checkpoint/token error.

## Helper / Environment Mismatch Status

Real.

The earlier local `0 eligible businesses` diagnosis came from running the helper with `DATABASE_URL` only. That was insufficient to verify encrypted Meta credentials.

The helper now protects against that mismatch:

- it distinguishes missing token decryption env from present-but-unreadable encrypted credentials
- it screens candidates through live Meta readability before sampling
- it keeps runtime skip totals equal to the classified runtime skip reasons

## Current Data Accuracy Gate Status

Passed.

Latest corrected gate result:

- historical snapshot candidates inspected: 8
- DB-eligible candidates: 8
- runtime-eligible candidates: 7
- runtime-skipped candidates: 1
- sampled candidates: 3
- sampled rows exported: 32
- active eligible zero-row candidates: 0
- gate passed: true

## Agent Panel Status

Completed.

Panel coverage:

- sampled companies reviewed: 3
- sanitized rows in dataset: 32
- representative creative rows reviewed by all 10 roles: 12

High-level result:

- all 10 roles converged on the current Decision OS segment for all 12 representative rows
- the panel did not expose a new source-health blocker
- the strongest deterministic targets are `Campaign Check`, `Not Enough Data`, `Test More`, `Refresh`, `Protect`, and commercial-truth split behavior

Important:

- agent consensus did not become policy
- this pass produced diagnosis, rule candidates, and fixture candidates only

## Remaining Blockers

No remaining Data Accuracy Gate blocker.

No blocker preventing deterministic implementation work from starting next.

Non-blocking follow-up:

- reconnect or refresh the Meta credential for `candidate-01`
- `meta_creative_daily` is still empty, so independent warehouse-level creative verification remains unavailable

## Mismatch Summary

Top mismatch clusters:

- `Campaign Check` missing when campaign context is weak or unavailable
- `Not Enough Data` vs `Test More` confusion in thin-evidence rows
- fatigued-winner `Refresh` paths that old rule misread as `pause` or `scale`
- protected-winner `Protect` paths that old rule misread as `scale`
- commercial-truth over-gating
- weak or missing campaign benchmark
- UI label reason-class ambiguity

## Fixture Summary

Immediate direct fixtures are available from the validated panel for:

- `Campaign Check` context-gap rows
- `Not Enough Data` false-winner rows
- `Test More` under-sampled positive rows
- `Refresh` fatigued-winner rows
- `Protect` stable-winner rows
- `Watch` under partial commercial truth

Still needed later:

- true scale-ready review-only fixtures
- low-spend but meaningfully supported positive fixtures
- any case where old rule cleanly outperforms current Decision OS

## meta_creative_daily Confidence Limitation

Current verification confidence remains API/payload parity only.

`meta_creative_daily` is not the immediate blocker for Calibration Lab progression in the current Creative product pipeline.

## Exact Next Action

Start deterministic policy implementation against the validated fixture plan:

1. add fixture coverage for context gaps, false winners, under-sampled positives, fatigued winners, and protected winners
2. implement deterministic gates for those clusters without changing thresholds yet
3. preserve queue/push/apply safety and keep commercial-truth action gating intact

## Reports

- Data gate: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/data-accuracy-gate.md`
- Live Meta recovery: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/live-meta-connectivity-recovery.md`
- Live Meta final: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/live-meta-cohort-final.md`
- Agent judgments: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/agent-panel-judgments.md`
- Mismatch synthesis: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/mismatch-synthesis.md`
- Fixture plan: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/fixture-candidate-plan.md`
- Final lab report: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/final.md`
- Sanitized artifact: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

## Last Updated By Codex

- merged PR #37 hardening after fixing encrypted-runtime readability and runtime skip-count issues
- ran the 10-agent calibration panel on the validated sanitized dataset
- produced mismatch synthesis and fixture candidate plan
- confirmed that deterministic implementation may start next without changing thresholds or rewriting segmentation
