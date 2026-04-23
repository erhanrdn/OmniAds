# Creative Calibration Agent Panel Judgments

Last updated: 2026-04-23 by Codex

## Scope

- Sanitized dataset: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`
- Sample coverage: 3 sampled companies, 32 sanitized rows
- Representative panel set: 12 creative rows across the 3 sampled companies
- Panel format: 10 role-based agents reviewed the same 12 rows
- Important: agent agreement is diagnostic input only. It is not policy.

## Roles

1. Performance Media Buyer Agent
2. Creative Strategist Agent
3. Scaling Specialist Agent
4. Kill / Pause Risk Agent
5. Measurement & Attribution Skeptic Agent
6. Profitability / Commercial Truth Agent
7. Fatigue & Lifecycle Agent
8. Campaign Context Agent
9. Legacy Rule Engine Auditor Agent
10. UX Simplification Agent

## Representative Rows

| Creative | Current internal | Current UI | Old rule | Account baseline | Campaign baseline | Commercial truth | Evidence quality |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `company-01-creative-01` | `investigate` | `Campaign Check` | `watch` | strong | weak | target pack missing; country economics/site health/stock pressure missing | `degraded_missing_truth`, watchlist |
| `company-01-creative-06` | `false_winner_low_evidence` | `Not Enough Data` | `test_more` | strong | unavailable | target pack missing; country economics/site health/stock pressure missing | `degraded_missing_truth`, action core |
| `company-01-creative-09` | `investigate` | `Campaign Check` | `scale_hard` | strong | unavailable | target pack missing; country economics/site health/stock pressure missing | `degraded_missing_truth`, watchlist |
| `company-01-creative-12` | `promising_under_sampled` | `Test More` | `pause` | strong | weak | target pack missing; country economics/site health/stock pressure missing | `degraded_missing_truth`, action core |
| `company-02-creative-01` | `fatigued_winner` | `Refresh` | `pause` | strong | strong | target pack missing; country economics/site health/stock pressure missing | `live_confident`, action core |
| `company-02-creative-02` | `protected_winner` | `Protect` | `scale` | strong | strong | target pack missing; country economics/site health/stock pressure missing | `live_confident`, watchlist |
| `company-02-creative-04` | `false_winner_low_evidence` | `Not Enough Data` | `watch` | strong | strong | target pack missing; country economics/site health/stock pressure missing | `degraded_missing_truth`, action core |
| `company-02-creative-11` | `fatigued_winner` | `Refresh` | `scale` | strong | strong | target pack missing; country economics/site health/stock pressure missing | `live_confident`, action core |
| `company-03-creative-01` | `hold_monitor` | `Watch` | `watch` | medium | medium | target pack configured; country economics/site health/stock pressure missing | `degraded_missing_truth`, action core |
| `company-03-creative-02` | `fatigued_winner` | `Refresh` | `watch` | medium | medium | target pack configured; country economics/site health/stock pressure missing | `live_confident`, action core |
| `company-03-creative-04` | `protected_winner` | `Protect` | `scale` | medium | medium | target pack configured; country economics/site health/stock pressure missing | `live_confident`, watchlist |
| `company-03-creative-05` | `false_winner_low_evidence` | `Not Enough Data` | `test_more` | medium | unavailable | target pack configured; country economics/site health/stock pressure missing | `degraded_missing_truth`, action core |

## Role x Creative Segment Matrix

Legend:

- `CC` = Campaign Check
- `NED` = Not Enough Data
- `TM` = Test More
- `R` = Refresh
- `P` = Protect
- `W` = Watch

This matrix is the normalized export of the raw structured judgments from all 10 roles.

| Role | c01 | c06 | c09 | c12 | c201 | c202 | c204 | c211 | c301 | c302 | c304 | c305 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Performance Media Buyer | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Creative Strategist | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Scaling Specialist | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Kill / Pause Risk | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Measurement / Attribution Skeptic | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Profitability / Commercial Truth | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Fatigue / Lifecycle | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Campaign Context | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| Legacy Rule Engine Auditor | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |
| UX Simplification | CC | NED | CC | TM | R | P | NED | R | W | R | P | NED |

## Normalized Judgments

| Creative | 10-agent agreement | Dominant disagreement vs old rule | Likely wrong gate | Missing data | Deterministic rule candidate | UI wording | Fixture |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `company-01-creative-01` | `10/10 -> Campaign Check` | Old `watch` hides thin campaign context | campaign context / peer floor | campaign or ad set context; target pack; economics; site health; stock pressure | route to Campaign Check when account baseline is usable but campaign baseline is below floor | `Campaign Check` | yes |
| `company-01-creative-06` | `10/10 -> Not Enough Data` | Old `test_more` overreads a tiny-spend, one-purchase spike | evidence floor / sample floor | non-ROAS evidence; campaign peer floor | keep Not Enough Data when ROAS spike is unsupported | `Not Enough Data` | yes |
| `company-01-creative-09` | `10/10 -> Campaign Check` | Old `scale_hard` overreads account-relative upside without campaign context | campaign context / peer floor | campaign or ad set context; target pack; economics; site health; stock pressure | route to Campaign Check when campaign baseline is unavailable | `Campaign Check` | yes |
| `company-01-creative-12` | `10/10 -> Test More` | Old `pause` is too punitive for an under-sampled but not disproven creative | campaign peer floor | campaign peer depth; target pack; economics; site health; stock pressure | keep Test More when recent signal is promising but peer depth is below floor | `Test More` | yes |
| `company-02-creative-01` | `10/10 -> Refresh` | Old `pause` misses winner fatigue | fatigue / lifecycle | target pack; economics; site health; stock pressure | Refresh when a strong winner decays against a strong baseline | `Refresh` | yes |
| `company-02-creative-02` | `10/10 -> Protect` | Old `scale` ignores stable-winner protection | winner protection / lifecycle | target pack; economics; site health; stock pressure | Protect when a live-confident winner is stable and non-fatigued | `Protect` | yes |
| `company-02-creative-04` | `10/10 -> Not Enough Data` | Old `watch` underweights a one-purchase false winner | evidence floor / sample floor | non-ROAS evidence; target pack; economics; site health; stock pressure | keep Not Enough Data when the win is a one-purchase illusion | `Not Enough Data` | yes |
| `company-02-creative-11` | `10/10 -> Refresh` | Old `scale` misses fatigue on an existing winner | fatigue / lifecycle | target pack; economics; site health; stock pressure | Refresh when fatigue overrides additional-scale optimism | `Refresh` | yes |
| `company-03-creative-01` | `10/10 -> Watch` | Old `watch` roughly matches, but current reasoning is better scoped | commercial truth / scale floor | country economics; site health; stock pressure | Watch when relative strength exists but absolute floors remain unproven | `Watch` | yes |
| `company-03-creative-02` | `10/10 -> Refresh` | Old `watch` misses fatigue | fatigue / lifecycle | country economics; site health; stock pressure | Refresh when a medium-baseline winner shows fatigue | `Refresh` | yes |
| `company-03-creative-04` | `10/10 -> Protect` | Old `scale` overreads a stable medium-baseline winner | winner protection / lifecycle | country economics; site health; stock pressure | Protect when a medium-baseline winner is stable and live-confident | `Protect` | yes |
| `company-03-creative-05` | `10/10 -> Not Enough Data` | Old `test_more` is too permissive for a singleton campaign baseline | evidence floor / campaign peer floor | non-ROAS evidence; campaign peer depth; country economics; site health; stock pressure | keep Not Enough Data when the campaign baseline is a singleton and recent window is empty | `Not Enough Data` | yes |

## Role-Specific Lens Summary

**Performance Media Buyer**

- Cleanest action rows: `company-02-creative-01`, `company-02-creative-11`, `company-03-creative-02` as `Refresh`; `company-02-creative-02`, `company-03-creative-04` as `Protect`.
- Main disagreements with the old rule are fatigue and stable-winner protection.
- Confidence is lowest on `company-01` because campaign peer depth is too thin.

**Creative Strategist**

- Treats `company-01` primarily as a context-scarcity cluster, not as a loser cluster.
- Supports `Test More` on `company-01-creative-12` because the row remains under-sampled, not disproven.
- Notes that missing commercial truth lowers confidence more than it changes the segment.

**Scaling Specialist**

- Rejects `scale_hard` on `company-01-creative-09` because the campaign baseline is unavailable.
- Rejects old-rule `scale` on both fatigued winners and protected winners.
- Strongest scale-governance signal is “do not promote beyond investigate without campaign context.”

**Kill / Pause Risk**

- Main false positive risk sits in `company-01-creative-06`, `company-02-creative-04`, and `company-03-creative-05`.
- Rejects `pause` on `company-01-creative-12`; rejects `pause` on `company-02-creative-01`.
- Emphasizes that missing commercial truth keeps kill confidence low.

**Measurement & Attribution Skeptic**

- Reads all false-winner rows as sample-floor problems, not measurement wins.
- Sees `company-03-creative-02` and `company-02-* fatigued_winner` rows as genuine lifecycle decay, not attribution drift.
- Treats weak or unavailable campaign baselines as the main reason to stay conservative.

**Profitability / Commercial Truth**

- Commercial truth gaps are broad but not sufficient reason to erase relative-strength diagnoses.
- `Refresh` and `Protect` are still defensible on live-confident winners with strong baselines.
- `Watch` on `company-03-creative-01` remains the correct “relative strength exists, absolute proof incomplete” posture.

**Fatigue / Lifecycle**

- `company-02` is the clearest lifecycle cluster: `Refresh`, `Protect`, `Not Enough Data`, `Refresh`.
- `company-03` is also lifecycle-led, but medium baselines create more uncertainty.
- Confirms that fatigue should route to `Refresh`, not `Cut` or `Scale`.

**Campaign Context**

- `company-01-creative-01` and `company-01-creative-09` are context-gated, not performance-gated.
- `Campaign Check` is driven by missing campaign or ad set context plus weak peer depth.
- `company-01-creative-12` is `Test More` because the campaign cohort is too shallow for stronger action.

**Legacy Rule Engine Auditor**

- Old rule is worst on fatigue and stable-winner protection.
- Old rule only aligns cleanly on `company-03-creative-01`.
- Decision OS is materially better on thin campaign cohorts and on `Protect` / `Refresh` separation.

**UX Simplification**

- `Refresh` and `Protect` are the clearest labels in the set.
- `Campaign Check` and `Not Enough Data` are overloaded; users need reason-class clarity behind the label.
- `Watch` is the least specific label when the real issue is partial commercial truth rather than general monitoring.

## Panel-Wide Takeaways

- The panel did not uncover a live-source or Decision OS data-read blocker. The dataset is valid for diagnosis.
- All 10 roles converged on the current Decision OS segment for all 12 representative rows.
- The main diagnosis is not “wrong segment everywhere.” It is “correct segment more often than old rule, but reasons and deterministic boundaries need hardening.”
- Highest-priority deterministic implementation targets are:
  - campaign-context gating
  - evidence floor / sample floor handling
  - fatigued-winner refresh routing
  - protected-winner routing
  - commercial truth over-gating guardrails
