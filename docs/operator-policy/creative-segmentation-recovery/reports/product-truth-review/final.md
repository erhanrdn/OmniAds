# Creative Product-Truth Review - Final

Last updated: 2026-04-24 by Codex

## 1. Executive Verdict

**NOT TRUSTWORTHY YET.**

Secondary characterization: **TOO CONSERVATIVE** on scale-review admission and **too soft** on mature weak rows.

This review does not recommend a full rebuild yet. It does recommend targeted recalibration before the work is sent as final product truth.

## 2. What The PDFs Prove

The PDFs prove:

- the agreed 10-label taxonomy is visible in the actual Creative page
- `Scale` is zero in both screenshots
- `pdf-company-01` has one visible `Scale Review`, so Scale Review is not globally impossible in the UI
- `pdf-company-02` has zero `Scale Review`, zero `Cut`, five `Protect`, four `Watch`, and nine `Not Enough Data`
- strong-looking rows can be buried in `Protect`
- weak-looking rows can avoid `Cut`
- the page still requires a buyer to read the table manually to understand why strong rows are protected and weak rows are not cut

The PDFs do not prove exact benchmark or business-validation truth by themselves.

## 3. What Live Data Proves

The current live audit rerun found:

| Metric | Count |
| --- | ---: |
| Runtime readable businesses | 8 |
| Sampled creatives | 78 |
| Scale | 0 |
| Scale Review | 0 |
| Test More | 8 |
| Protect | 13 |
| Watch | 21 |
| Refresh | 16 |
| Retest | 0 |
| Cut | 0 |
| Campaign Check | 0 |
| Not Enough Data | 14 |
| Not eligible for evaluation | 6 |
| Businesses with zero Scale | 8 |
| Businesses with zero Scale Review | 8 |

This is no longer a source-output restoration problem. Live Decision OS rows flow. The remaining issue is whether the current policy/gates produce media-buyer-sensible labels.

## 4. Worst 10 Live/Product Failures

| Rank | Case | Current output | Why it is a product-truth failure |
| ---: | --- | --- | --- |
| 1 | `company-05-creative-02` | Protect | Very high spend, 10.45 ROAS, 12 purchases, strong baseline, old challenger Scale. A buyer would expect at least review-level scale discussion. |
| 2 | `company-05-creative-06` | Watch | High spend, 7.26 ROAS, 4 purchases, strong-relative, old challenger Scale. Generic Watch hides the opportunity or campaign-context blocker. |
| 3 | `company-01-creative-01` | Protect | 58 purchases and true-scale evidence metadata, but no Scale Review path. |
| 4 | `company-01-creative-02` | Watch | 4.74 ROAS, 21 purchases, strong-relative, missing CT only; should be a review-only scale candidate unless another blocker is explicit. |
| 5 | `company-01-creative-05` | Protect | 8.53 ROAS, 15 purchases, true-scale evidence metadata; Protect may be right operationally but hides scale-review value. |
| 6 | `company-05-creative-03` | Not Enough Data | 10022.46 spend, 0.80 ROAS, 1 purchase, internal block-deploy. This is not "too early." |
| 7 | `company-05-creative-05` | Watch | 6375.92 spend, zero purchases. Watch is too soft unless framed as urgent weak-performance review. |
| 8 | `company-05-creative-07` | Watch | 5621.45 spend, zero purchases. Same mature weak pattern. |
| 9 | `company-05-creative-10` | Watch | 4524.33 spend, zero purchases. Same mature weak pattern. |
| 10 | `company-08-creative-09` | Not Enough Data | 587.18 spend, 0.38 ROAS, 1 purchase, internal block-deploy. Soft label conflicts with action state. |

## 5. Is Scale / Scale Review Absence Defensible?

No.

`Scale = 0` may be defensible because true Scale requires business validation and execution safety.

`Scale Review = 0` across 78 live top-spend sampled rows is not defensible after reviewing the representative rows. Several rows have:

- active or recently meaningful delivery
- strong baselines
- meaningful spend
- purchase/value evidence
- strong relative evidence metadata or old-challenger scale pressure

