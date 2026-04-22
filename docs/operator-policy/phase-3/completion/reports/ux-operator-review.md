# UX Operator Review - Phase 3 Meta Completion

Role: UX Operator Reviewer  
Scope: Meta Decision OS/operator output only. No app code changed.

## Current UI Inventory

- The Meta page places `MetaAnalysisStatusCard` above the right detail pane and passes `decisionOsData`, `analysisStatus`, recommendations, and selected reporting dates into `MetaCampaignDetail`; this makes analysis state visible before account/campaign detail content. Evidence: `app/(dashboard)/platforms/meta/page.tsx:1431`, `app/(dashboard)/platforms/meta/page.tsx:1435`.
- `MetaAnalysisStatusCard` separates Decision OS surface status, recommendation source, and presentation mode, and uses the safe timestamp copy "Last successful analysis". Evidence: `components/meta/meta-analysis-status-card.tsx:70`, `components/meta/meta-analysis-status-card.tsx:76`, `components/meta/meta-analysis-status-card.tsx:82`, `components/meta/meta-analysis-status-card.tsx:91`.
- Account overview renders `MetaDecisionOsOverview` first, then puts workflow, fallback recommendations, operating mode, and breakdowns behind "Workflow and context". Evidence: `components/meta/meta-campaign-detail.tsx:514`, `components/meta/meta-campaign-detail.tsx:534`.
- `MetaDecisionOsOverview` already exposes the important first-level sections: Authority & readiness, Operator Plan Summary, Highlighted Action Core, Watchlist / Degraded Reads, Protected / No-Touch, Opportunity Board, and collapsible Policy and evidence details. Evidence: `components/meta/meta-decision-os.tsx:797`, `components/meta/meta-decision-os.tsx:960`, `components/meta/meta-decision-os.tsx:997`, `components/meta/meta-decision-os.tsx:1015`, `components/meta/meta-decision-os.tsx:1031`, `components/meta/meta-decision-os.tsx:1062`, `components/meta/meta-decision-os.tsx:1096`.
- Empty and loading states are explicit; the component no longer silently returns null. Evidence: `components/meta/meta-decision-os.tsx:868`, `components/meta/meta-decision-os.tsx:890`.
- Campaign detail keeps Decision OS ahead of recommendations when both exist and demotes fallback/aggressive recommendations to context when Decision OS authority is not primary. Evidence: `components/meta/meta-campaign-detail.tsx:201`, `components/meta/meta-campaign-detail.tsx:204`, `components/meta/meta-campaign-detail.tsx:251`, `components/meta/meta-campaign-detail.tsx:270`, `components/meta/meta-campaign-detail.tsx:275`.
- Campaign reasoning is correctly collapsed, while the headline reason is visible outside the details panel. Evidence: `components/meta/meta-campaign-detail.tsx:263`, `components/meta/meta-campaign-detail.tsx:751`.
- The campaign list already surfaces operator summaries and sorts campaigns by operator state before spend. Evidence: `components/meta/meta-campaign-list.tsx:100`, `components/meta/meta-campaign-list.tsx:214`.

## Minimal UI Integration Needed

1. Add a small policy outcome chip where operator rows are already rendered.
   - Current displayed states are `act_now`, `needs_truth`, `blocked`, `watch`, `no_action`; Phase 3 needs user-facing outcomes `do_now`, `do_not_touch`, `watch`, `investigate`, `blocked`, `contextual_only`. Evidence for current states: `lib/operator-surface.ts:1`.
   - Recommendation: keep layout, but map the deterministic Meta policy output to one visible chip per row in `WorkItemRow`, `CampaignOperatorHeadline`, and campaign-list summaries.

2. Add push-readiness visibility without adding a new panel.
   - The shared type already defines `read_only_insight`, `operator_review_required`, `safe_to_queue`, `eligible_for_push_when_enabled`, and `blocked_from_push`. Evidence: `src/types/operator-decision.ts:82`.
   - Recommendation: show one compact "Push readiness" chip in `WorkItemRow` and campaign headline when available. Missing provenance or blocked push should be visible as blocked/review-only, not hidden in Command Center.

3. Keep deterministic policy reasons above details.
   - `WorkItemRow` already shows a reason plus blocker/guardrail; use the same area for the policy outcome reason and first missing-data reason. Evidence: `components/meta/meta-decision-os.tsx:717`, `components/meta/meta-decision-os.tsx:723`.
   - Detailed evidence can remain in "Policy and evidence details"; do not move full policy explanations into the primary card.

4. Make missing data row-level and visible.
   - Account-level missing truth/readiness is visible today. Evidence: `components/meta/meta-decision-os.tsx:816`, `components/meta/meta-decision-os.tsx:839`.
   - Recommendation: expose row-level missing data as the first blocker/missing-data line for `investigate`, `blocked`, and `contextual_only` outcomes.

5. Keep the account overview hierarchy.
   - The current order is good for operator comprehension: authority first, plan counts second, command-ready work third, then watch/protected/opportunities/details.
   - Recommendation: do not redesign; add the deterministic policy chips/readiness labels inside existing cards.

