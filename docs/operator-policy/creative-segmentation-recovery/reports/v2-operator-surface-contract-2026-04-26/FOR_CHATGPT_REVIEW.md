CHATGPT_REVIEW_READY: YES
ROLE: CODEX_EVIDENCE_RUNNER
BRANCH: review/creative-v2-operator-surface-contract-2026-04-26
HEAD_COMMIT: SEE_DRAFT_PR_BODY_CURRENT_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-operator-surface-contract-2026-04-26/
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-operator-surface-contract-2026-04-26/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 Operator Surface Contract

Generated: 2026-04-26T14:40:33Z

This PR is a report-only operator surface contract for safely previewing the Creative Decision OS v2 resolver in the Creative page. It does not wire v2 into the UI, API, command center, queue, or apply flow. It does not change resolver logic, thresholds, gold labels, product policy, or product code.

## Source Inputs

- Current branch base: `origin/main` at `fa838df2be0a93c445680c42d23f4adadb52bd8f`.
- Resolver-only WIP source: `origin/wip/creative-decision-os-v2-baseline-first-2026-04-26`.
- PR #78 reviewed head from ChatGPT handoff: `3da2e05cb47f97de89ee42d9af6a64598af8b17a`.
- PR #78 substantive resolver fix from ChatGPT handoff: `10f5a94fa66f0501150376010d3ab4d0c7c16e3a`.
- Live audit artifact path used for surface analysis: `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`.
- Live safety artifact path used for surface analysis: `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-safety-summary.json`.
- Gold evaluation artifact used as context only: `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`.

## Executive Summary

Creative Decision OS v2 can be integrated next as a read-only operator preview, not as an execution path. The live audit shows the resolver is intentionally conservative: 2 direct rows, 108 review-only rows, and 193 diagnose rows across 303 audited creative rows. That is a good safety posture for a resolver-only candidate, but a raw table of review and diagnose labels would be operationally weak.

The Creative page should therefore present v2 as a buyer workbench with explicit buckets:

- Act Now / Direct candidates: 2 rows, shown as "Ready for buyer confirmation" with no queue/apply actions.
- Buyer Review: 108 review-only rows, sorted by risk, spend, and current-vs-v2 decision change.
- Diagnose First: 193 rows, grouped by blocker or ambiguity reason so diagnosis does not overwhelm the main workflow.
- Decision-specific views for Refresh, Cut, Protect, Test More, and Scale.

The safest injection point is a separate read-only v2 preview model fetched alongside the current Creative page data and rendered in a new preview surface. It must not replace the current v1 `creativeDecisionOs` object, must not feed command center work items, and must not drive queue/apply eligibility.

## Current Creative Page Inventory

### 1. Current Creative Page Route, Files, Components

- Route: `app/(dashboard)/creatives/page.tsx`
- Main support file: `app/(dashboard)/creatives/page-support.tsx`
- Current top/header surface: `components/creatives/CreativesTopSection.tsx`
- Current table/grid surface: `components/creatives/CreativesTableSection.tsx`
- Current decision drawer: `components/creatives/CreativeDecisionOsDrawer.tsx`
- Current drawer content: `components/creatives/CreativeDecisionOsContent.tsx`
- Current overview panels: `components/creatives/CreativeDecisionOsOverview.tsx`
- Current read-only support surface: `components/creatives/CreativeDecisionSupportSurface.tsx`
- Current generic summary component: `components/operator/OperatorSurfaceSummary.tsx`
- Current row/detail experience: `components/creatives/CreativeDetailExperience.tsx`

`app/(dashboard)/creatives/page.tsx` is a client page that owns the visible Creative workflow. It loads creative rows, history windows, ad-level breakdowns, the current Creative Decision OS snapshot, table state, drawer state, quick filters, and selected rows.

### 2. Current API/Data Path Feeding the Creative Page

