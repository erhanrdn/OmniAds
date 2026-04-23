# Creative Live-Firm Audit - Final

Last updated: 2026-04-24 by Codex

## 1. Branch / PR Status

- Branch: `feature/adsecute-creative-live-firm-audit`
- PR: draft, opened after validation in this pass
- Merge status: do not merge in this pass

## 2. Cohort Summary

- Historical snapshot candidates: `9`
- Runtime-eligible live-readable Meta businesses: `8`
- Runtime-skipped candidates: `1`
- Runtime skip reason: `meta_token_checkpointed = 1`
- Sampled creatives: `0`

## 3. Sample Selection Rule

Intended deterministic rule per business:

1. last 30 completed days, excluding today
2. rank currently active creatives first
3. within active creatives, sort by 30-day spend descending
4. if fewer than 10 active creatives exist, fill with non-active creatives by 30-day spend descending
5. take up to the top 10 creatives

Outcome in this pass:

- the rule was implemented
- the rule could not produce samples because every audited business returned `0` current Decision OS creatives

## 4. Global Segment Counts

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

## 5. Main Failure Patterns

1. live readability is real, but current Creative output is empty
2. all `8` audited businesses have zero `Scale` and zero `Scale Review`
3. no row-level audit sample can be formed
4. row-level media-buyer disagreement cannot be measured because no current rows are emitted
5. the panel is not trustworthy enough without opening the raw creative source path

## 5a. Most Likely Current Technical Cause

The audited blocker sits before label policy.

Code-path reading says the empty-state branch fires only when the current Decision OS input row set is empty.

Most plausible causes in current code:

- `decisionWindows.primary30d` does not resolve to the same usable row set as the screened live window
- a persisted zero-row snapshot is being accepted for the primary creative window
- malformed upstream creative rows lose `creativeId` before the Decision OS builder, which looks less likely than the first two

## 6. Most Important Live-Firm Disagreements

No row-level disagreements could be collected.

The disagreement is at system level:

- the runtime screen says live-readable businesses exist
- the current Creative output layer says there are no creatives to evaluate

## 7. Whether Current Creative Output Is Trustworthy Enough

No.

Reason:

- a trustworthy live-firm panel cannot collapse to zero rows across the entire readable cohort

## 8. Whether Product-Level Remediation Is Needed

Yes.

The next fix should target the current source/output gap, not policy thresholds.

## 9. Recommended Next Action

1. isolate one healthy audited alias with non-zero screening live rows
2. trace why current Decision OS `primary30d` creative rows are empty for that alias
3. restore current creative row availability in the audited decision window
4. rerun the live-firm audit before any new policy tuning

## 10. Whether This Is Ready For Claude Product Review

Yes.

It is ready as a blocker review:

- the audit is complete enough to show the live-readability vs current-output mismatch
- the missing step is not more hand-picked examples
- the missing step is source/output remediation
