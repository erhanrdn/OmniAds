# Creative Segmentation Calibration Lab - Fixture Candidate Plan

Last updated: 2026-04-23 by Codex

## Status

Fixture planning can proceed, but policy fixture implementation should wait until the data gate passes or until source-health fixtures are added.

## Source-Health Fixtures Needed First

- Current source returns zero Decision OS rows for a sampled company: block calibration and emit source-health reason.
- Snapshot metadata exists but current source cannot produce verifiable rows: block calibration and do not run agent judgment.
- Live provider read fails or is unavailable: mark missing source data instead of treating the company as a valid empty creative sample.
- Warehouse creative facts unavailable: report cross-check unavailable instead of silently passing.

## Policy Fixture Candidates For The Next Pass

- account-relative strong creative + missing Commercial Truth => Scale Review, review-only
- campaign-relative strong creative in explicit selected campaign benchmark => Scale Review
- low spend + weak purchase evidence => Not Enough Data or Test More, not Scale
- low spend + meaningful purchase evidence => not automatically ROAS-only noise
- account average ROAS low, creative materially higher, sufficient evidence => Scale Review
- old-rule says winner, Decision OS says Watch, agent panel agrees winner => fixture candidate
- old-rule says winner, Decision OS says Watch, agents disagree due to low evidence => old rule rejected
- Commercial Truth missing must not suppress relative strength
- Commercial Truth missing must still block push/apply and absolute-profit claims
- Campaign context weakens creative blame
- protected winner remains Protect
- fatigue signal produces Refresh or Watch, not Cut unless evidence supports it
- Campaign Check when campaign/ad set context is the blocker
- Not Enough Data only when evidence is actually thin

## Guardrails

- Do not make old-rule challenger authoritative.
- Do not let agent consensus become policy.
- Do not alter policy thresholds until source data is verified.
- Do not loosen queue, push, or apply safety.
