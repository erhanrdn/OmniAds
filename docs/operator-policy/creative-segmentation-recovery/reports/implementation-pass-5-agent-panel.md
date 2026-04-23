# Creative Segmentation Pass 5 Holdout Agent Panel

Last updated: 2026-04-23 by Codex

## Scope

This pass reran the role-based media-buyer panel on the pass-5 holdout slice only.

Panel input:

- `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-holdout-validation.json`
- `representativeHoldoutRows = 8`

Important:

- this panel is diagnosis only
- agent agreement does not become policy
- old-rule challenger stayed comparison-only

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

## Row-Level Synthesis

### `company-03-creative-01`

- current: `Campaign Check`
- panel reading: broad agreement with current
- reason: strong account-relative read, but campaign baseline is weak and campaign/ad set context is the real blocker
- old challenger: worse; generic `watch` hides the context problem
- fixture candidacy: yes

### `company-01-creative-14`

- current: `Refresh`
- panel reading: broad agreement with current
- reason: fatigue is the real driver; this should not become `Pause`, `Watch`, or any scale-like label
- old challenger: worse; `pause` over-punishes a fatigue replacement case
- fixture candidacy: yes

### `company-01-creative-01`

- current: `Protect`
- panel reading: broad agreement with current
- reason: stable winner, no meaningful case for scale or context review
- old challenger: worse; under-protects a shipped winner
- fixture candidacy: yes

### `company-01-creative-18`

- current: `Test More`
- panel reading: mixed
- disagreement cluster:
  - strategist / profitability lenses accept `Test More`
  - performance / fatigue lenses think `Watch` may be safer because the row is still weak versus baselines and already carries fatigue watch pressure
- conclusion: not a safe tuning candidate from this holdout alone
- fixture candidacy: boundary-only

### `company-03-creative-02`

- current: `Not Enough Data`
- panel reading: mixed
- disagreement cluster:
  - commercial-truth and strategist lenses accept current conservatism
  - performance / fatigue / measurement lenses argue that meaningful spend plus zero purchases may be better described as a weak `Watch` than generic lack of data
- conclusion: naming and evidence-floor boundary remain open, but not with enough confidence to retune in pass 5
- old challenger: clearly worse; `kill` overreacts
- fixture candidacy: boundary-only

### `company-01-creative-03`

- current: `Watch`
- panel reading: most important remaining disagreement
- disagreement cluster:
  - strategist, measurement, profitability, and campaign-context lenses see a plausible `Scale Review` boundary case
  - scaling specialist and legacy-rule audit keep it at `Watch`
  - performance and fatigue lenses would even lean `Protect` because fatigue is only `watch`, not `fatigued`
- core diagnosis: this row is strong relative to peers, but business validation is missing and fatigue/watch pressure still exists
- conclusion: real boundary case, but not single-direction enough for safe deterministic tuning in pass 5
- fixture candidacy: yes, as a non-tuned disagreement fixture

### `company-01-creative-02`

- current: `Protect`
- panel reading: broad agreement with current
- reason: strong stable-winner behavior; absence of a campaign baseline does not matter because this is not an aggressive action path
- old challenger: worse
- fixture candidacy: yes

### `company-01-creative-04`

- current: `Watch`
- panel reading: broad agreement with current
- reason: positive row, but not far enough above baseline to justify a stronger label; fatigue watch pressure should stay visible
- old challenger: tied, not better
- fixture candidacy: maybe

## Panel-Level Takeaways

High-confidence confirmations:

- `Campaign Check` is now surviving live holdout evaluation where context really is the blocker
- `Refresh` for fatigued winners is holding
- `Protect` for stable winners is holding
- the old challenger is still worse on context, protection, and fatigue handling

Remaining disagreement clusters:

1. `Watch` vs `Scale Review` or `Protect` for strong relative winners that still lack business validation
2. `Test More` vs `Watch` for under-sampled positives with early fatigue/watch pressure
3. `Not Enough Data` vs `Watch` when spend is meaningful but conversion proof is still absent

Panel conclusion:

- there is no major data-accuracy or taxonomy failure left in the holdout sample
- there is also no single high-confidence tuning candidate strong enough to justify pass-5 policy retuning
