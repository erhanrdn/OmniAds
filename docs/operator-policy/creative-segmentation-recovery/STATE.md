# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Live-firm Creative Segmentation product-truth audit is complete as a diagnosis branch.

The next step is not new policy tuning. The next step is a focused review of the live-readability vs current-output blocker.

## Program Status

- foundation: complete
- foundation hardening: complete
- calibration data gate: `passed`
- live Meta cohort recovery: complete
- original 10-agent calibration panel: complete
- implementation pass 1: merged
- implementation pass 2: merged
- implementation pass 3: merged
- implementation pass 4: merged
- implementation pass 5: merged
- implementation pass 6: merged
- implementation pass 6 hardening: merged
- live-firm audit: complete on branch, pending draft PR review

## Live-Firm Audit Status

Completed with a blocker.

Audit outcome:

- currently connected and readable Meta businesses: `8`
- sampled creatives: `0`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `8`

## What The Audit Verified

The blocker is not lack of live Meta connectivity.

Verified:

- runtime token readability status: `readable`
- historical snapshot candidates: `9`
- runtime-eligible readable businesses: `8`
- runtime-skipped candidates: `1`
- runtime skip reason: `meta_token_checkpointed = 1`
- every audited business had non-zero screening live creative rows in the 30-day audit window
- every audited business then returned `0` current Decision OS creatives

Per-business blocker pattern:

- `company-01`: `36` screening live rows, `0` current Decision OS rows
- `company-02`: `8` screening live rows, `0` current Decision OS rows
- `company-03`: `16` screening live rows, `0` current Decision OS rows
- `company-04`: `50` screening live rows, `0` current Decision OS rows
- `company-05`: `60` screening live rows, `0` current Decision OS rows
- `company-06`: `64` screening live rows, `0` current Decision OS rows
- `company-07`: `32` screening live rows, `0` current Decision OS rows
- `company-08`: `40` screening live rows, `0` current Decision OS rows

## Top Systemic Problems

1. live-readable businesses do not materialize into current Creative Decision OS rows
2. deterministic sampling cannot produce even one audited creative row
3. `Scale` and `Scale Review` are both zero across the full readable cohort, downstream of the zero-row blocker
4. old challenger comparison cannot run at live-firm level because current rows are absent
5. the current panel is not trustworthy enough without raw source inspection

Most likely current technical causes:

- `decisionWindows.primary30d` mismatch versus the screened live window
- a persisted zero-row snapshot being accepted for the primary decision window

## Whether Current Creative Segmentation Is Trustworthy Enough

No.

Reason:

- current live-firm output collapses to zero rows across all readable businesses

## Whether The Work Is Ready For Claude Product Review

Yes.

It is ready as a live-firm blocker review, not as a new policy-tuning pass.

## Whether Another Implementation Pass Is Needed

Not yet.

Do not start pass 7 from this branch. The blocker is current source/output availability, not another calibrated taxonomy gap.

## Next Recommended Action

1. review the draft live-firm audit PR
2. trace one healthy audited alias from screening live rows into the current Creative Decision OS source path
3. restore non-empty current Decision OS creative rows for readable businesses
4. rerun the live-firm audit after that remediation

## Reports

- calibration final: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/final.md`
- implementation pass 6 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-6-final.md`
- implementation pass 6 hardening final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-6-hardening-final.md`
- live-firm global summary: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/global-summary.md`
- live-firm per-business summary: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/per-business-summary.md`
- live-firm agent panel: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/agent-panel.md`
- live-firm mismatch clusters: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/mismatch-clusters.md`
- live-firm final: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/final.md`
- live-firm sanitized artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Last Updated By Codex

- built a deterministic live-firm audit helper and sanitized artifact path
- verified `8` readable current Meta businesses in production-equivalent runtime
- confirmed every audited business had non-zero screening live creative rows
- found `0` current Decision OS creatives across all `8` readable businesses
- recorded the blocker for Claude and supervisor review without changing Creative policy logic
