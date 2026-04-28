# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Run an independent media-buyer product-truth review before any further
Creative segmentation implementation.

Creative Recovery is not accepted. The current pass is diagnosis and
rebuild-planning only; no policy thresholds, UI, queue/push/apply behavior, or
benchmark-scope behavior were changed.

## Program Status

- foundation: merged
- foundation hardening: merged
- calibration data gate: passed
- live Meta cohort recovery: complete
- original 10-agent calibration panel: complete
- implementation passes 1-6: merged
- pass 6 fatigue hardening: merged
- live output restoration: merged
- UI taxonomy/count hardening: merged
- test campaign actionability: merged
- critical media-buyer fixes: merged
- critical fix hardening: merged
- equal-segment scoring audit: complete
- equal-segment gate fixes: merged through PR #59
- final equal-segment fixes: merged through PR #61
- trend-collapse evidence hardening: merged through PR #63
- Creative Decision OS manual snapshots: merged through PR #66
- Creative primary-decision resolver: merged through PR #69
- Creative primary-decision UI swap: merged through PR #71
- Creative review-only Scale surface hardening: merged through PR #72
- independent media-buyer review: complete in current pass; draft PR pending

## Independent Media Buyer Review

Status: complete in current branch; draft PR pending.

Runtime note:

- a fresh live audit rerun was attempted first
- it was blocked by the configured database refusing `127.0.0.1:15432`
- the review used the latest local private live-firm artifact generated
  `2026-04-25T01:39:10.910Z`
- that artifact covers 8 readable businesses and 78 sampled creatives from the
  30 completed days ending `2026-04-24`
- committed reports and artifacts are sanitized; private names remain only in
  `/tmp/adsecute-creative-independent-media-buyer-review-local.json`

Agent review status:

- 10 role-based media-buyer lenses were run blind from sanitized raw/live
  metrics before revealing Adsecute's current segment
- roles covered performance buying, e-commerce growth, creative strategy,
  scaling, cut/pause risk, measurement skepticism, profitability, campaign
  context, fatigue/lifecycle, and UX simplification
- old-rule challenger output stayed comparison-only

Score summary:

- weighted media-buyer risk score: `83/100`
- equal-segment macro score: `63/100`
- raw row accuracy: `65%`
- reviewed businesses: `8`
- reviewed creatives: `78`

Top failure patterns:

- Watch hiding Refresh-shaped action
- Refresh softening Cut-shaped waste
- relative winners softened into Refresh instead of Scale Review
- thin-evidence rows overclassified into active actions
- eligibility/status rows not translating cleanly into media-buyer decisions

Recommended direction:

- **baseline-first rebuild needed** for the classifier layer
- preserve existing safety, provenance, benchmark, snapshot, and instruction
  layers
- do not continue one-row threshold patching unless a new review proves the
  remaining misses collapse to one narrow gate family

Next recommended action:

- open draft PR `Creative independent media buyer review`
- ask for an independent review of the evidence
- if accepted, implement a parallel report-only baseline-first media-buyer
  action classifier before connecting anything to UI or policy

Report:

- `docs/operator-policy/creative-segmentation-recovery/reports/independent-media-buyer-review/final.md`

## PR #71 P1 Review-Only Scale Surface Issue

Status: fixed and merged through PR #72.

Issue:

- `buildCreativeOperatorSurfaceModel` used total primary `scale` count to set
  `act_now` emphasis and Scale headlines.
- primary `Scale` intentionally includes review-only Scale Review rows.
- if all Scale rows were review-only, muted, or non-live, the surface could
  still imply direct scale action was ready.

Fix summary:

- added presentation-only Scale actionability counts:
  - total primary Scale
  - direct-action Scale
  - review-first Scale
  - muted / non-live Scale
- direct-action Scale now requires existing policy/readiness safety:
  - resolved primary `scale`
  - not `review_only`
  - not muted/thin/archive
  - live or legacy-unset evidence source
  - `scale_ready` policy segment
  - queue/apply eligible, `safe_to_queue`, or `eligible_for_push_when_enabled`
