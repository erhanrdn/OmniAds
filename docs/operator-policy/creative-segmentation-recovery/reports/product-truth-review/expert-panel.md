# Product-Truth Review - Expert Panel

Last updated: 2026-04-24 by Codex

## Scope

This panel reviewed:

- PDF visual evidence from `pdf-company-01` and `pdf-company-02`
- the rerun live top-spend sample across 8 readable businesses
- the sanitized specific case trace for `company-03-creative-07`

The panel is diagnostic only. It is not a vote and does not set policy.

## Representative Cases Reviewed

| Case alias | Current segment | Old challenger | Evidence quality | Summary |
| --- | --- | --- | --- | --- |
| `pdf-company-01-scale-review-card` | Scale Review | unavailable | medium | Screenshot-visible strong card with Scale Review label. |
| `pdf-company-02-protect-cluster` | Protect | unavailable | medium | Screenshot-visible positive rows protected, zero Scale Review. |
| `company-05-creative-02` | Protect | Scale | high | Very high spend, high ROAS, 12 purchases, strong baseline. |
| `company-05-creative-06` | Watch | Scale | high | High spend, high ROAS, 4 purchases, strong baseline, missing validation, campaign-limited. |
| `company-01-creative-01` | Protect | Watch | high | True-scale evidence metadata, 58 purchases, protected winner. |
| `company-01-creative-02` | Watch | Watch | high | Strong-relative row, 21 purchases, no Scale Review. |
| `company-05-creative-03` | Not Enough Data | Cut | high | High spend, 1 purchase, internal block-deploy but soft label. |
| `company-05-creative-05` | Watch | Cut | high | High spend, zero purchases, Watch. |
| `company-08-creative-09` | Not Enough Data | Cut | medium | Weak row with internal block-deploy but soft label. |
| `company-03-creative-07` | Refresh | Watch | high | Specific private case; inactive, strong recent read, account-wide not a relative winner. |

## Role Judgments

### 1. Performance Media Buyer Agent

Judgment:

- Expected segment for `company-05-creative-02`: `Scale Review` or `Protect with explicit scale review note`.
- Expected segment for `company-05-creative-05`: `Cut` or stronger `Watch` with stop-loss instruction.
- Confidence: high.
- Likely wrong gate: protected-winner gate is over-capping active strong relative performers; high-spend zero-purchase gate is too soft.
- Missing data: business validation target and exact campaign objective.
- Deterministic rule candidate: active strong-relative row with sufficient purchases should not be hidden as only `Protect`; high-spend zero-purchase mature row should not remain generic `Watch`.
- Fixture candidate: yes.

### 2. E-commerce Growth Media Buyer Agent

Judgment:

- Expected segment for `company-01-creative-01`: at least `Scale Review` if the row is active and the account can validate margin later.
- Expected segment for `company-05-creative-03`: `Cut`.
- Confidence: high on weak rows, medium on protected winners.
- Likely wrong gate: business validation and stable-winner protection are blocking the buyer from seeing growth opportunities.
- Missing data: gross margin and offer profitability.
- Deterministic rule candidate: keep true `Scale` gated by business validation, but allow `Scale Review` to coexist with "protected winner" evidence when active and strong.
- Fixture candidate: yes.

### 3. Creative Strategist Agent

Judgment:

- Expected segment for `pdf-company-01-scale-review-card`: agree with `Scale Review`.
- Expected segment for `pdf-company-02-protect-cluster`: uncertain; some protected rows look like creative winners worth review.
- Confidence: medium.
- Likely wrong gate: lifecycle label may be overpowering creative-quality signal.
- Missing data: concept fatigue, creative age, and variation history.
- Deterministic rule candidate: separate "do not disturb current ad" from "this concept deserves more controlled scale or variant exploration."
- Fixture candidate: yes.

### 4. Scaling Specialist Agent

Judgment:

- Expected segment for `company-05-creative-06`: `Scale Review` if campaign context is not the primary blocker; otherwise `Campaign Check`, not plain `Watch`.
- Expected segment for `company-01-creative-02`: `Scale Review`.
- Confidence: high.
- Likely wrong gate: strong-relative missing-CT rows are still landing in `Watch`.
- Missing data: explicit campaign benchmark and target CPA/ROAS.
- Deterministic rule candidate: review-only scale admission should fire before generic Watch when relative strength and purchase evidence are strong.
- Fixture candidate: yes.