- `fetchMetaCreatives` in `app/(dashboard)/creatives/page-support.tsx` calls `/api/meta/creatives`.
- `fetchMetaCreativesHistory` in `app/(dashboard)/creatives/page-support.tsx` calls `/api/meta/creatives/history`.
- `/api/meta/creatives` is implemented by `app/api/meta/creatives/route.ts`.
- The Meta creative response is built through `lib/meta/creatives-api.ts`.
- Current Creative Decision OS snapshot/read path is `getCreativeDecisionOsSnapshot` in `src/services/data-service-ai.ts`, which calls `/api/creatives/decision-os`.
- Current Creative Decision OS run path is `runCreativeDecisionOsAnalysis` in `src/services/data-service-ai.ts`, which posts to `/api/creatives/decision-os`.
- `/api/creatives/decision-os` is implemented by `app/api/creatives/decision-os/route.ts` and currently serves the v1 snapshot/run flow.

The current page joins Meta creative rows, historical metrics, benchmark scope, and current decision snapshot client-side. A v2 preview can follow that shape without changing existing v1 behavior.

### 3. Current Decision Fields Shown in UI

Current v1-facing UI surfaces include:

- Decision/segment family filters from `decisionOsFamilyFilter`.
- Quick filters from `buildCreativeQuickFilters`.
- Operator surface model from `buildCreativeOperatorSurfaceModel`.
- Drawer sections for current recommendation, benchmark context, source/provenance, blockers, and supply planning.
- Detail drawer fields for "What to do", preview truth, evidence, metrics, and blockers.

Current v1 language includes queue-readiness and supply-plan concepts in overview components. v2 preview must avoid turning these into action controls.

### 4. Current Queue/Apply/Action Wiring

No Creative page table button currently executes a v2 action. Current Creative page controls are navigation, filtering, selection, drawer, analysis run, export/share, row open, and row breakdown controls.

Current v1 data structures include execution-related concepts such as `operatorPolicy.queueEligible`, `operatorPolicy.canApply`, `pushReadiness`, and deployment/supply-plan fields. Command Center code also consumes Creative Decision OS output for work-item generation. v2 preview must not feed those execution paths until a separate integration review explicitly approves it.

### 5. Current Button/Action Components

- Header and toolbar actions are in `CreativesTopSection`.
- Table row open/select/breakdown/sort controls are in `CreativesTableSection`.
- Drawer analysis controls are in `CreativeDecisionOsDrawer` and `CreativeDecisionOsContent`.
- Detail drawer row actions and evidence presentation are in `CreativeDetailExperience`.

There is no safe reason to add queue/apply controls for v2 preview. The preview should reuse existing navigation/open-review patterns and add disabled or informational safety states only.

### 6. Current Summary/Header Components

- `CreativesTopSection` owns the above-the-fold title, date range, group/filter controls, preview strip, CSV/share controls, optional action prefix, optional quick filters, and optional below-toolbar content.
- `CreativeDecisionSupportSurface` renders current decision support summary content.
- `OperatorSurfaceSummary` can summarize operator buckets and row cards, but should be fed a v2-specific preview model rather than the current v1 execution model.

### 7. Current Row/Card/Table Components

- `CreativesTableSection` is the main dense row/table surface.
- `CreativeDetailExperience` is the row-level drilldown.
- `OperatorSurfaceSummary` already supports a card-style operator summary pattern that could be adapted to a read-only v2 preview.

For v2 preview, the table row should remain dense and scannable. Detailed resolver evidence belongs in the drawer or expandable panel.

### 8. Existing Feature Flag Pattern

- `lib/creative-decision-os-config.ts` contains `CREATIVE_DECISION_OS_V1`, which defaults to enabled.
- It also supports a canary list through `CREATIVE_DECISION_OS_CANARY_BUSINESSES`.
- Several API/debug paths use explicit query params such as preview/debug flags and `NODE_ENV !== "production"` logging.

Recommended v2 preview flag pattern:

- Add a separate future flag such as `CREATIVE_DECISION_OS_V2_PREVIEW`.
- Add an optional canary list such as `CREATIVE_DECISION_OS_V2_PREVIEW_BUSINESSES`.
- Keep v2 preview read-only even when enabled.
- Keep queue/apply disabled independent of preview flag state.

This report does not implement those flags.

### 9. Existing Preview/Dev-Only Mode Pattern