- review-only Scale remains grouped under the Scale filter but cannot set
  `act_now` emphasis.
- when no direct-action Scale exists, surface copy says Scale candidates need
  operator review and no creatives are ready for direct Scale.

Tests/checks:

- targeted Creative operator surface/UI tests passed
- targeted operator prescription test passed
- `npm test` passed
- `npx tsc --noEmit` passed
- `npm run build` passed
- `git diff --check` passed
- hidden/bidi/control scan passed
- raw ID scan on touched docs passed
- runtime smoke passed with expected auth redirects for `/creatives` and `/platforms/meta`

Report:

- `docs/operator-policy/creative-segmentation-recovery/reports/scale-review-surface-hardening/final.md`

Next recommended action:

- complete; use the independent media-buyer review as the next product-truth
  input before any further implementation

## Creative Primary-Decision Resolver

Status: implemented and merged through PR #69.

Direction accepted:

- current 10 user-facing labels mix operator action, confidence, evidence, and context states
- target primary decisions are `scale`, `test_more`, `protect`, `refresh`, `cut`, and `diagnose`
- secondary reason tags preserve the nuance currently carried by Scale Review, Watch, Retest, Campaign Check, and Not Enough Data

Implementation summary:

- added exported `CreativeOperatorPrimaryDecision`, `CreativeOperatorSubTone`, and `CreativeOperatorReasonTag` types
- added `resolveCreativeOperatorDecision(creative)` as a pure parallel resolver in `lib/creative-operator-surface.ts`
- resolver returns one primary decision, one sub-tone, and up to two deterministic reason tags
- `Scale Review` maps to `scale` with `review_only`
- paused historical Retest maps to `refresh` with `revive`
- Campaign Check maps to `diagnose` with `campaign_context_blocker`
- Not Enough Data maps to diagnostic low-evidence handling
- Watch is not a primary decision in the resolver

Safety and product boundaries:

- no Creative policy thresholds changed
- no Scale / Scale Review gates changed
- no queue/push/apply safety changed
- old-rule challenger output remains comparison-only
- no snapshot schema change was made

Tests added:

- direct resolver mapping tests for Scale, Scale Review, Test More, Protect, Watch-like, Refresh, Retest, Cut, Campaign Check, and Not Enough Data rows
- safety invariance tests for review-only Scale and non-live/fallback evidence
- sanitized live-firm audit fixture test proving every row resolves to one of six primaries and Diagnose rows carry diagnostic reason tags

Report:

- `docs/operator-policy/creative-segmentation-recovery/reports/taxonomy-simplification-resolver/final.md`

## Creative Primary-Decision UI Swap

Status: complete and merged through PR #71.

Active primary-decision taxonomy:

- `Scale`
- `Test More`
- `Protect`
- `Refresh`
- `Cut`
- `Diagnose`

Implementation summary:

- top Creative filters now use the six primary decisions
- filter and overview counts come from `resolveCreativeOperatorDecision(...).primary`
- Creative preview cards show primary decision, optional sub-tone, and reason tags
- Creative Decision Support and overview surfaces use primary-decision language
- Creative detail verdict uses primary decision first
- old 10-label aggregate counts no longer drive top-line taxonomy cards

Scale Review representation:

- old `Scale Review` rows now appear under `Scale`
- sub-tone shows `Review only`
- reason tags preserve `Business target missing` / `Commercial truth missing`
- queue/push/apply eligibility remains governed by the underlying policy and stays blocked where review-only

Old labels demoted:

- `Watch` is not a primary filter; resolver maps those rows to `Test More`, `Refresh`, `Cut`, or `Diagnose`
- `Retest` is represented as `Refresh` with `Revive`, `Comeback candidate`, or `Paused winner`
- `Campaign Check` is represented as `Diagnose` with `Campaign context`
- `Not Enough Data` is represented as `Diagnose` or `Test More` with low-evidence reason tags