### 5. Cut / Pause Risk Agent

Judgment:

- Expected segment for `company-05-creative-03`: `Cut`.
- Expected segment for `company-05-creative-05`: `Cut` or at least a clearly urgent weak-performance `Watch`.
- Confidence: high.
- Likely wrong gate: high-spend zero-purchase and high-spend one-purchase cases are not punitive enough.
- Missing data: attribution latency and campaign objective.
- Deterministic rule candidate: mature high-spend zero-purchase rows should not be indistinguishable from normal Watch.
- Fixture candidate: yes.

### 6. Measurement & Attribution Skeptic Agent

Judgment:

- Expected segment for `company-05-creative-05`: `Watch` can be defensible if attribution is delayed, but instruction must state high-spend zero-purchase risk.
- Expected segment for `company-05-creative-03`: not `Not Enough Data`; the data is not thin.
- Confidence: medium-high.
- Likely wrong gate: label semantics, not necessarily raw policy.
- Missing data: conversion delay and attribution window.
- Deterministic rule candidate: split "too early" from "mature weak" in the instruction and label routing.
- Fixture candidate: yes.

### 7. Profitability / Commercial Truth Agent

Judgment:

- Expected segment for true `Scale`: no change; true Scale must stay blocked without business validation.
- Expected segment for strong missing-CT relative winners: `Scale Review`, review-only.
- Confidence: high.
- Likely wrong gate: missing CT is correctly blocking execution but still appears to suppress review-level growth language in some rows.
- Missing data: business target pack.
- Deterministic rule candidate: business validation missing blocks `Scale`, not `Scale Review`, when relative evidence is strong.
- Fixture candidate: yes.

### 8. Fatigue & Lifecycle Agent

Judgment:

- Expected segment for `company-03-creative-07`: `Refresh` is defensible from current account-wide trace.
- Expected segment for `company-05-creative-09`: `Refresh` is defensible despite old challenger `Scale`.
- Confidence: medium-high.
- Likely wrong gate: not broad; some user concern is wording clarity around Refresh vs Pause.
- Missing data: frequency, creative age, and recent fatigue trend.
- Deterministic rule candidate: inactive/fatigued strong rows may need clearer `Refresh`/`Retest` copy, not Scale.
- Fixture candidate: yes for wording.

### 9. Campaign Context Agent

Judgment:

- Expected segment for campaign-limited strong rows: `Campaign Check` if campaign context is truly the blocker.
- Expected segment for `company-05-creative-06`: `Campaign Check` may be clearer than generic `Watch`.
- Confidence: medium.
- Likely wrong gate: campaign context limitation is often recorded but not always surfaced as `Campaign Check`.
- Missing data: whether explicit campaign benchmark was active in the user screenshots.
- Deterministic rule candidate: strong-relative + campaign-limited should prefer `Campaign Check` over generic Watch.
- Fixture candidate: yes.

### 10. UX Simplification Agent

Judgment:

- The taxonomy labels are visible and improved.
- The page still forces manual table reading when `Protect`, `Watch`, and `Not Enough Data` contain both strong opportunity and weak-risk cases.
- Confidence: high.
- Likely wrong gate: one output label is sometimes too broad for the instruction implied by the row.
- Missing data: none for the UI diagnosis.
- Deterministic rule candidate: keep one main output, but make strong-relative and mature-weak instructions unmistakable.
- Fixture candidate: yes.

## Panel Synthesis

Consensus is not policy, but the diagnostic pattern is clear:

- The system is no longer broken at the source layer.
- The UI taxonomy is no longer the main blocker.
- The remaining product issue is policy/gate semantics.
- `Scale Review = 0` across the live sample is not defensible when several active rows have strong baselines, meaningful spend, and purchase evidence.
- `Cut = 0` is not defensible when high-spend weak rows exist.
- `Protect` is sometimes valid, but it is also likely hiding scale-review candidates.
- `Watch` is carrying too many different meanings.
- `Not Enough Data` still sometimes reads too soft for rows whose internal action is already block-deploy.

Recommended next move:

- targeted recalibration, not a full rebuild
- fixture-backed changes around protected-winner vs Scale Review, mature weak vs Cut/Watch, and campaign-limited strong rows