Existing Creative API/page patterns include debug and preview-oriented query params such as metadata media mode, preview debugging, thumbnail debugging, performance debugging, snapshot bypass, and snapshot warming. These are useful precedents for read-only preview behavior, but v2 preview should be feature-flagged and canaried rather than hidden only behind ad hoc query params.

### 10. Where v2 Can Be Injected Without Affecting Queue/Apply

Recommended safe injection point:

1. Load the current Creative page exactly as today.
2. Fetch a separate v2 preview payload after the creative rows, history, benchmark scope, and current v1 decision snapshot are available.
3. Join v2 preview rows to visible creative rows by sanitized internal row keys and available campaign/adset/ad/creative identifiers.
4. Render a separate read-only v2 preview surface above or beside the current table.
5. Do not replace the current `creativeDecisionOs` object.
6. Do not feed v2 preview into Command Center, current queue/apply eligibility, current v1 quick filters, or current v1 run-analysis mutation.

Candidate future integration shape:

- `GET /api/creatives/decision-os-v2/preview`
- Response field: `decisionOsV2Preview`
- Client state field: `creativeDecisionOsV2Preview`
- Rendering component: `CreativeDecisionOsV2PreviewSurface`
- Execution behavior: read-only; queue/apply disabled.

## v2 Output Field UI Contract

The machine-readable version of this mapping is in `surface-contract-v0.json`.

| v2 field | UI placement | Preview behavior |
| --- | --- | --- |
| `primaryDecision` | Primary badge and bucket routing | Display as Scale, Cut, Refresh, Protect, Test More, or Diagnose. Do not display Watch or Scale Review. |
| `actionability` | Safety badge beside decision | Show direct as "Ready for buyer confirmation", review_only as "Review required", blocked as "Blocked", diagnose as "Diagnose first". |
| `confidence` | Secondary score/band | Use for sort and context. Do not use confidence alone to unlock direct actions. |
| `reasonTags` | 2 to 3 visible chips, rest collapsed | Keep tags buyer-readable. Tags are filterable. |
| `evidenceSummary` | One-line "why" in row, full text in drawer | Must be operator-safe and free of internal evaluation wording. |
| `riskLevel` | Risk badge and sort key | Sort critical/high risk above medium/low when spend is meaningful. |
| `queueEligible` | Preview safety state only | Do not show Queue as enabled in v2 preview. |
| `applyEligible` | Preview safety state only | Do not show Apply as enabled in v2 preview. |
| `blockerReasons` | Blocker badge and grouped diagnose reason | First blocker visible; full blocker list in drawer. |
| `secondarySuggestion` | Drawer-only next-step hint | Never render as an action button. |

## Proposed UX Buckets

The UI should separate actionability queues from decision buckets. `Buyer Review` is an actionability queue. Refresh, Cut, Protect, Test More, Scale, and Diagnose are decision buckets.

| Bucket | Count from live audit | Criteria | Primary purpose |
| --- | ---: | --- | --- |
| Act Now / Direct candidates | 2 | `actionability = direct` | Show as "Ready for buyer confirmation"; no Apply or Queue button. |
| Buyer Review | 108 | `actionability = review_only` | Main work queue for rows with a recommended buyer action but no automatic execution. |
| Diagnose First | 193 | `primaryDecision = Diagnose` or `actionability = diagnose` | Group ambiguity, blocker, data-quality, and campaign-context issues. |
| Refresh Candidates | 37 | `primaryDecision = Refresh` | Review fatigue, recent decay, and active below-benchmark conversion rows before cutting. |
| Cut Candidates | 15 | `primaryDecision = Cut` | Review severe losers and inactive confirmed losers conservatively. |
| Protect / Do Not Touch | 17 | `primaryDecision = Protect` | Preserve stable winners and prevent accidental churn. |
| Test More / Need More Signal | 40 | `primaryDecision = Test More` | Continue learning when signal is thin or near benchmark. |

## Exact Safety Behavior

