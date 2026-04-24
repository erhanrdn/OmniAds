# Creative Live-Firm Audit - Agent Panel

Last updated: 2026-04-24 by Codex

## Panel Status

Complete.

The corrected-source rerun produced `78` sampled creatives across `8` readable businesses, so the full 10-role media-buyer panel could run on live output rather than an empty state.

Companion structured artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/agent-panel-judgments.json`

That artifact contains the full per-sampled-creative, per-agent structured judgments in sanitized form. No majority vote is used as policy.

## Role Summaries

- Performance Media Buyer Agent: disagreements `43`, uncertain `31`, fixture flags `43`, top disagreement gate `evidence_source_gate_overrides_operational_segment`
- Creative Strategist Agent: disagreements `37`, uncertain `18`, fixture flags `61`, top disagreement gate `evidence_source_gate`
- Scaling Specialist Agent: disagreements `33`, uncertain `22`, fixture flags `26`, top disagreement gate `evidence_source_gate`
- Kill / Pause Risk Agent: disagreements `0`, uncertain `10`, fixture flags `55`, top disagreement gate `none`
- Measurement & Attribution Skeptic Agent: disagreements `3`, uncertain `27`, fixture flags `39`, top disagreement gate `mature_negative_routing`
- Profitability / Commercial Truth Agent: disagreements `4`, uncertain `20`, fixture flags `36`, top disagreement gate `protected_winner precedence is outranking business_validation demotion`
- Fatigue & Lifecycle Agent: disagreements `52`, uncertain `40`, fixture flags `52`, top disagreement gate `evidence_source_gate_hides_lifecycle_state`
- Campaign Context Agent: disagreements `1`, uncertain `57`, fixture flags `56`, top disagreement gate `light_sample_gate`
- Legacy Rule Engine Auditor Agent: disagreements `0`, uncertain `29`, fixture flags `74`, top disagreement gate `none`
- UX Simplification Agent: disagreements `0`, uncertain `7`, fixture flags `78`, top disagreement gate `none`

## Main Disagreement Clusters

1. **Contextual-only gating overrides buyer-facing posture.** Performance, strategy, scaling, and fatigue roles all pushed back most on rows that currently surface as `Not eligible for evaluation` even when relative strength looks meaningful.
2. **Lifecycle-heavy roles see more `Refresh` pressure than the current surface exposes.** The fatigue role produced the highest disagreement count and repeatedly called out contextual-only gating that hides lifecycle posture.
3. **Safety-oriented roles mostly agree with the current corrected output.** Kill/Pause Risk, Legacy Auditor, Campaign Context, and UX Simplification were close to current segmentation, which suggests the remaining issues are narrower than the earlier empty-state blocker.
4. **Profitability disagrees mainly on protected winners with weak or missing business validation.** It still did not advocate `Scale`; it mainly softened `Protect` into `Watch` on a few rows.
5. **Measurement disagreements are narrow.** It only objected to three rows, mostly where `Not Enough Data` still looks too soft or too thin for the spend level.

## Most Important Live-Firm Disagreements

- `company-01/company-01-creative-02` and `company-01/company-01-creative-03`: high-spend strong-relative rows still surface as `Not eligible for evaluation` because evidence source is unknown.
- `company-08/company-08-creative-07`: `true_scale_candidate` in the sample but still contextual-only; several panel roles wanted a clearer buyer-facing posture even while preserving safety.
- `company-05/company-05-creative-06`: current `Watch`, old challenger `Scale`; panel disagreement focused on whether this should stay in watchful review versus a clearer scale-review posture.
- `company-05/company-05-02` and `company-05/company-05-08`: current `Protect`, old challenger `Scale`; profitability was the main dissenting role, while most roles accepted the protected-winner interpretation.
- `company-06/company-06-03`: current `Test More`; fatigue roles often wanted a stronger lifecycle caveat or `Refresh`, while other roles accepted the current test posture.

## Policy Note

No majority vote was used.

The panel is diagnosis only. Any follow-up product change still needs deterministic justification and a separate implementation pass.