## Wording Risks

- `MetaDecisionOsOverview` empty copy says "for this range", which can imply the selected reporting range authorizes actions. Evidence: `components/meta/meta-decision-os.tsx:901`.
  - Recommended copy: "Run analysis to generate account-level authority, operator lanes, and policy evidence for the current operator decision context."
- `MetaAnalysisStatusCard` says "Analyzed for {range}", which is safe for the current Phase 3.1 contract but should not become the only action-authority timestamp once deterministic policy is added. Evidence: `components/meta/meta-analysis-status-card.tsx:91`.
  - Recommendation: when `decisionAsOf` is available in UI state, show "Decision as of ..." separately from reporting/analyzed range.
- Opportunity Board uses "Queue eligible" without showing push-readiness level. Evidence: `components/meta/meta-decision-os.tsx:991`, `components/meta/meta-decision-os.tsx:1073`.
  - Recommendation: label as "Review queue eligible" or pair with explicit `pushEligibility.level`.
- Campaign list renders the action label as a dark pill for every operator state, including non-action states. Evidence: `components/meta/meta-campaign-list.tsx:214`.
  - Recommendation: reserve dark/primary styling for `do_now` only; use state-toned neutral chips for `watch`, `do_not_touch`, `investigate`, `blocked`, and `contextual_only`.
- Supporting recommendations still use legacy ACT/TEST/WATCH badges inside the collapsed context panel. Evidence: `components/meta/meta-account-recs.tsx:31`, `components/meta/meta-account-recs.tsx:75`.
  - Recommendation: add source/context copy if these remain visible in Phase 3, especially for fallback/demo/snapshot recommendations.
- `MetaActionQueue` is currently unused, but its copy says "what to do now", "Action Queue", and "ACT". Evidence: `components/meta/meta-action-queue.tsx:4`, `components/meta/meta-action-queue.tsx:162`.
  - Recommendation: keep it unused or refactor before reintroducing; it would overstate authority under the Phase 3 doctrine.

## Information Pollution Risks

- The overview is close to the right density. The main risk is adding deterministic policy data as another full card per entity. Use existing row chips and one-line blockers instead.
- Avoid adding long policy ladders to the main surface. The current collapsible "Policy and evidence details" location is appropriate. Evidence: `components/meta/meta-decision-os.tsx:1096`.
- Avoid duplicate "Run Analysis" controls competing for attention: the header has the primary run button, and supporting recommendations include another run button inside collapsed context. Evidence: `app/(dashboard)/platforms/meta/page.tsx:1203`, `components/meta/meta-account-recs.tsx:211`.

## Recommended Minimal Component Changes

1. `components/meta/meta-decision-os.tsx`
   - Add outcome and push-readiness chips to `WorkItemRow`.
   - Change empty copy from "for this range" to operator-decision-context language.
   - Rename "Queue eligible" to "Review queue eligible" unless a push-readiness level is displayed beside it.

2. `components/meta/meta-campaign-detail.tsx`
   - Add deterministic policy outcome and push-readiness labels to `CampaignOperatorHeadline`.
   - Keep fallback and Decision OS recommendation context copy as-is, but add source/readiness chip when recommendation context is displayed without full Decision OS surface.

3. `components/meta/meta-campaign-list.tsx`
   - Make the action chip state-aware: primary styling only for `do_now`; neutral/state styling for non-command states.

4. `components/meta/meta-analysis-status-card.tsx`
   - When policy data exposes `decisionAsOf`, show "Decision as of ..." separately from "Last successful analysis" and reporting/analyzed range.

## Recommended Tests

- `components/meta/meta-decision-os.test.tsx`
  - Renders policy outcome chips for `do_now`, `watch`, `do_not_touch`, `investigate`, `blocked`, and `contextual_only`.
  - Shows push-readiness levels and blocked reason when provenance/push eligibility is missing.
  - Does not style contextual/watch/no-touch rows as primary commands.
  - Keeps detailed policy evidence collapsible while showing the main reason and first blocker outside details.

- `components/meta/meta-campaign-detail.test.tsx`
  - Campaign headline shows Decision OS policy outcome and push readiness when a campaign decision exists.
  - Fallback/demo/snapshot recommendation remains context-only and never shows primary command styling.

- `components/meta/meta-campaign-list.test.tsx`
  - Non-`do_now` operator summaries do not use primary/dark command styling.
  - Sorting still prioritizes actionable rows, then truth/blocked/watch/no-touch, without hiding protected rows.

- `components/meta/meta-analysis-status-card.test.tsx`
  - Timestamp copy distinguishes "Last successful analysis" from `decisionAsOf` and reporting range.

## UX Recommendation

The current UI architecture is suitable for Phase 3 with small additions. Do not redesign the Meta page. Add deterministic policy outcome and push-readiness labels into existing rows, adjust range-related copy, and keep detailed evidence collapsed. The largest authority risk is not layout; it is copy/styling that makes contextual or review-only items look like primary operator commands.