- Queue/apply buttons remain disabled for v2 preview.
- Direct Scale remains non-apply unless explicitly approved in a later integration phase.
- Cut direct must not be auto-applied in preview.
- Diagnose rows must not show action buttons.
- `review_only` rows must show "Review required", not "Apply".
- `blocked` rows must show why blocked before any buyer action.
- `direct` rows must show "Ready for buyer confirmation", not "Apply now".
- v2 preview must not write to current queue/apply state.
- v2 preview must not create Command Center work items.

## Live Audit Distribution Used For Contract

Rows audited: 303

Businesses/accounts audited: 8 businesses / 9 accounts

### v2 Decision Distribution

| Decision | Rows |
| --- | ---: |
| Diagnose | 193 |
| Test More | 40 |
| Refresh | 37 |
| Protect | 17 |
| Cut | 15 |
| Scale | 1 |

### v2 Actionability Distribution

| Actionability | Rows |
| --- | ---: |
| diagnose | 193 |
| review_only | 108 |
| direct | 2 |

### Safety Counters From Accepted Live Audit

| Counter | Rows |
| --- | ---: |
| direct Scale | 0 |
| inactive direct Scale | 0 |
| queueEligible true | 0 |
| applyEligible true | 0 |
| Watch primary | 0 |
| Scale Review primary | 0 |
| direct action despite source/campaign blockers | 0 |
| Test More direct on degraded/data-quality risk | 0 |
| Protect despite recent severe decay | 0 |

## Top 20 Highest-Spend Rows And Proposed UI Placement

| Rank | Sanitized row ID | Spend | Current -> v2 | Actionability | Proposed placement |
| ---: | --- | ---: | --- | --- | --- |
| 1 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-46` | 124046.89 | Refresh -> Refresh | review_only | Refresh Candidates |
| 2 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-06&#124;company-05-creative-47` | 61027.88 | Protect -> Refresh | review_only | Refresh Candidates |
| 3 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-07&#124;company-05-creative-48` | 57588.45 | Refresh -> Cut | review_only | Cut Candidates |
| 4 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-49` | 33858.47 | Protect -> Refresh | review_only | Refresh Candidates |
| 5 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-06&#124;company-05-creative-50` | 33045.48 | Cut -> Diagnose | diagnose | Diagnose First |
| 6 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-51` | 29265.56 | Protect -> Refresh | review_only | Refresh Candidates |
| 7 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-52` | 28450.98 | Refresh -> Diagnose | diagnose | Diagnose First |
| 8 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-53` | 26077.54 | Refresh -> Refresh | review_only | Refresh Candidates |
| 9 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-54` | 25506.30 | Diagnose -> Cut | review_only | Cut Candidates |
| 10 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-06&#124;company-05-creative-55` | 23522.86 | Diagnose -> Refresh | review_only | Refresh Candidates |
| 11 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-56` | 16255.87 | Protect -> Refresh | review_only | Refresh Candidates |
| 12 | `company-05&#124;company-05-account-01&#124;company-05-campaign-01&#124;company-05-adset-01&#124;company-05-creative-01` | 13373.07 | Protect -> Protect | review_only | Protect / Do Not Touch |
| 13 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-07&#124;company-05-creative-57` | 12644.77 | Cut -> Cut | review_only | Cut Candidates |
| 14 | `company-05&#124;company-05-account-01&#124;company-05-campaign-02&#124;company-05-adset-01&#124;company-05-creative-02` | 10118.73 | Protect -> Scale | review_only | Buyer Review |
| 15 | `company-05&#124;company-05-account-01&#124;company-05-campaign-03&#124;company-05-adset-02&#124;company-05-creative-03` | 10022.46 | Cut -> Cut | review_only | Cut Candidates |
| 16 | `company-05&#124;company-05-account-01&#124;company-05-campaign-03&#124;company-05-adset-02&#124;company-05-creative-04` | 8765.22 | Diagnose -> Protect | review_only | Protect / Do Not Touch |
| 17 | `company-08&#124;company-08-account-01&#124;company-08-campaign-01&#124;company-08-adset-01&#124;company-08-creative-01` | 8295.35 | Cut -> Refresh | review_only | Refresh Candidates |
| 18 | `company-05&#124;company-05-account-01&#124;company-05-campaign-04&#124;company-05-adset-03&#124;company-05-creative-05` | 6991.75 | Diagnose -> Test More | review_only | Test More / Need More Signal |
| 19 | `company-05&#124;company-05-account-01&#124;company-05-campaign-03&#124;company-05-adset-02&#124;company-05-creative-06` | 6686.77 | Cut -> Cut | review_only | Cut Candidates |
| 20 | `company-05&#124;company-05-account-01&#124;company-05-campaign-05&#124;company-05-adset-04&#124;company-05-creative-07` | 6314.72 | Cut -> Cut | review_only | Cut Candidates |