Missing Commercial Truth should block true Scale and push/apply authority. It should not erase review-level relative-winner language.

## 6. Is Current UI Better Than Manual Table Reading?

Partially, but not enough.

What is better than a raw table:

- taxonomy labels are visible
- preview cards and table rows expose operator segments
- `Refresh`, `Protect`, `Watch`, and `Test More` organize the table
- benchmark scope is visible

What still fails the buyer:

- strong winners can look like "do nothing" Protect without review-level growth guidance
- high-spend weak rows can look like generic Watch or Not Enough Data
- zero live Scale Review makes the system feel mute in exactly the place a buyer expects judgment
- the buyer still has to read the raw spend/ROAS/purchase columns to decide whether the label is sensible

Therefore the current UI is not yet reliably better than manual table reading for scale/cut decisions.

## 7. Likely Wrong Gates

Likely wrong or over-dominant gates:

- protected-winner gate over-caps strong relative rows that should still be reviewable for scale
- missing business validation is still too strong at review-level in some paths
- campaign-limited strong rows often land in generic Watch instead of Campaign Check or Scale Review with a context note
- mature weak/high-spend zero-purchase rows are not severe enough
- internal block-deploy can surface as Not Enough Data, which is semantically too soft

Likely correct gates:

- true Scale remains blocked without business validation
- queue/apply/push remain blocked without provenance/trust/business validation
- low-spend one-purchase rows should remain Not Enough Data/Test More
- fatigued winners can validly route to Refresh instead of Scale Review

## 8. Specific Case Result

The private user-observed case maps to:

- business: `company-03`
- creative: `company-03-creative-07`
- current segment: `Refresh`
- prior `Pause` read: stale wording or legacy UI/detail collision, not current product truth

The current data does not support a forced Scale Review under account-wide benchmark:

- the row is inactive because campaign/ad set context is paused
- 30-day ROAS is below the account median ROAS
- it has meaningful purchase evidence and a good recent 7-day read
- `Refresh` is defensible if the product interpretation is fatigue/replacement

This should be a fixture for `Refresh`/`Retest` wording, not a broad Scale Review fixture.

## 9. Should We Rebuild?

No full rebuild yet.

The source path, taxonomy, benchmark contract, and safety model are worth preserving. The old rule engine is not ground truth, but it is useful as a challenger because it highlights:

- scale candidates hidden by Protect/Watch
- weak rows softened by Watch/Not Enough Data

Recommended path:

- targeted recalibration with fixtures
- no old-rule takeover
- no broad threshold loosening
- no push/apply safety loosening

## 10. Exact Next Implementation Scope

Recommended next implementation pass:

1. **Protected winner vs Scale Review boundary**
   - If a row is an active strong-relative winner with sufficient purchase/value evidence and missing CT is the only execution blocker, surface `Scale Review` unless the "protect" reason is explicitly stronger and visible.
   - Preserve true Scale gating.

2. **Mature weak vs Not Enough Data / Watch**
   - High-spend zero-purchase rows should not look like early learning.
   - Internal `block_deploy` should not surface as plain `Not Enough Data`.
   - Add fixture coverage for high-spend zero-purchase and high-spend one-purchase weak rows.

3. **Campaign-limited strong rows**
   - Strong-relative rows blocked primarily by campaign context should surface `Campaign Check` or a clear Watch instruction naming campaign context.
   - Do not silently switch benchmark scope.

4. **Fixture pack**
   - `company-05-creative-02`: strong protected candidate.
   - `company-01-creative-01`: true-scale evidence protected candidate.
   - `company-01-creative-02`: strong-relative Watch candidate.
   - `company-05-creative-03`: internal block-deploy but Not Enough Data.
   - `company-05-creative-05`: high-spend zero-purchase Watch.
   - `company-03-creative-07`: specific Refresh/Retest wording case.

## 11. Final Readiness

Ready for independent Claude review as an evidence PR.

Not ready for final Creative Recovery acceptance.

Expected implementation next:

- narrow product-truth recalibration pass
- then rerun the same PDF/live audit
