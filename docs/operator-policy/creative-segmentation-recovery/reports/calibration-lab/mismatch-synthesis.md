# Creative Segmentation Calibration Lab - Mismatch Synthesis

Last updated: 2026-04-23 by Codex

## Status

Blocked at data accuracy. Mismatch synthesis is limited to source and gate issues. No media-buyer judgment clusters were produced.

## Source-Level Clusters

### Insufficient Data / Unverifiable

- Example: one sampled company returned zero current Decision OS rows.
- Root cause: current source path did not provide verifiable rows for every sampled company.
- Proposed fix: add source-health reporting that distinguishes empty provider data, snapshot bypass, live provider failure, and preview-only degradation.
- Required data: source status, snapshot status, row count, provider error class, and whether performance metrics exist separately from preview metadata.
- Fixture candidate: sampled company with available snapshot metadata but zero current Decision OS rows should surface a data-source blocker, not run calibration.
- Overfitting risk: low; this is a source-validity gate.
- Timing: now, before policy calibration.

### Account Baseline Present But Relative Winners Still Suppressed

- Example: exported rows had strong account baselines, while old-rule challenger labeled several rows `scale` or `scale_hard`; Decision OS emitted no Scale or Scale Review in the sample.
- Root cause: not policy-proven yet because data gate failed and Commercial Truth/evidence-source blockers were active.
- Proposed fix: defer threshold changes; after source gate passes, inspect whether `scale_review` is suppressed by correct hard blockers or by over-gating.
- Required data: verified current rows, baseline metadata, evidence source, provenance/trust metadata, Commercial Truth availability, and campaign/ad set context.
- Fixture candidate: account-relative strong creative with missing Commercial Truth but otherwise valid live evidence should remain Scale Review and review-only.
- Overfitting risk: medium if tuned from the blocked sample.
- Timing: later, after data gate passes.

### UI Label Confusion

- Example: exported rows include "Not eligible for evaluation", "Not Enough Data", "Refresh", "Protect", and "Test More"; no Scale Review appeared.
- Root cause: readable labels are improved from hardening, but full live usefulness cannot be judged until data is verified.
- Proposed fix: defer UI wording changes except source-health notes that clarify when a row is not eligible because source data is missing.
- Required data: verified rows and agent panel judgments.
- Fixture candidate: policy/system-ineligible row must not masquerade as evidence-thin Not Enough Data.
- Overfitting risk: medium.
- Timing: later for taxonomy refinement; now for source-health clarity.

## Required Clusters Not Produced

The following required policy clusters cannot be responsibly scored until the data gate passes:

- scale_review suppressed incorrectly
- scale too strict
- Test More missing
- Not Enough Data vs Test More confusion
- Cut too strict or too loose
- Protect missing
- Campaign Check missing
- Commercial Truth over-gating
- account baseline missing or weak
- campaign benchmark missing or weak
- old-rule challenger better than Decision OS
- old-rule challenger worse than Decision OS