## Top 20 Highest-Risk Decision Changes And Proposed UI Placement

| Rank | Sanitized row ID | Spend | Current -> v2 | Actionability | Proposed placement |
| ---: | --- | ---: | --- | --- | --- |
| 1 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-07&#124;company-05-creative-48` | 57588.45 | Refresh -> Cut | review_only | Cut Candidates |
| 2 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-54` | 25506.30 | Diagnose -> Cut | review_only | Cut Candidates |
| 3 | `company-05&#124;company-05-account-01&#124;company-05-campaign-02&#124;company-05-adset-01&#124;company-05-creative-02` | 10118.73 | Protect -> Scale | review_only | Buyer Review |
| 4 | `company-08&#124;company-08-account-01&#124;company-08-campaign-01&#124;company-08-adset-01&#124;company-08-creative-01` | 8295.35 | Cut -> Refresh | review_only | Refresh Candidates |
| 5 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-07&#124;company-05-creative-58` | 5025.29 | Diagnose -> Cut | review_only | Cut Candidates |
| 6 | `company-08&#124;company-08-account-02&#124;company-08-campaign-02&#124;company-08-adset-02&#124;company-08-creative-02` | 4365.02 | Cut -> Refresh | review_only | Refresh Candidates |
| 7 | `company-06&#124;company-06-account-01&#124;company-06-campaign-01&#124;company-06-adset-01&#124;company-06-creative-01` | 1701.51 | Cut -> Refresh | review_only | Refresh Candidates |
| 8 | `company-01&#124;company-01-account-01&#124;company-01-campaign-02&#124;company-01-adset-02&#124;company-01-creative-02` | 833.63 | Test More -> Refresh | review_only | Refresh Candidates |
| 9 | `company-04&#124;company-04-account-01&#124;company-04-campaign-08&#124;company-04-adset-05&#124;company-04-creative-17` | 286.87 | Diagnose -> Cut | review_only | Cut Candidates |
| 10 | `company-04&#124;company-04-account-01&#124;company-04-campaign-01&#124;company-04-adset-01&#124;company-04-creative-02` | 151.25 | Diagnose -> Refresh | review_only | Refresh Candidates |
| 11 | `company-03&#124;company-03-account-01&#124;company-03-campaign-01&#124;company-03-adset-01&#124;company-03-creative-05` | 132.06 | Diagnose -> Refresh | review_only | Refresh Candidates |
| 12 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-52` | 28450.98 | Refresh -> Diagnose | diagnose | Diagnose First |
| 13 | `company-01&#124;company-01-account-01&#124;company-01-campaign-04&#124;company-01-adset-07&#124;company-01-creative-27` | 983.91 | Refresh -> Diagnose | diagnose | Diagnose First |
| 14 | `company-07&#124;company-07-account-01&#124;company-07-campaign-01&#124;company-07-adset-01&#124;company-07-creative-07` | 277.11 | Refresh -> Diagnose | diagnose | Diagnose First |
| 15 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-06&#124;company-05-creative-47` | 61027.88 | Protect -> Refresh | review_only | Refresh Candidates |
| 16 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-49` | 33858.47 | Protect -> Refresh | review_only | Refresh Candidates |
| 17 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-51` | 29265.56 | Protect -> Refresh | review_only | Refresh Candidates |
| 18 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-06&#124;company-05-creative-55` | 23522.86 | Diagnose -> Refresh | review_only | Refresh Candidates |
| 19 | `company-05&#124;company-05-account-01&#124;company-05-campaign-06&#124;company-05-adset-05&#124;company-05-creative-56` | 16255.87 | Protect -> Refresh | review_only | Refresh Candidates |
| 20 | `company-05&#124;company-05-account-01&#124;company-05-campaign-04&#124;company-05-adset-03&#124;company-05-creative-05` | 6991.75 | Diagnose -> Test More | review_only | Test More / Need More Signal |

