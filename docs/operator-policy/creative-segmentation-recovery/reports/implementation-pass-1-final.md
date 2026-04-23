# Creative Segmentation Implementation Pass 1

Last updated: 2026-04-23 by Codex

## Scope

This pass implemented only the highest-confidence calibration fixes already supported by the data gate, current decision trace, agent panel, and fixture candidate plan.

No threshold tuning was introduced.

No broad segmentation rewrite was introduced.

Old-rule challenger remained read-only and non-authoritative.

## Implemented In Pass 1

### 1. `Not Enough Data` vs `Test More`

- tightened under-sampled positive handling so one-purchase or otherwise thin positives stay `Not Enough Data`
- preserved `Test More` for under-sampled positives with meaningful support
- kept low-spend but multi-purchase positives out of ROAS-only false-winner logic

### 2. `Watch` under partial Commercial Truth

- preserved relative diagnosis when commercial truth is missing but a readable relative baseline exists
- added a deterministic `hold_monitor` / `Watch` path for rows that are not strong enough for `Scale Review`
- kept push/apply closed under missing commercial truth

### 3. `Campaign Check`

- preserved `Campaign Check` as the explicit user-facing outcome when campaign or ad set context is the primary blocker
- hardened surface wording so context-check rows do not read like generic refresh work

### 4. `Refresh` for fatigued winners

- kept fatigued winners on a `Refresh` review path even when commercial truth is missing
- preserved manual review safety for refresh decisions

### 5. `Protect` for stable winners

- kept stable winners on the explicit `Protect` path
- preserved do-not-touch and blocked-from-push behavior

### 6. Label / bucket alignment

- renamed the Creative watch bucket from `Test` to `Watch`
- kept `Campaign Check` and `Refresh` inside the neutral `Check` bucket
- changed the blocked-bucket headline from refresh-specific wording to neutral check wording
- pinned `Scale Review` to remain review-only in the `Watch` bucket, not an act-now lane

## Fixture Coverage Added

Added or expanded fixture-backed tests for:

- campaign-check context-gap rows
- one-purchase thin-evidence rows
- under-sampled positive rows
- partial-commercial-truth watch rows
- fatigued-winner refresh rows
- stable-winner protect rows
- policy-blocked rows that must not read like `Not Enough Data`
- scale-review review-only bucket placement
- row-label and bucket alignment across the implemented pass-1 clusters

## Intentionally Deferred

Still deferred for pass 2 or later:

- direct `Scale` / `Scale Review` expansion
- cut retuning
- campaign/account baseline rewrites
- broader commercial-truth policy changes beyond diagnosis-vs-action split
- any policy import from the old rule challenger

## Safety Status

Still preserved:

- old-rule challenger is comparison-only
- missing provenance still blocks queue/apply/push
- non-live/demo/snapshot/fallback evidence stays non-push eligible
- selected reporting range remains analysis context only
- `Scale Review` remains review-only
- `Refresh` and `Protect` remain manual-review or no-touch states, not direct push actions

## Validation

Ran:

- `npx vitest run lib/creative-operator-policy.test.ts`
- `npx vitest run lib/creative-operator-surface.test.ts`
- `npx vitest run lib/creative-decision-os.test.ts lib/creative-old-rule-challenger.test.ts lib/operator-prescription.test.ts lib/command-center.test.ts`
- `npm test`
- `npm run build`
- `npx tsc --noEmit` after build regenerated `.next/types`

Additional checks:

- `git diff --check`
- hidden/bidi/control scan on touched docs/code
- raw ID scan on updated docs/code

## Result

Implementation pass 1 is narrow but real:

- row labels are less contradictory
- context gaps surface explicitly
- thin evidence is separated from under-sampled positives
- fatigue/protect/watch states are clearer
- safety posture is unchanged

Deterministic implementation pass 2 is still needed for scale-related and broader baseline work.
