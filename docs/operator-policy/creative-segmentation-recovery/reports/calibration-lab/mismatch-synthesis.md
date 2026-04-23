# Creative Calibration Mismatch Synthesis

Last updated: 2026-04-23 by Codex

## Scope

This synthesis clusters the 10-agent panel findings over the validated sanitized calibration dataset. It does not change policy. It identifies the deterministic implementation targets that now have enough evidence to move from diagnosis into code and fixtures.

## Cluster 1 — Scale Review Suppressed Incorrectly

- Examples: no clean direct winner in the 12-row set; nearest near-miss is `company-01-creative-09`, but campaign context is missing, so suppression is currently correct.
- Root cause: relative upside without campaign baseline is insufficient for `Scale Review`.
- Proposed deterministic fix: do not add a direct scale path until campaign-context and peer-depth prerequisites are explicit.
- Required data: campaign/ad set context, campaign peer depth, commercial truth completeness.
- Fixture candidate: derived fixture, not a direct current-row fixture.
- Overfitting risk: high if derived from account-level upside alone.
- Timing: later.

## Cluster 2 — Scale Too Strict

- Examples: no direct `Scale Review` false negative in the current 12 rows.
- Root cause: current representative set is dominated by `Campaign Check`, `Not Enough Data`, `Refresh`, `Protect`, and `Watch`, not by clean scale-ready rows.
- Proposed deterministic fix: defer until a truly scale-ready fixture exists with sufficient campaign context.
- Required data: explicit campaign benchmark, meaningful evidence floor, commercial truth not required for relative diagnosis but required for strong profit claims.
- Fixture candidate: synthetic or future live sample.
- Overfitting risk: high.
- Timing: later.

## Cluster 3 — Test More Missing

- Examples: `company-01-creative-12`
- Root cause: old rule moved too quickly to `pause`; Decision OS correctly preserved an under-sampled positive path.
- Proposed deterministic fix: when recent signal is promising but campaign peer depth is below floor, route to `Test More`.
- Required data: campaign peer count, recent evidence, baseline floor status.
- Fixture candidate: `company-01-creative-12`
- Overfitting risk: medium.
- Timing: now.

## Cluster 4 — Not Enough Data vs Test More Confusion

- Examples: `company-01-creative-06`, `company-03-creative-05`
- Root cause: one-purchase or singleton-baseline rows can look “promising” if only ROAS is read.
- Proposed deterministic fix: reserve `Test More` for under-sampled positives with some meaningful support; keep `Not Enough Data` for false-winner, one-purchase, or empty-recent-window cases.
- Required data: non-ROAS evidence, recent purchase support, campaign peer floor.
- Fixture candidate: `company-01-creative-06`, `company-03-creative-05`
- Overfitting risk: low to medium.
- Timing: now.

## Cluster 5 — Cut Too Strict or Too Loose

- Examples: no direct Decision OS `Cut` rows in the representative panel.
- Root cause: the validated sample did not surface a confident cut case.
- Proposed deterministic fix: do not change cut behavior from this panel alone.
- Required data: explicit poor-performance fixtures with enough evidence, and clear campaign-context separation.
- Fixture candidate: future fixture needed.
- Overfitting risk: high.
- Timing: later.

## Cluster 6 — Protect Missing

- Examples: `company-02-creative-02`, `company-03-creative-04`
- Root cause: old rule kept pushing `scale` on stable winners.
- Proposed deterministic fix: explicit `Protect` path when winner stability and live confidence are present without fatigue.
- Required data: stable winner signal, fatigue absence, baseline reliability.
- Fixture candidate: `company-02-creative-02`, `company-03-creative-04`
- Overfitting risk: low.
- Timing: now.

## Cluster 7 — Campaign Check Missing

- Examples: `company-01-creative-01`, `company-01-creative-09`
- Root cause: old rule and naive scaling logic do not distinguish account-relative upside from missing campaign/ad set context.
- Proposed deterministic fix: explicit `Campaign Check` when campaign baseline is weak or unavailable or campaign context is missing.
- Required data: campaign/ad set context, campaign peer depth.
- Fixture candidate: `company-01-creative-01`, `company-01-creative-09`
- Overfitting risk: low.
- Timing: now.

## Cluster 8 — Commercial Truth Over-Gating