## Would The UI Be Overwhelming?

It would be overwhelming if v2 were rendered as one flat table sorted only by date or spend. The main reason is the 193 Diagnose rows. The page should avoid a "review everything" experience by separating the work into one above-the-fold summary, one primary queue, and grouped diagnosis clusters.

Recommended default view:

1. Top summary: direct confirmation count, buyer review count, diagnose count, safety flags.
2. Priority rail: top highest-spend decision changes and top high-risk rows.
3. Primary table: Buyer Review by default, not All Rows.
4. Diagnose tab: grouped by blocker reason and collapsed after the highest-spend or highest-risk items.
5. Decision filters: Scale, Cut, Refresh, Protect, Test More, Diagnose.

## Proposed Sorting Order

Default sort for Buyer Review:

1. Risk level: critical, high, medium, low.
2. Spend descending.
3. Current-vs-v2 decision changed before unchanged.
4. Actionability: direct, review_only, diagnose, blocked.
5. Confidence descending.
6. Recent decay or benchmark gap severity.

Default sort for Diagnose First:

1. Blocker severity.
2. Spend descending.
3. Recent conversion stop or source-trust ambiguity.
4. Confidence descending.

Default sort for Protect:

1. Spend descending.
2. Recent stability.
3. Confidence descending.

## Proposed Filters

- Decision: Scale, Cut, Refresh, Protect, Test More, Diagnose.
- Actionability: ready for buyer confirmation, review required, blocked, diagnose first.
- Risk: critical, high, medium, low.
- Changed from current decision: changed, unchanged.
- Active state: active, inactive, unknown.
- Spend band.
- Benchmark relationship: above, around, below, unavailable.
- Recent trend: improving, stable, decaying, stopped converting, unknown.
- Blocker present: yes, no.
- Source/campaign trust: trusted, degraded, unknown.
- Queue/apply preview safety: eligible, not eligible. In v2 preview this should be not eligible for all audited rows.

## Proposed Badges

- Decision badges: Scale, Cut, Refresh, Protect, Test More, Diagnose.
- Actionability badges: Ready for buyer confirmation, Review required, Blocked, Diagnose first.
- Risk badges: Critical, High risk, Medium risk, Low risk.
- Safety badges: Preview only, Queue disabled, Apply disabled.
- Evidence badges: Above benchmark, Below benchmark, Recent decay, Recent stop, Insufficient signal, Source warning, Campaign blocker.
- Change badge: Current decision changed.

## Proposed Empty States And Warnings

- If no v2 preview payload is available: "v2 preview unavailable for this account. Current Creative view is unchanged."
- If no direct candidates exist: "No rows are ready for buyer confirmation. Review candidates and diagnosis remain available."
- If Diagnose rows dominate: "Most rows need source, status, or signal diagnosis before buyer action."
- If queue/apply fields are present: "Preview only. Queue and apply are disabled for v2."
- If benchmark data is missing: "Benchmark unavailable. Review evidence before acting."
- If source/campaign blockers exist: "Blocked by context. Diagnose campaign or source state before action."

## Button Language

Allowed button or link language:

- Open review
- Review required
- View diagnosis
- Compare evidence
- Open detail
- Open current setup
- Copy row ID
- Mark reviewed
- Ready for buyer confirmation
- No action

Forbidden button or link language in v2 preview:

- Apply
- Apply now
- Auto apply
- Queue
- Queue now
- Scale now
- Cut now
- Launch
- Budget increase
- Approve
- Accepted
- Direct scale
- Product-ready

## Handling The Main Live-Audit Actionability Groups

### 193 Diagnose Rows

Diagnose should be a first-class tab, not mixed into the main review queue by default. Group rows by blocker reason, campaign/status ambiguity, source trust, data quality, and insufficient signal. Show the top spend/risk rows first, then collapse the rest behind group expanders. Diagnose rows should not show action buttons.