Preserved:

- no Creative policy retune
- no Scale / Scale Review floor change
- no benchmark-scope behavior change
- no queue/push/apply safety change
- manual Decision OS snapshot behavior remains active
- selected reporting range remains non-authoritative

Tests/checks so far:

- targeted Creative operator surface/filter tests passed
- targeted Creative overview/drawer/detail/operator-prescription/API tests passed
- `npx tsc --noEmit` passed
- `npm test` passed
- `npm run build` passed
- `git diff --check` passed
- hidden/bidi/control scan passed
- raw ID scan on touched docs passed
- runtime smoke passed with expected auth redirects for `/creatives` and `/platforms/meta`

Report:

- `docs/operator-policy/creative-segmentation-recovery/reports/primary-decision-ui-swap/final.md`

Next recommended action:

- complete the review-only Scale surface hardening pass before rerunning
  Claude product review on the simplified UI

## Creative Decision OS Manual Snapshot Pass

Status: complete and merged.

PR:

- URL: `https://github.com/erhanrdn/OmniAds/pull/66`
- title: `Add manual Creative Decision OS analysis snapshots`
- branch: `feature/adsecute-creative-decision-os-snapshots`
- local validation: passed
- GitHub status contexts: none reported by the connector at PR-open time
- merge method: squash
- merged commit: `7be5f28cf2918fe020b55393cd5f8513882eceb2`
- merged to: `main`

Root issue:

- `app/(dashboard)/creatives/page.tsx` enabled a `creative-decision-os` query on page load.
- that query key included `drStart` and `drEnd`
- changing the selected reporting range could refetch `/api/creatives/decision-os`
- the API `GET` path computed Decision OS immediately

Fix summary:

- added `creative_decision_os_snapshots`
- added `lib/creative-decision-os-snapshots.ts`
- changed Creative Decision OS API behavior:
  - `GET /api/creatives/decision-os` loads the latest matching snapshot only
  - `POST /api/creatives/decision-os` manually computes and saves a snapshot
- changed the Creative page to:
  - load snapshot state on page load
  - show `Run Creative Analysis`
  - show last analyzed timestamp
  - show analysis scope and benchmark scope
  - keep reporting-range changes reporting-only
  - show not-run state when a matching business/scope snapshot does not exist

Snapshot identity:

- business
- analysis scope: account or campaign
- benchmark scope: account or campaign
- benchmark scope id when campaign-scoped

Reporting dates are stored as context only and are not snapshot authority.

Policy/safety impact:

- no Creative segmentation retune
- no taxonomy change
- no Scale / Scale Review floor change
- no queue/push/apply safety change
- no Command Center safety change

Validation:

- targeted snapshot store/API/page/drawer tests passed
- full `npm test`
- `npm run build`
- `npx tsc --noEmit`
- `git diff --check`
- hidden/bidi/control scan
- raw ID scan on touched docs/reports
- runtime smoke on `/creatives` and `/platforms/meta`

## Final Equal-Segment PR Flow

Status: complete.

- PR: `https://github.com/erhanrdn/OmniAds/pull/61`
- title: `Fix final Creative equal-segment misses`
- branch: `feature/adsecute-creative-equal-segment-final-fixes`
- checks: passed
- merge method: squash
- merged commit: `bc8cc1f1654f61f09154230e1605653dcc3b34f4`
- merged to: `main`

## PR #61 P1 Trend-Collapse Evidence Issue

Status: fixed and merged through PR #63.

- PR: `https://github.com/erhanrdn/OmniAds/pull/63`
- title: `Harden Creative trend-collapse Refresh evidence guard`
- branch: `feature/adsecute-creative-trend-collapse-evidence-hardening`
- checks: passed
- merge method: squash
- merged commit: `9393bde844c4417f49a6b4aaa48407639da47ff6`
- merged to: `main`

