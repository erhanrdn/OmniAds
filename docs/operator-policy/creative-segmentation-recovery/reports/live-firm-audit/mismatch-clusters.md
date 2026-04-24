# Creative Live-Firm Audit - Mismatch Clusters

Last updated: 2026-04-24 by Codex

## 1. Zero Scale / Zero Scale Review across the corrected sample

- `Scale` count: `0`
- `Scale Review` count: `0`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `8`
- This is now a real live-product question because current Decision OS rows now flow for every audited business.

## 2. Contextual-only businesses driven by evidence-source / provenance gating

- sampled rows in `Not eligible for evaluation`: `39` of `78`
- rows with `evidenceSource = unknown`: `38` of `78`
- businesses whose sampled output is entirely contextual-only: `company-01`, `company-02`, `company-04`, `company-08`
- Panel disagreement clusters consistently point to evidence/provenance gates overriding clearer buyer-facing posture on these businesses.

## 3. Strong-relative rows buried before buyer-facing strength surfaces

- sampled strong-relative / true-scale-candidate rows: `17`
- strong rows currently surfacing as `Not eligible for evaluation`: `12`
- highest-signal examples: `company-01/company-01-creative-02`, `company-01/company-01-creative-03`, `company-08/company-08-creative-07`, `company-08/company-08-creative-04`
- These rows are not blocked by label taxonomy; they are being capped earlier by contextual-only gating, often with missing business validation and unknown evidence source.

## 4. Commercial Truth is sparse, but it is not the sole blocker

- rows with target pack configured: `18` of `78`
- rows with missing business validation: `69` of `78`
- Live rows still surface `Protect`, `Refresh`, `Test More`, and `Watch` when evidence is live, so CT scarcity is important but secondary to provenance gating in this audit.

## 5. Headline / label alignment is still mixed on live data

- `Test More` rows currently render a `Watch` headline in all sampled cases.
- `Not Enough Data` rows also render a `Watch` headline in all sampled cases.
- `Refresh` rows split between `Investigate` and `Do not act` headlines.
- This does not change the underlying segment, but it weakens operator clarity on the live page.

## 6. Old challenger is occasionally directionally useful, but still not trustworthy as policy

- The challenger surfaces `Scale` or stronger action on some contextual-only strong rows, but it ignores provenance and business-validation caps.
- It is clearly worse on protected or fatigued winners where the current system surfaces `Protect` or `Refresh` instead of blunt `Scale` or `Cut` suggestions.
- The audit keeps challenger output comparison-only.

## Bottom Line

The corrected live-firm audit is no longer blocked by missing rows. The remaining mismatch clusters are product-truth clusters:

- zero live `Scale` / `Scale Review`
- contextual-only gating on otherwise strong rows
- label/headline clarity on live data
- lingering old-challenger temptation on rows that are still missing provenance or business validation

These are finally valid product-review questions because the live panel now produces rows across the full readable cohort.
