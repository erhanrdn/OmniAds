# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Deterministic Creative Segmentation implementation pass 4 is complete on the working branch.

The immediate next step is to merge pass 4 through normal PR flow and then start pass 5 on the remaining strict-authority and baseline-quality gaps.

## Calibration Status

Foundation, hardening, data-gate recovery, and the 10-agent calibration panel remain complete.

Current calibration status:

- Data Accuracy Gate: `passed`
- live Meta connectivity recovery: confirmed
- active eligible zero-row case: resolved
- 10-agent panel: complete
- deterministic implementation may proceed: yes

## Pass 1 Result

Pass 1 stayed the clarity pass:

- `Campaign Check` stayed explicit
- `Not Enough Data` vs `Test More` tightened
- `Refresh` and `Protect` stayed explicit
- `Watch` survived partial Commercial Truth where relative diagnosis was still valid
- first-pass label and bucket alignment improved

## Pass 2 Result

Pass 2 made baseline-backed review work real:

- account-relative baseline admission is stricter before policy can use it
- explicit benchmark-scope contract support is active in the current read path
- default benchmark scope remained account-wide
- a selected campaign filter alone still did not silently change benchmark authority
- `Scale Review` went live as review-only under conservative conditions

## Pass 3 Result

Pass 3 made benchmark authority explicit in the product:

- explicit benchmark-scope operator control is now active on the Creative page
- campaign-relative re-evaluation only happens when the operator explicitly enables it
- benchmark scope and reliability are visible in the UI
- relative strength vs missing business validation now reads more clearly

## What Was Implemented In Pass 4

Pass 4 implemented the next authority gap without widening the safety model broadly:

- true `Scale` is now live under strict, fixture-backed conditions
- `Scale Review` remains the review-only relative-winner state
- business validation now explicitly promotes, caps, or demotes relative winners
- baseline reliability now directly influences whether `Scale` or `Scale Review` can fire
- report text now reflects benchmark reliability and business-validation caps more honestly
- the operator surface still resolves to one main outcome per row

## Whether Explicit Campaign Benchmark Control Is Active

Yes.

Current behavior:

- default remains account-wide
- campaign scope appears only when the current filtered context resolves to a single campaign
- selected campaign filters do not silently switch benchmark authority
- switching back to account scope restores account-wide comparison

## Whether Campaign-Relative Re-evaluation Works

Yes.

Current behavior:

- account scope continues to use account-wide relative benchmarking
- explicit campaign scope re-evaluates rows against the selected campaign cohort only
- thin or missing campaign cohorts still do not receive false promotion authority

## Whether True `Scale` Is Now Live

Yes.

Current direct-scale floor:

- live evidence
- provenance and trust present
- preview truth not degraded for aggressive action
- no campaign/ad set context blocker
- favorable business validation
- strong relative baseline reliability
- at least `6` eligible peer creatives
- relative spend basis at least `500`
- relative purchase basis at least `8`
- spend at least `max(300, 1.3 x median peer spend)`
- purchases at least `6`
- ROAS at least `1.6 x` median peer ROAS
- CPA not worse than median peer CPA when CPA basis exists

## When `Scale Review` Fires Instead

`Scale Review` remains live and review-only.

It now covers strong relative winners when:

- relative benchmark evidence is good enough for comparison
- campaign context is not the primary blocker
- but direct `Scale` is not yet justified

That includes:

- missing Commercial Truth / missing business validation
- medium benchmark reliability that is good enough for review but not direct promotion

Current review floor:

- relative baseline reliability = `medium` or `strong`
- at least `3` eligible peer creatives
- relative spend basis at least `150`
- relative purchase basis at least `3`
- spend at least `max(80, 0.2 x median peer spend)`
- purchases at least `2`
- ROAS at least `1.4 x` median peer ROAS
- CPA not worse than `1.2 x` median peer CPA when CPA basis exists

## Baseline Reliability Impact

Current behavior:

