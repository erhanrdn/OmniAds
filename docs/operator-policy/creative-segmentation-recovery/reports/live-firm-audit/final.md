# Creative Live-Firm Audit - Final

Last updated: 2026-04-24 by Codex

## 1. Branch / PR Status

- Branch: `feature/adsecute-live-firm-audit-rerun`
- PR: draft PR opened after validation in this pass
- Merge status: do not merge in this pass

## 2. Cohort Summary

- Historical snapshot candidates: `9`
- Runtime-eligible live-readable Meta businesses: `8`
- Runtime-skipped candidates: `1`
- Runtime skip reason: `meta_token_checkpointed = 1`
- Current Decision OS creatives across audited businesses: `306`
- Sampled creatives: `78`

## 3. Sample Selection Rule

Per business, this rerun used the documented deterministic rule:

1. last 30 completed days, excluding today
2. rank active creatives first
3. within active creatives, sort by 30-day spend descending
4. if fewer than 10 active creatives exist, fill with non-active creatives by 30-day spend descending
5. take up to the top 10 creatives

Outcome in this pass:

- sample generation worked on the corrected source path
- sampled rows were produced for all `8` audited businesses
- sampled active creatives: `55`

## 4. Global Sampled Segment Counts

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `6`
- `Watch`: `7`
- `Refresh`: `12`
- `Test More`: `6`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `39`
- `Cut`: `0`
- `Retest`: `0`

## 5. Main Failure Patterns

1. Current rows now flow, but `Scale` and `Scale Review` remain zero across the full corrected live sample.
2. Contextual-only gating still dominates the sample and fully defines four audited businesses.
3. Strong relative rows are still being buried before buyer-facing strength surfaces.
4. Commercial Truth scarcity remains high, but provenance/evidence-source gating is the stronger live-firm blocker.
5. Label/headline alignment is still uneven on live data.

## 6. Most Important Live-Firm Disagreements

- Strong contextual-only rows: `company-01/company-01-creative-02`, `company-01/company-01-creative-03`, `company-08/company-08-creative-07`, `company-08/company-08-creative-04`
- Protect vs weaker business-validation interpretation: `company-05/company-05-02`, `company-05/company-05-08`
- Watch vs stronger scale-review posture: `company-05/company-05-06`
- Test More vs lifecycle pressure: `company-06/company-06-03`

## 7. Whether Current Creative Output Is Trustworthy Enough

Not yet.

The page is no longer empty and is now materially more useful than the stale audit suggested. It still is not trustworthy enough across the full live readable cohort because:

- four businesses still surface only contextual-only output
- zero sampled rows reach `Scale` or `Scale Review`
- strong relative rows still get buried under provenance/context gates
- some instruction headlines still blur the user-facing segment meaning

## 8. Whether Product-Level Remediation Is Needed

Yes.

This is now a narrow product-truth question rather than a source/output blocker. The corrected audit suggests the next remediation should focus on contextual-only gating, zero live `Scale Review`, and label/headline clarity — not on broad policy rewrites.

## 9. Recommended Next Action

Run one final Claude live-firm product review against this corrected audit set.

That review should judge the current segmentation quality on real live rows, with special attention to:

- contextual-only strong rows
- zero `Scale` / zero `Scale Review`
- whether the page is now clearly better than manual table reading
- whether the remaining disagreement clusters are narrow enough for a final corrective pass

## 10. Whether This Is Ready For Claude Product Review

Yes.

The corrected rerun is ready for one final Claude live-firm product review.