### 108 Review-Only Rows

Review-only is the main media-buyer queue. These rows should show a clear recommended buyer action, the reason, the benchmark context, recent trend, risk level, and blockers. The button should be "Open review" or "Review required". It should not be "Apply".

### 2 Direct Rows

Direct rows should be shown in a small "Ready for buyer confirmation" section. They should not be auto-applied or queued in v2 preview. The two live-audit direct rows are one Protect and one Test More. Neither is Scale.

## Required Read-Only Preview Data Shape

The preview payload should include:

- Stable sanitized row ID.
- Current main/operator decision.
- v2 primary decision.
- v2 actionability.
- v2 confidence.
- v2 reason tags.
- v2 evidence summary.
- v2 risk level.
- v2 queue/apply eligibility.
- v2 blocker reasons.
- Current queue/apply eligibility if already available.
- Spend, purchases, impressions, ROAS, CPA.
- Recent ROAS and recent purchases.
- Long-window ROAS if available.
- Active benchmark ROAS and CPA.
- Peer median spend.
- Active/inactive state.
- Campaign/adset blocker flags.
- Trust/source/provenance flags.

## Explicit Integration Boundaries

- Do not modify `/api/meta/creatives` for v2 execution behavior.
- Do not replace the current `/api/creatives/decision-os` v1 behavior.
- Do not feed v2 rows into Command Center work-item generation.
- Do not create queue/apply actions from v2 preview rows.
- Do not use v2 preview to change existing quick filters unless those filters are clearly labeled preview-only.
- Do not surface internal evaluation wording, gold-label wording, fixture wording, PR references, ChatGPT, Claude, Codex, or WIP language in product output.

## Commands Run

Commands used to inspect and produce this report:

```bash
git fetch origin main wip/creative-decision-os-v2-baseline-first-2026-04-26
git worktree add /private/tmp/adsecute-v2-surface-contract origin/main -b review/creative-v2-operator-surface-contract-2026-04-26
git status --short --branch
git rev-parse HEAD
git branch --show-current
rg -n "creativeDecisionOs|Decision OS|queueEligible|canApply|pushReadiness|applyEligible|CREATIVE_DECISION_OS|debugPreview|snapshotBypass" app components lib src
git ls-tree -r --name-only origin/wip/creative-decision-os-v2-baseline-first-2026-04-26
git show origin/wip/creative-decision-os-v2-baseline-first-2026-04-26:docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json
git show origin/wip/creative-decision-os-v2-baseline-first-2026-04-26:docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-safety-summary.json
node /tmp/analyze-v2-live-audit.mjs
```

Validation commands run after writing artifacts are recorded in the hygiene section below.

Product tests were not run for this report-only PR because no product code, policy, thresholds, resolver logic, UI, API, queue, or apply behavior changed.

## Hygiene Addendum

Local validation completed on 2026-04-26 before commit/push:

- `git diff --cached --check`: passed
- hidden/bidi/control scan: passed; scanned 2 files
- restricted filename scan: passed; no `.env`, `*.env`, cookie, token, secret, or tmp filenames found in this report folder
- secret/raw-ID scan: passed; no DB URL assignments, database URLs, SSH host strings, private keys, token assignments, cookie assignments, credential assignment patterns, or raw long numeric IDs found
- JSON parse check for `surface-contract-v0.json`: passed

The Draft PR body records the current pushed branch head. The committed handoff file uses `SEE_DRAFT_PR_BODY_CURRENT_HEAD` to avoid embedding a self-referential commit hash that would become stale when the file itself is committed.

## Artifact Paths

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-operator-surface-contract-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-operator-surface-contract-2026-04-26/surface-contract-v0.json`

## Confirmations

- No product code changed.
- No resolver logic changed.
- No thresholds changed.
- No gold labels changed.
- No UI/API/queue/apply integration was added.
- No queue/apply behavior was loosened.
- Artifacts use sanitized IDs only.
- No secrets, `.env` files, tokens, cookies, DB URLs, raw customer names, raw creative names, or private screenshots are included.
