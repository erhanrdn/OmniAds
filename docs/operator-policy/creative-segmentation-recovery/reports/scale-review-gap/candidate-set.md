# Scale Review Gap - Candidate Set

Last updated: 2026-04-24 by Codex

## Scope

This candidate set was built from the corrected live-firm audit rerun sample on the restored Decision OS source path.

Input cohort:

- readable live Meta businesses: `8`
- sampled creatives: `78`
- sampled `Scale`: `0`
- sampled `Scale Review`: `0`

Selection rule for this report:

1. take audited rows that are **not** already `Scale` or `Scale Review`
2. rank active rows first
3. within that set, prefer stronger current relative-signal classes:
   - `true_scale_candidate`
   - `review_only_scale_candidate`
   - `strong_relative`
4. break remaining ties by 30d spend descending
5. review up to the top `5` rows per business

This is a deterministic review set, not a policy input.

## Summary

After separating true misses from rows that are more plausibly `Protect`, `Refresh`, or context-blocked, the corrected audit shows **one clean likely missed `Scale Review` case** and a broader cross-account source-authority problem that buries many rows under `Not eligible for evaluation`.

The live-firm gap is therefore real, but it is narrower than the raw zero-`Scale Review` count first suggests.

## Likely Missed Scale Review

### `company-01`

- `company-01-creative-04`
  - current segment: `Not eligible for evaluation`
  - current instruction: `Use as context: company-01-creative-04`
  - active status: `inactive`
  - 30d spend: `770.86`
  - 30d purchases: `21`
  - 30d ROAS: `4.78`
  - baseline scope: `account`
  - baseline reliability: `strong`
  - business validation: `missing`
  - current blocker: `evidenceSource = unknown`
  - why this looks like a miss:
    - strong relative row
    - no weak campaign-context flag
    - no protected-winner action
    - no fatigue/refresh action
    - no unfavorable business-validation block
    - the current user-facing downgrade is driven by source authority, not by the review-level rule itself

## Likely Correct Non-Scale-Review Cases

### Protect, not Scale Review

These rows look strong, but their underlying product action shape is more consistent with `Protect` once the source layer is trustworthy:

- `company-01-creative-02`
- `company-01-creative-03`
- `company-01-creative-10`
- `company-05-creative-02`
- `company-05-creative-08`
- `company-07-creative-06`
- `company-08-creative-04`
- `company-08-creative-05`
- `company-08-creative-07`
- `company-08-creative-08`

Main reason:

- these rows are strong, but they align better with stable shipped-winner handling than with review-only scale promotion

### Refresh, not Scale Review

These rows have strong signal but are better explained by fatigue/decay behavior:

- `company-02-creative-04`
- `company-04-creative-03`
- `company-05-creative-09`

Main reason:

- the row shape is more consistent with `refresh_replace` / fatigued-winner behavior than with scale-review promotion

### Campaign Check / Watch, not Scale Review

These rows still have a real campaign/ad set context blocker:

- `company-05-creative-06`
- `company-04-creative-02`

Main reason:

- the row is not blocked only by missing business validation; campaign or ad set context still limits interpretation

### Correctly Not Promoted Because Business Validation Is Unfavorable

- `company-02-creative-06`
- `company-05-creative-02`
- `company-05-creative-08`

Main reason:

- strong relative signal alone is not enough when business validation is explicitly unfavorable

## Deterministic Read

The candidate set supports a narrow conclusion:

1. the current zero-`Scale Review` live sample is not caused by a broad failure of the review-only scale rule
2. the strongest suppressor is source-authority collapse to `evidenceSource = unknown`
3. once that source gate is corrected, many buried rows should surface as their actual product state:
   - `Protect`
   - `Refresh`
   - `Campaign Check` / `Watch`
   - and only a small subset should become true `Scale Review`
