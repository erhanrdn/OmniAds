# Creative Segmentation Calibration Lab - Agent Panel Judgments

Last updated: 2026-04-23 by Codex

## Status

Not run.

The Data Accuracy Gate failed, so the 10 media-buyer-agent panel was intentionally skipped. Running media-buyer judgment on an unverified dataset would violate the calibration protocol and risk converting source availability problems into policy recommendations.

## Planned Roles

The next valid run should use these roles only after the data gate passes:

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

## Required Judgment Schema

When unblocked, each judgment must include:

- creative alias
- current Decision OS segment
- old-rule challenger segment
- expected user-facing segment
- confidence
- evidence quality
- reason for disagreement
- missing data
- likely wrong gate, if any
- deterministic rule candidate
- proposed UI wording
- fixture recommendation
- uncertainty flag

## Guardrail

Agent agreement must diagnose failure modes only. It must not become policy, push safety, UI output, or old-rule ground truth.
