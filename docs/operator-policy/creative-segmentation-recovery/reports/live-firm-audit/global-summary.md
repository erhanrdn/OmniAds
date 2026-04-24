# Creative Live-Firm Audit - Global Summary

Last updated: 2026-04-24 by Codex

## Audit Status

Corrected-source rerun complete.

This audit uses the restored current Creative Decision OS source path rather than the earlier warehouse-backed helper drift. Current Decision OS rows now flow for every audited business.

## Cohort Summary

- Historical snapshot candidates: `9`
- Readable live Meta businesses audited: `8`
- Runtime-skipped candidates: `1`
- Runtime skip reason summary: `meta_connection_not_connected`: `0`, `meta_token_checkpointed`: `1`, `no_access_token`: `0`, `no_accounts_assigned`: `0`, `no_current_creative_activity`: `0`, `no_current_meta_connection`: `0`, `provider_read_failure`: `0`
- Runtime token readability: `readable`
- Current Decision OS creatives across audited businesses: `306`
- Sampled creatives: `78`
- Active creatives sampled: `55`
- Deterministic sample rule applied: yes

## Sampled Segment Counts

- `Scale`: `0`
- `Scale Review`: `0`
- `Cut`: `0`
- `Protect`: `6`
- `Watch`: `7`
- `Test More`: `6`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `39`
- `Refresh`: `12`
- `Retest`: `0`

## Zero-Output Counts

- Businesses with zero current Decision OS creatives: `0`
- Businesses with zero `Scale`: `8`
- Businesses with zero `Scale Review`: `8`
- Businesses whose sampled output is entirely contextual-only: `4`

## What The Audit Verified

- Current Decision OS rows now flow for `8` of `8` readable businesses.
- The corrected live-firm sample contains real live labels across `Protect`, `Refresh`, `Test More`, `Watch`, and `Not Enough Data`.
- The largest remaining live issue is not row absence. It is contextual-only gating: `39` sampled rows still surface as `Not eligible for evaluation`.
- Strong relative rows do exist in the live sample: `17` sampled rows are `strong_relative` or `true_scale_candidate`, but `12` of those are still contextual-only.

## Top 5 Systemic Issues

1. Zero live `Scale` and zero live `Scale Review` across all `8` audited businesses.
2. Contextual-only output still dominates the sample: `39` of `78` sampled creatives, including all sampled rows for `company-01`, `company-02`, `company-04`, `company-08`.
3. Strong relative performers are still getting buried before buyer-facing strength surfaces: `12` strong rows are currently contextual-only.
4. Commercial Truth is sparse (`target pack configured` on only `18` sampled rows), but provenance/evidence-source gating is the more immediate live-firm blocker.
5. Instruction-headline alignment is still uneven: `Test More` and `Not Enough Data` render a `Watch` headline, while `Refresh` splits between `Investigate` and `Do not act`.

## Top 5 Apparently Strong Rows The System May Be Mishandling

- `company-01/company-01-creative-02`: current `Not eligible for evaluation`, relative-strength class `true_scale_candidate`, 30d spend `1644.61`, evidence source `unknown`, business validation `missing`.
- `company-01/company-01-creative-03`: current `Not eligible for evaluation`, relative-strength class `true_scale_candidate`, 30d spend `994.7`, evidence source `unknown`, business validation `missing`.
- `company-08/company-08-creative-07`: current `Not eligible for evaluation`, relative-strength class `true_scale_candidate`, 30d spend `497.34`, evidence source `unknown`, business validation `missing`.
- `company-08/company-08-creative-04`: current `Not eligible for evaluation`, relative-strength class `strong_relative`, 30d spend `771.96`, evidence source `unknown`, business validation `missing`.
- `company-05/company-05-creative-06`: current `Watch`, relative-strength class `strong_relative`, 30d spend `6061.11`, evidence source `live`, business validation `missing`.

## Trust Verdict

Current Creative output is improving, but not trustworthy enough yet.

The page is materially better than the prior empty-state failure because rows now flow and live operator labels appear. It is still not good enough across the full readable cohort because four audited businesses surface only contextual-only output and the live sample still has zero `Scale` and zero `Scale Review`.