The issue was real. `isValidatingTrendCollapseRefreshCandidate` could run before the under-sampled branch and did not require creative age maturity, so a very new validating creative with a noisy 7-day dip could become `Refresh`.

Guard added:

- the validating trend-collapse Refresh helper now requires the existing meaningful-read helper
- this enforces peer-relative spend maturity, at least `2` purchases, at least `5000` impressions, and creative age greater than `10` days

Tests added:

- very new validating creative + 7-day dip => not `Refresh`
- under-sampled validating creative + 7-day dip => not `Refresh`
- mature validating trend-collapse fixture remains `Refresh`
- mature severe failure fixture remains `Cut`
- missing 7-day/frequency evidence still does not trigger `Refresh`

The PR #61 score intent remains acceptable:

- macro segment score replay remains `87/100`
- Watch score replay remains `75/100`
- Refresh score replay remains `84/100`
- Cut recall replay remains about `92%`

## Claude Equal-Segment Re-Review Result

Claude's independent re-review found the PR #59 score claim was overstated:

- macro segment score: about `83/100`, not `86/100`
- raw row accuracy: about `83%`, not `90%`
- Watch score: `55/100`
- Refresh score: `73/100`
- Cut recall: below target because Cut-shaped rows were still hiding in Refresh
- pdf-company-01 context: about `80/100`
- pdf-company-02 context: about `82/100`

Decision: Creative Recovery remains not accepted until the final fixes are reviewed.

## Final Equal-Segment Fixes

Implemented in this pass:

1. catastrophic CPA `fatigued_winner` / `refresh_replace` rows now route to review-safe `Cut`
   - fixes the Refresh-as-Cut hiding pattern from Claude Round 2
   - queue/push/apply authority remains review-gated
2. validating `keep_in_test` rows with at-benchmark 30-day ROAS and near-zero 7-day ROAS now route to `Refresh`
   - fixes the strongest Watch-as-Refresh miss
   - missing/unavailable 7-day or frequency evidence does not trigger the rule
3. high-relative Watch case traced and documented as defensible under current Scale Review floors
   - `company-05 / creative-04` remains `Watch`
   - reason: not explicit test-campaign context and spend is below the true-scale peer-spend floor for that account
   - Scale / Scale Review floors were intentionally unchanged

Preserved:

- no taxonomy changes
- no Scale / Scale Review floor changes
- no queue/push/apply loosening
- no old-rule takeover
- no Commercial Truth or baseline invention
- benchmark scope remains explicit
- selected reporting range remains non-authoritative

## Before / After Scores

Before uses Claude Round 2 independent review. After uses deterministic replay of the fixed gates over the same reviewed live cohort.

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `83/100` | `87/100` |
| Raw row accuracy | `83%` | `87%` |
| Watch score | `55/100` | `75/100` |
| Refresh score | `73/100` | `84/100` |
| Cut recall | `~77%` | `~92%` |
| pdf-company-01 context | `80/100` | `80/100` |
| pdf-company-02 context | `82/100` | `82/100` |

## Latest Segment Replay

Post-fix deterministic replay on the reviewed live artifact:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `9`
- `Refresh`: `16`
- `Retest`: `1`
- `Cut`: `14`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

## Remaining Weakest Segments

After the final targeted fixes:

- `Watch`: `75/100`
- `Test More`: `83/100`
- `Protect`: `83/100`

No additional implementation pass should start until Claude reruns the equal-segment review.

## Reports

- final equal-segment fixes: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-final-fixes/final.md`
- trend-collapse evidence hardening: `docs/operator-policy/creative-segmentation-recovery/reports/trend-collapse-evidence-hardening/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

Finish the primary-decision UI swap validation and PR flow.

After the PR passes review, request Claude product review against the simplified six-primary Creative UI. Creative Recovery should only be accepted if that review confirms the new presentation is clear and no new severe live operator defect appears.
