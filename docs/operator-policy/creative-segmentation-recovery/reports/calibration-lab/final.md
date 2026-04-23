# Creative Segmentation Calibration Lab - Final Report

Last updated: 2026-04-23 by Codex

## Result

The Data Accuracy Gate remains passed, PR #37 hardening is merged, and the 10-agent calibration panel is complete.

## Part A — Hardening Result

- PR #37 review issue 1 was real: decryption-key presence alone was too weak.
- PR #37 review issue 2 was real: runtime skip totals could drift from classified reasons.
- Both issues were patched, tested, rerun in the production-equivalent runtime, and merged.
- Gate status after hardening remained `passed: true`.

## Part B — Agent Panel Result

- Panel ran on the validated sanitized dataset.
- Coverage: 3 sampled companies, 32 sanitized rows, 12 representative creative rows.
- All 10 roles converged on the current Decision OS segment for all 12 representative rows.
- The panel outcome is diagnostic only. It does not make policy by vote.

## Highest-Signal Findings

- `Campaign Check` is correct when campaign/ad set context is missing or campaign peer depth is below floor.
- `Not Enough Data` is correct for one-purchase / false-winner / singleton-baseline cases.
- `Test More` is correct for under-sampled positives like `company-01-creative-12`.
- `Refresh` is the correct route for fatigued winners; old-rule `pause` or `scale` was repeatedly worse.
- `Protect` is the correct route for stable winners; old-rule `scale` was repeatedly worse.
- Missing commercial truth should reduce confidence and continue to block push/apply, but it should not erase relative diagnosis.

## Top Mismatch Clusters

1. `Campaign Check` missing in old-rule logic
2. `Not Enough Data` vs `Test More` confusion
3. fatigued-winner routing (`Refresh`) vs old-rule `pause` / `scale`
4. protected-winner routing (`Protect`) vs old-rule `scale`
5. commercial-truth over-gating
6. campaign benchmark missing or weak
7. UI label reason-class ambiguity

## What The Panel Did Not Justify Yet

- expanding direct `Scale Review`
- retuning `Cut`
- rewriting segmentation wholesale
- using agent consensus as policy

## Next Implementation Target

Deterministic implementation may start next with fixture-backed work in this order:

1. `Campaign Check` for missing campaign context
2. `Not Enough Data` for false-winner and sample-floor cases
3. `Test More` for under-sampled positives
4. `Refresh` for fatigued winners
5. `Protect` for stable winners
6. commercial-truth split:
   - do not suppress relative diagnosis
   - continue to block push/apply and absolute-profit claims

## Non-Blocking Limitations

- `candidate-01` still needs Meta credential refresh/reconnect
- `meta_creative_daily` remains empty, so warehouse-level creative verification is still unavailable

## Reports

- Data gate: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/data-accuracy-gate.md`
- Live Meta recovery: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/live-meta-connectivity-recovery.md`
- Live Meta final: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/live-meta-cohort-final.md`
- Agent judgments: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/agent-panel-judgments.md`
- Mismatch synthesis: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/mismatch-synthesis.md`
- Fixture plan: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/fixture-candidate-plan.md`
