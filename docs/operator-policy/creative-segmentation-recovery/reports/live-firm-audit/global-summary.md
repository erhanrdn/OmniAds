# Creative Live-Firm Audit - Global Summary

Last updated: 2026-04-24 by Codex

## Audit Status

Blocked by a real current-output source gap.

The live-firm audit found a readable live Meta cohort, but the current Creative Decision OS output layer returned zero creatives for every readable business in the audit window.

## Cohort Summary

- Eligible businesses audited: `8`
- Historical snapshot candidates: `9`
- Runtime-skipped candidates: `1`
- Runtime skip reason: `meta_token_checkpointed = 1`
- Sampled creatives: `0`
- Deterministic sample rule implemented: yes
- Deterministic sample rule actually applied: no, because every audited business returned `0` current Decision OS creatives

## Segment Counts

- `Scale`: `0`
- `Scale Review`: `0`
- `Test More`: `0`
- `Protect`: `0`
- `Watch`: `0`
- `Refresh`: `0`
- `Retest`: `0`
- `Cut`: `0`
- `Campaign Check`: `0`
- `Not Enough Data`: `0`

## Zero-Output Counts

- Businesses with zero `Scale`: `8`
- Businesses with zero `Scale Review`: `8`
- Businesses with zero current Decision OS creatives: `8`

## What The Audit Verified

The blocker is not "no live Meta connectivity."

What was verified:

- runtime token readability status: `readable`
- live cohort recovery logic still works
- `8` businesses passed the current live-readable Meta screen
- each audited business had non-zero screening live creative rows in the last 30 completed days
- current Decision OS evaluation still returned `0` creatives for all `8`

Per-business screening live row counts:

- `company-06`: `64`
- `company-05`: `60`
- `company-04`: `50`
- `company-08`: `40`
- `company-01`: `36`
- `company-07`: `32`
- `company-03`: `16`
- `company-02`: `8`

## Top 5 Systemic Issues

1. Live-readable Meta businesses do not materialize into current Creative Decision OS rows.
2. The audit cannot form even one deterministic creative sample because current output is empty for all audited businesses.
3. `Scale` and `Scale Review` are both zero across the full live-readable cohort, but this is downstream of the zero-row blocker.
4. Old-rule challenger comparison is unavailable at live-firm level because no current rows reached the audited output surface.
5. The panel is not trustworthy enough for operator use without opening raw creative sources because the panel currently collapses to an empty state.

## Top 5 Apparently Strong Things The System May Be Mishandling

No row-level candidates can be listed yet because the current output layer returned zero creatives.

The strongest blocker signals are business-level:

- `company-06`: `64` screening live rows, `0` current Decision OS rows
- `company-05`: `60` screening live rows, `0` current Decision OS rows
- `company-04`: `50` screening live rows, `0` current Decision OS rows
- `company-08`: `40` screening live rows, `0` current Decision OS rows
- `company-01`: `36` screening live rows, `0` current Decision OS rows

## Trust Verdict

Current Creative output is not trustworthy enough at live-firm level.

Reason:

- connectivity is real
- readable live creative rows are real
- current audited output is still empty across the full readable cohort

This is a current source/output blocker, not a policy-threshold question.