- `strong` reliability can support `Scale` when all other direct-scale conditions are met
- `medium` reliability can support `Scale Review`, but not direct `Scale`
- `weak` or `unavailable` reliability cannot produce `Scale` or false `Scale Review`
- report copy now surfaces thin or medium benchmark authority more explicitly

## Business-Validation Promotion / Demotion Rules

Current behavior:

- favorable business validation can promote a strong relative winner from `Scale Review` to `Scale`
- missing business validation keeps the relative winner visible as `Scale Review`
- unfavorable business validation demotes the row out of `Scale` into `Watch`
- missing Commercial Truth still blocks push/apply and absolute-profit claims

## How Relative Strength vs Business Validation Is Now Shown

The surface now shows both parts explicitly instead of blending them together:

- `Scale` says the creative is a strong relative performer and that business validation supports a controlled scale move
- `Scale Review` says the creative is a strong relative performer but still review-only
- demoted relative winners stay visible as `Watch` with an explicit note that business validation does not support a direct scale move yet

This keeps one main operator outcome per row while making the cap legible.

## Fixture Summary

Fixture-backed coverage now includes:

- strong account-relative winner + favorable business validation => `Scale`
- same winner + missing Commercial Truth => `Scale Review`
- same winner + unfavorable business validation => `Watch`
- same winner + medium baseline => `Scale Review`
- same winner + weak campaign context => `Campaign Check`
- strong explicit campaign benchmark => campaign-relative `Scale`
- benchmark-reliability follow-through in report text
- row-label and bucket alignment across `Scale`, `Scale Review`, `Campaign Check`, `Watch`, `Protect`, `Refresh`, `Test More`, and `Not Enough Data`

## Safety Status

Still preserved:

- old-rule challenger is non-authoritative
- `Scale Review` remains review-only
- `Scale` does not invent budget, bid, or amount guidance
- `Scale` does not unlock apply authority
- missing provenance still blocks queue/apply/push
- non-live/demo/snapshot/fallback evidence stays non-push eligible
- selected reporting range remains analysis context only
- Command Center safety was not loosened

## Remaining Gaps

Still deferred for pass 5 or later:

- broader scale-path coverage beyond the current strict floor
- deeper baseline-quality and thin-cohort work
- wider Commercial Truth policy refinements beyond the current promotion/demotion split
- any threshold retuning beyond the fixture-backed scale ladder
- any policy import from the old challenger

## Remaining Blockers

No correctness blocker is currently known for implementation pass 4 itself.

Non-blocking follow-up remains:

- reconnect or refresh the Meta credential for `candidate-01`
- `meta_creative_daily` is still empty, so warehouse-level creative verification remains unavailable

## Whether Pass 5 Is Needed

Yes.

Pass 5 should focus on:

1. whether any additional true-`Scale` coverage is safely fixture-backed
2. deeper benchmark-quality and thin-cohort honesty
3. any remaining clarity gaps between relative diagnosis, business validation, and execution authority

## Claude Review Status

Not yet.

This pass stayed inside the already approved calibration direction and did not change product direction broadly enough to justify an external review.

## Exact Next Action

1. merge implementation pass 4 through normal PR flow
2. start deterministic implementation pass 5 on the remaining strict-authority and deeper baseline-quality gaps
3. keep `Scale Review` review-only and keep `Scale` on the current hard floor until broader fixtures justify anything wider

## Reports

- calibration final: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/final.md`
- mismatch synthesis: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/mismatch-synthesis.md`
- fixture candidate plan: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/fixture-candidate-plan.md`
- implementation pass 1 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-1-final.md`
- implementation pass 2 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-2-final.md`
- implementation pass 3 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-3-final.md`
- implementation pass 4 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-4-final.md`

## Last Updated By Codex

- completed deterministic Creative Segmentation implementation pass 4 on a narrow, fixture-backed scope
- activated a strict true-`Scale` path on top of the existing `Scale Review` path
- made business validation explicitly promote, cap, or demote strong relative winners
- tightened baseline-reliability follow-through in policy and report text
- preserved one-row-one-main-outcome operator clarity