- Examples: `company-02-creative-01`, `company-02-creative-02`, `company-02-creative-11`, `company-03-creative-01`
- Root cause: missing commercial truth can suppress confidence correctly, but it should not erase relative-strength or lifecycle diagnosis.
- Proposed deterministic fix: allow relative diagnosis (`Refresh`, `Protect`, `Watch`) to survive missing commercial truth, while keeping push/apply and absolute-profit claims blocked.
- Required data: explicit flag split between diagnosis gating and operator action gating.
- Fixture candidate: `company-02-creative-01`, `company-02-creative-02`, `company-03-creative-01`
- Overfitting risk: medium.
- Timing: now.

## Cluster 9 — Account Baseline Missing or Weak

- Examples: not the dominant problem in this panel; account baselines are strong for `company-01` and `company-02`, medium for `company-03`.
- Root cause: most current ambiguity comes from campaign context, not account baseline absence.
- Proposed deterministic fix: no immediate account-baseline rewrite from this sample.
- Required data: future fixtures with weak account baselines but strong campaign context.
- Fixture candidate: future fixture needed.
- Overfitting risk: medium.
- Timing: later.

## Cluster 10 — Campaign Benchmark Missing or Weak

- Examples: `company-01-creative-01`, `company-01-creative-09`, `company-01-creative-12`, `company-03-creative-05`
- Root cause: several rows have weak or unavailable campaign peer cohorts despite usable account baselines.
- Proposed deterministic fix: hard floor around campaign peer depth before stronger action labels.
- Required data: campaign eligible peer count, spend basis, purchase basis.
- Fixture candidate: direct fixtures from the listed rows.
- Overfitting risk: low.
- Timing: now.

## Cluster 11 — Old-Rule Challenger Better Than Decision OS

- Examples: none in the 12-row representative set.
- Root cause: old rule only matched cleanly on `company-03-creative-01`; it did not outperform the current label.
- Proposed deterministic fix: do not import old-rule behavior as truth.
- Required data: if a future direct outperformer appears, treat it as a targeted challenger fixture only.
- Fixture candidate: none yet.
- Overfitting risk: high.
- Timing: later.

## Cluster 12 — Old-Rule Challenger Worse Than Decision OS

- Examples: `company-02-creative-01`, `company-02-creative-02`, `company-02-creative-11`, `company-03-creative-02`, `company-03-creative-04`, `company-01-creative-09`
- Root cause: old rule overweights simple relative ROAS and underweights fatigue, protection, and missing campaign context.
- Proposed deterministic fix: prefer explicit deterministic gates for fatigue, protection, and campaign-context deficiency.
- Required data: none beyond currently available panel evidence.
- Fixture candidate: all listed examples.
- Overfitting risk: low.
- Timing: now.

## Cluster 13 — UI Label Confusion

- Examples: `Campaign Check`, `Not Enough Data`, `Watch`
- Root cause: labels collapse multiple reason classes into one user-facing phrase.
- Proposed deterministic fix: keep labels for now, but pair implementation work with explicit reason-code fixtures and operator-safe wording guidance.
- Required data: reason-code exposure in tests and diagnostics.
- Fixture candidate: all current label groups.
- Overfitting risk: low.
- Timing: now for diagnostics and fixture naming; later for any product wording changes.

## Cluster 14 — Insufficient Data / Unverifiable

- Examples: `company-01-creative-06`, `company-02-creative-04`, `company-03-creative-05`
- Root cause: one-purchase wins, empty recent windows, and singleton campaign baselines remain unverifiable.
- Proposed deterministic fix: hard evidence-floor fixtures and explicit sample-floor routing.
- Required data: non-ROAS evidence and campaign peer floor.
- Fixture candidate: direct fixtures from the listed rows.
- Overfitting risk: low.
- Timing: now.

## Recommended Deterministic Targets

Implement next, in this order:

1. `Campaign Check` for weak or missing campaign context
2. `Not Enough Data` for false-winner / sample-floor cases
3. `Test More` for under-sampled positives
4. `Refresh` for fatigued winners
5. `Protect` for stable winners
6. Commercial-truth split:
   - do not suppress relative diagnosis
   - continue to block push/apply and absolute-profit claims

Do not implement next from this panel alone:

- direct `Scale Review` expansion
- `Cut` retuning
- account-baseline rewrites
