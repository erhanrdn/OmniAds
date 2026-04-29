# ChatGPT Pro Review: Canonical Decision Engine Refactor

## 1. Source Note

This file preserves the ChatGPT Pro review content provided in the working conversation and the follow-up approved-with-changes recovery notes. The final recovery prompt's appended review block was a placeholder, so this document records the review text and requirements available in the thread.

Primary audit reference: [CONSOLIDATED-FINDINGS.md](https://github.com/erhanrdn/OmniAds/blob/main/docs/team-comms/happy-harbor/CONSOLIDATED-FINDINGS.md).

## 2. Net Decision

Adsecute is not currently behaving like one creative decision product. It is mixing three decision philosophies in the same UI. The audit evidence is explicit:

- Internal three-system Fleiss kappa: `-0.114`.
- Triple agreement across Sys1/Sys2/Sys3: `0/75`.
- Sys3 emitted `diagnose` for `58/75` creatives.

The recommended base is rollback SHA `96bd0386208868b18d9763d64917ab9d4aa22b53`. Do not cherry-pick the Happy Harbor verdict resolver from current `main`. Reuse only audit datasets, golden tests, score simulation ideas, and safe utility pieces.

## 3. System Roles

- Sys1 Legacy Decision OS stays as a feature extractor: lifecycle, fatigue memory, winner memory, and the legacy `buildScore()` score.
- Sys2 Operator Surface stays as scorecard, readiness, explanation, and operator workflow metadata.
- Sys3 V2 Preview is removed from primary production UI and may only remain as diagnostic flags, trust warnings, and measurement context.
- The legacy 0-100 score and Hook / Watch / Click / CTA / Offer / Convert sub-score system should be reactivated as the core of the canonical resolver.

## 4. Architecture Recommendation

Recommended path: X hotfix plus Z+ canonical scorecard resolver.

- X: immediately remove Sys3 from primary UI and consolidate primary action surfaces.
- Z+: build a deterministic scorecard resolver using legacy score, six sub-scores, lifecycle/fatigue memory, evidence maturity, economics, peer ratios, and readiness modifiers.
- Reject Y specialized routing because it keeps the multi-engine contradiction problem under a more complex router.
- Q persona selector can come later, at business/settings level after calibration. It must not be row-level.

## 5. Calibration Recommendation

Start with rule-based grid search and a cost-sensitive objective. Move to hierarchical Bayesian calibration only after sufficient account/user labels. Move to ML only after enough multi-business feedback data exists.

User el-rate data is mandatory before expecting `>=75%` Claude-style/user agreement. Calibration must use asymmetric loss:

- `scale <-> cut` is catastrophic.
- `diagnose(blocked) <-> scale/protect` is critical because it blocks actionable spend.
- `refresh <-> protect` and `refresh <-> test_more` are workflow-adjacent, not catastrophic.
- The action enum must not be treated as ordinal.

## 6. Approved-With-Changes Requirements

The recovery review identified 12 must-fix items:

- Gap A: Replace enum-distance severe override detection with an explicit action/readiness severity matrix.
- Gap B: UI surfaces must read `canonicalDecision.action` under the canonical flag instead of Sys1/Sys2/Sys3 fields.
- Gap C: Existing snapshots without `canonicalDecision` must not crash and must show a fallback/re-run state.
- Gap D: Resolver and table must share the existing score/sub-score formulas.
- Gap E: Feature flag must support server-side sticky per-business assignment, admin allow/block lists, and a kill switch.
- Gap F: Calibration key must include `businessId`, `adAccountId`, `objectiveFamily`, `formatFamily`, and calibration version.
- Gap G: El-rate sample generation must enforce stratification and include at least 20% ordinary random controls.
- Gap H: Bayesian confidence must have explicit low-N shrinkage and caps.
- Gap I: Golden tests must run all 75 audit rows and guard against class collapse.
- Gap J: Missing target pack must never create blocked blanket `diagnose`.
- Gap K: Stale calibration must fall back to global defaults and surface a stale diagnostic.
- Gap L: LLM enrichment may only change explanation fields, never canonical action/readiness/confidence.

## 7. Engineering Safeguards

- Confidence must be Bayesian: evidence maturity, signal consistency, and calibration freshness with low-N shrinkage.
- Critical high-confidence overrides on mature spend trigger real-time review/alarm; routine feedback batches weekly.
- Rollout stays behind `?canonicalResolver=v1` plus server-side cohorting and kill switch.
- Default production behavior remains legacy until review and staged rollout approval.
