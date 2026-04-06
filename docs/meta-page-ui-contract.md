# Meta Page UI Contract

## Scope

This document describes the current user-visible Meta page at `app/(dashboard)/platforms/meta/page.tsx`.

- It covers the current rendered data and status surfaces on this page only.
- It does not document every route payload field.
- Route payload fields that are not rendered on the current page are not part of this contract.
- Provider readiness and selected-range page readiness are separate concerns on this page.
- Generic shell controls such as the date picker and refresh button are out of scope unless they surface Meta data truth directly.

## Exact code path

Primary page path:

- `app/(dashboard)/platforms/meta/page.tsx`
- `components/meta/meta-campaign-list.tsx`
- `components/meta/meta-campaign-detail.tsx`
- `components/meta/meta-account-recs.tsx`
- `components/meta/meta-breakdown-grid.tsx`

Page routes currently used by the page:

- `app/api/meta/status/route.ts`
- `app/api/meta/summary/route.ts`
- `app/api/meta/campaigns/route.ts`
- `app/api/meta/breakdowns/route.ts`
- `app/api/meta/adsets/route.ts`
- `app/api/meta/recommendations/route.ts`

Status, readiness, and messaging layers currently used by the page:

- `lib/meta/status-types.ts`
- `lib/meta/page-contract.ts`
- `lib/meta/page-readiness.ts`
- `lib/meta/ui-status.ts`
- `lib/meta/ui.ts`
- `lib/sync/sync-status-pill.ts`

Serving split currently used by the page:

- Campaigns: `app/api/meta/campaigns/route.ts`
  - current day: `lib/meta/live.ts#getMetaLiveCampaignRows`
  - non-today: `lib/meta/serving.ts#getMetaWarehouseCampaignTable`
- Summary: `app/api/meta/summary/route.ts`
  - current day: `lib/meta/live.ts#getMetaLiveSummaryTotals` when live totals are available
  - non-today default: `lib/meta/serving.ts#getMetaWarehouseSummary`
- Ad sets drilldown: `app/api/meta/adsets/route.ts`
  - current day: `lib/meta/live.ts#getMetaLiveAdSets`
  - non-today: `lib/meta/serving.ts#getMetaWarehouseAdSets`
- Breakdowns: `app/api/meta/breakdowns/route.ts`
  - current page route currently serves `lib/meta/serving.ts#getMetaWarehouseBreakdowns`
  - readiness/coverage for the breakdown surfaces is tracked independently in `app/api/meta/status/route.ts`
- Recommendations: `app/api/meta/recommendations/route.ts`
  - intentional AI exception
  - keeps snapshot-backed historical bid regime analysis via `lib/meta/config-snapshots.ts`

## Truth-class legend

- `historical_warehouse`
  - Selected non-today range truth served from warehouse/read models.
- `current_day_live`
  - Selected current Meta account day truth served from live Meta reads.
- `conditional_drilldown`
  - Data shown only after a user drills into a selected campaign. Does not block initial page completeness.
- `ai_exception`
  - Intentional AI/recommendations exception. Does not block initial page completeness.

Scope labels used in this document:

- Provider-scoped
  - Integration, assignment, or provider-operational state.
- Page-scoped
  - Selected-range page completeness, empty states, and data surfaces.
- Compatibility-only
  - Payload fields that still exist for compatibility but are not the canonical source of page truth.

## Surface inventory

| Surface | Scope | Required/Optional | Blocking for initial page completeness? |
| --- | --- | --- | --- |
| Provider readiness indicator | Provider-scoped | Required provider surface | No |
| Sync status pill | Page-scoped | Required page status surface | No |
| Meta account day label | Page-scoped | Required page context surface | No |
| Page status banner | Page-scoped | Required page status surface | No |
| KPI row | Page-scoped | Required | Yes |
| Campaign list | Page-scoped | Required | Yes |
| Campaign detail | Page-scoped | Conditional | No |
| Breakdown age card | Page-scoped | Required | Yes |
| Breakdown location card | Page-scoped | Required | Yes |
| Breakdown placement card | Page-scoped | Required | Yes |
| Ad set drilldown | Page-scoped | Optional | No |
| Recommendations panel / recommendation-aware campaign detail | Page-scoped | Optional | No |
| Empty-state / preparing-state messaging | Page-scoped | Required page status surface | No |

## UI Contract Matrix

Only currently rendered fields are listed below. Backend route fields that are not rendered on the current page are excluded on purpose and listed later under "Not part of the current Meta page contract".

| Surface | Field | User-visible? | Scope | Required/Optional | Blocking? | Current-day truth | Historical truth | Backend Route | Backend Function / Helper | Backend Source / Table / Model | Null allowed? | UI behavior when null | Compatibility-only? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Provider readiness indicator | readiness badge + summary | Yes | provider-scoped | Required provider surface | No | `MetaStatusResponse.readinessLevel` and `domainReadiness` from `app/api/meta/status/route.ts` | Same | `/api/meta/status` | `ProviderReadinessIndicator`; provider fields assembled in `app/api/meta/status/route.ts` | provider readiness snapshot + orchestration state | Yes | Indicator hidden when Meta is not connected or status has not loaded | No | Provider-only; does not decide page completeness |
| Sync status pill | compact selected-range state label | Yes | page-scoped | Required page status surface | No | `pageReadiness` with `selectedRangeMode=current_day_live` | `pageReadiness` with `selectedRangeMode=historical_warehouse` | `/api/meta/status` | `resolveMetaSyncStatusPill`; `getMetaPageStatusMessaging` | `MetaStatusResponse.pageReadiness`, sync progress coverage | Yes | Pill hidden if Meta is disconnected or no account is assigned | No | Compact page-scoped summary only |
| Meta account day label | current account day + timezone | Yes | page-scoped | Required page context surface | No | `currentDateInTimezone` and `primaryAccountTimezone` from `/api/meta/status` | Same label still shown as selected-range context | `/api/meta/status` | `fetchMetaStatus`; `formatMetaDate` | status route current account day metadata | Yes | Label omitted when reference date/timezone is unavailable | No | Context label, not readiness |
| Page status banner | title | Yes | page-scoped | Required page status surface | No | `getMetaPageStatusMessaging(...).banner.title` from `pageReadiness` | Same | `/api/meta/status` | `MetaStatusBanner`; `getMetaPageStatusMessaging` | `pageReadiness.reason` plus centralized UI messaging | Yes | Banner hidden when `banner.visible` is false | No | Canonical page explanation |
| Page status banner | description | Yes | page-scoped | Required page status surface | No | `getMetaPageStatusMessaging(...).banner.description` | Same | `/api/meta/status` | `MetaStatusBanner`; `getMetaPageStatusMessaging` | `pageReadiness.reason` plus centralized UI messaging | Yes | Banner hidden when description is null | No | Selected-range page reason |
| KPI row | Total Spend value | Yes | page-scoped | Required | Yes | `/api/meta/summary` live override via `getMetaLiveSummaryTotals`; falls back to campaign rows if summary totals absent | `/api/meta/summary` via `getMetaWarehouseSummary`; falls back to campaign rows if summary totals absent | `/api/meta/summary`, `/api/meta/campaigns`, `/api/meta/status` | `warehouseKpis`, `campaignWarehouseKpis`, `shouldMaskMetaKpisAsPreparing` | live totals or warehouse summary totals, then campaign rows | No | Shows `-` when loading or masked as preparing | No | Current-day mask comes from centralized page messaging contract |
| KPI row | Total Spend sublabel | Yes | page-scoped | Required | Yes | `pageMessages.kpi.spendSubLabel` when masking; otherwise campaign count | Same | `/api/meta/status`, `/api/meta/campaigns` | `getMetaPageStatusMessaging` | `pageReadiness` or campaigns row count | No | Falls back to campaign count text when not masked | No | Page-scoped message, not provider-scoped |
| KPI row | Total Revenue value | Yes | page-scoped | Required | Yes | Same source pattern as Total Spend | Same | `/api/meta/summary`, `/api/meta/campaigns`, `/api/meta/status` | `warehouseKpis`, `campaignWarehouseKpis`, `shouldMaskMetaKpisAsPreparing` | live totals or warehouse summary totals, then campaign rows | No | Shows `-` when loading or masked as preparing | No | Attributed purchase revenue |
| KPI row | Total Revenue sublabel | Yes | page-scoped | Required | Yes | `pageMessages.kpi.revenueSubLabel` when masking; otherwise static attributed-purchases label | Same | `/api/meta/status` | `getMetaPageStatusMessaging` | page readiness messaging | No | Static label when ready | No | |
| KPI row | Avg. CPA value | Yes | page-scoped | Required | Yes | Same source pattern as Total Spend | Same | `/api/meta/summary`, `/api/meta/campaigns`, `/api/meta/status` | `warehouseKpis`, `campaignWarehouseKpis`, `shouldMaskMetaKpisAsPreparing` | live totals or warehouse summary totals, then campaign rows | No | Shows `-` when loading or masked as preparing | No | |
| KPI row | Avg. CPA sublabel | Yes | page-scoped | Required | Yes | `pageMessages.kpi.avgCpaSubLabel` when masking; otherwise static cost-per-conversion label | Same | `/api/meta/status` | `getMetaPageStatusMessaging` | page readiness messaging | No | Static label when ready | No | |
| KPI row | Blended ROAS value | Yes | page-scoped | Required | Yes | Same source pattern as Total Spend | Same | `/api/meta/summary`, `/api/meta/campaigns`, `/api/meta/status` | `warehouseKpis`, `campaignWarehouseKpis`, `shouldMaskMetaKpisAsPreparing` | live totals or warehouse summary totals, then campaign rows | No | Shows `-` when loading or masked as preparing | No | |
| KPI row | Blended ROAS sublabel | Yes | page-scoped | Required | Yes | `pageMessages.kpi.roasSubLabel` when masking; otherwise static combined-campaign label | Same | `/api/meta/status` | `getMetaPageStatusMessaging` | page readiness messaging | No | Static label when ready | No | |
| Campaign list | status filter chips | Yes | page-scoped | Required | No | Client-only local state in `MetaCampaignList` | Same | N/A | `MetaCampaignList` local `statusFilter` state | client local UI state only | No | Filter chips remain visible regardless of backend state | No | UI-only control, but currently rendered |
| Campaign list | Account Overview row label | Yes | page-scoped | Required | No | Client-local selection row | Same | N/A | `MetaCampaignList` | client local selection state only | No | Row always present | No | Selects the non-campaign overview surface |
| Campaign list | campaign name | Yes | page-scoped | Required | Yes | `/api/meta/campaigns` current-day live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | live API rows or `meta_campaign_daily` read model | No | Campaign row omitted if absent | No | |
| Campaign list | recommendation badge (`act` / `test` / `watch`) | Yes | page-scoped | Optional | No | `/api/meta/recommendations` | Same | `/api/meta/recommendations` | `buildMetaRecommendations`; badge selection in page | AI recommendations response | Yes | Badge hidden when there is no recommendation for that campaign | No | AI exception surface |
| Campaign list | objective | Yes | page-scoped | Required | Yes | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | live campaign row or warehouse campaign row | Yes | Objective line hidden when null | No | |
| Campaign list | lane badge | Yes | page-scoped | Required | No | Derived on the page from campaign rows | Same | `/api/meta/campaigns` | `buildMetaCampaignLaneSignals` | client-side derivation from rendered campaign rows | Yes | Hidden when no lane is assigned | No | Derived display, not a route field |
| Campaign list | status dot | Yes | page-scoped | Required | Yes | `/api/meta/campaigns` live status | `/api/meta/campaigns` warehouse status | `/api/meta/campaigns` | `statusDot` in `MetaCampaignList` | campaign row status | No | Dot always shown for rendered campaign rows | No | |
| Campaign list | ROAS | Yes | page-scoped | Required | Yes | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | live campaign rows or `meta_campaign_daily` read model | No | Row omitted if campaign absent | No | |
| Campaign list | Spend | Yes | page-scoped | Required | Yes | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | live campaign rows or `meta_campaign_daily` read model | No | Row omitted if campaign absent | No | |
| Campaign detail | back breadcrumb | Yes | page-scoped | Conditional | No | Client-local selection state | Same | N/A | `MetaCampaignDetail` | client local selection state only | No | Hidden when no campaign is selected | No | |
| Campaign detail | campaign objective | Yes | page-scoped | Conditional | No | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | campaign row objective | Yes | Displays `-` when null | No | |
| Campaign detail | campaign name | Yes | page-scoped | Conditional | No | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | campaign row name | No | Detail hidden until a campaign is selected | No | |
| Campaign detail | campaign status badge | Yes | page-scoped | Conditional | No | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | campaign row status | No | Detail hidden until a campaign is selected | No | |
| Campaign detail | selected-campaign AI recommendation card | Yes | page-scoped | Optional | No | `/api/meta/recommendations` | Same | `/api/meta/recommendations` | `buildMetaRecommendations`; selection in `MetaCampaignDetail` | AI recommendation model | Yes | Card hidden when no recommendation exists for the selected campaign | No | AI exception |
| Campaign detail | Spend / Revenue / ROAS / CPA metric tiles | Yes | page-scoped | Conditional | No | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | campaign row metrics | No | Tiles hidden until a campaign is selected | No | |
| Campaign detail | Budget tile current value | Yes | page-scoped | Conditional | No | `/api/meta/campaigns` live rows | `/api/meta/campaigns` warehouse rows | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | current daily or lifetime budget on campaign row | Yes | Entire Budget tile is hidden when both current budget fields are null | No | |
| Campaign detail | Budget tile previous value + age | Yes | page-scoped | Conditional | No | `/api/meta/campaigns?includePrev=1` live current-day previous config | `/api/meta/campaigns?includePrev=1` warehouse-derived previous config | `/api/meta/campaigns` | `getMetaLiveCampaignRows`; `getMetaWarehouseCampaignTable` | live config helper or warehouse history derivation | Yes | Previous budget subtext hidden when previous budget is null | No | |
| Breakdown location card | country rows (label, ROAS, spend share bar, spend) | Yes | page-scoped | Required | Yes | `/api/meta/breakdowns` selected current range branch | `/api/meta/breakdowns` warehouse breakdown rows | `/api/meta/breakdowns` | `getMetaWarehouseBreakdowns` in current route implementation | breakdown rows returned by route | Yes | Shows loading skeleton first, then "No location data." when empty | No | Required page breakdown surface |
| Breakdown age card | age rows (label, ROAS badge, spend) | Yes | page-scoped | Required | Yes | `/api/meta/breakdowns` selected current range branch | `/api/meta/breakdowns` warehouse breakdown rows | `/api/meta/breakdowns` | `getMetaWarehouseBreakdowns` in current route implementation | breakdown rows returned by route | Yes | Shows loading skeleton first, then "No age breakdown data." when empty | No | Shown inside the collapsible account overview grid |
| Breakdown placement card | placement chart rows | Yes | page-scoped | Required | Yes | `/api/meta/breakdowns` selected current range branch | `/api/meta/breakdowns` warehouse breakdown rows | `/api/meta/breakdowns` | `getMetaWarehouseBreakdowns` in current route implementation | breakdown rows returned by route | Yes | Shows loading skeleton first; chart handles empty rows | No | Shown inside the collapsible account overview grid |
| Recommendations panel | account-level AI recommendations run/re-analyze button | Yes | page-scoped | Optional | No | `/api/meta/recommendations` | Same | `/api/meta/recommendations` | `buildMetaRecommendations` | AI recommendation model | No | Button label changes with local loading and checked state | No | AI exception |
| Recommendations panel | last analyzed relative time | Yes | page-scoped | Optional | No | client-local `lastAnalyzedAt` set after manual analyze | Same | N/A | `MetaAccountRecs` | client local page state only | Yes | Hidden until analysis has been run in the current page session | No | Current code does not persist this across reloads |
| Recommendations panel | account-level recommendation cards | Yes | page-scoped | Optional | No | `/api/meta/recommendations` | Same | `/api/meta/recommendations` | `buildMetaRecommendations` | AI recommendation model | Yes | Empty copy shown when analysis exists but no account-level signals were returned | No | AI exception |
| Ad set drilldown | ad set name | Yes | page-scoped | Optional | No | `/api/meta/adsets` live rows | `/api/meta/adsets` warehouse rows | `/api/meta/adsets` | `getMetaLiveAdSets`; `getMetaWarehouseAdSets` | live ad set rows or `meta_adset_daily` read model | No | Section hidden until a campaign is selected | No | Conditional drilldown |
| Ad set drilldown | optimization goal | Yes | page-scoped | Optional | No | `/api/meta/adsets` live rows | `/api/meta/adsets` warehouse rows | `/api/meta/adsets` | `getMetaLiveAdSets`; `getMetaWarehouseAdSets` | live ad set rows or `meta_adset_daily` read model | Yes | Goal line hidden when null | No | |
| Ad set drilldown | bid strategy label + current bid value | Yes | page-scoped | Optional | No | `/api/meta/adsets` live rows | `/api/meta/adsets` warehouse rows | `/api/meta/adsets` | `getMetaLiveAdSets`; `getMetaWarehouseAdSets` | live ad set rows or `meta_adset_daily` read model | Yes | Current bid value hidden when null; label falls back to `Auto` in UI | No | |
| Ad set drilldown | previous bid value + age | Yes | page-scoped | Optional | No | `/api/meta/adsets` live rows with `includePrev=false` on current page path still return current row previous fields when available | `/api/meta/adsets` warehouse rows with derived previous fields | `/api/meta/adsets` | `getMetaLiveAdSets`; `getMetaWarehouseAdSets` | live config helper or warehouse history derivation | Yes | Hidden when previous bid fields are null | No | Current page does not request `includePrev=1` for ad sets |
| Ad set drilldown | Spend / ROAS / CPA / CTR | Yes | page-scoped | Optional | No | `/api/meta/adsets` live rows | `/api/meta/adsets` warehouse rows | `/api/meta/adsets` | `getMetaLiveAdSets`; `getMetaWarehouseAdSets` | live ad set rows or `meta_adset_daily` read model | No | Empty copy shown when the selected range has no ad set rows | No | |
| Empty-state / preparing-state | title | Yes | page-scoped | Required page status surface | No | `getMetaPageStatusMessaging(...).emptyState.title` or `readyButEmpty` variant | Same | `/api/meta/status` and page row presence | `getMetaPageStatusMessaging`; `DataEmptyState` | page readiness + whether campaign row count is zero | No | Empty-state appears only when campaign query succeeds with zero rows | No | Distinguishes not-ready vs ready-but-empty |
| Empty-state / preparing-state | description | Yes | page-scoped | Required page status surface | No | `pageMessages.currentDayPreparing.description` for current-day preparing; otherwise `pageMessages.emptyState.description` or `readyButEmpty` variant | Same | `/api/meta/status` and page row presence | `getMetaPageStatusMessaging`; `DataEmptyState` | page readiness + whether campaign row count is zero | No | Selected-range page semantics only | No | |

## Compatibility-only fields

These fields still exist in current contracts, but they are not the canonical source of truth for the current Meta page anymore.

- `MetaStatusResponse.state`
  - Still present for compatibility and operational summaries.
  - Page-wide completeness now comes from `MetaStatusResponse.pageReadiness`.
- `MetaStatusResponse.readinessLevel`
  - Still used by `ProviderReadinessIndicator`.
  - It is provider-scoped and not the canonical page completeness contract.
- `MetaStatusResponse.currentCoreUsable`
  - Compatibility field only.
  - The page uses `pageReadiness.usable` for selected-range usability.
- `warehouse.coverage.breakdowns`
  - Aggregated compatibility field only.
  - Exact page completeness uses `warehouse.coverage.breakdownsBySurface` and the required surface objects in `pageReadiness`.
- Route-level `isPartial` and `notReadyReason` fields from page data routes
  - Still exist on route payloads such as `/api/meta/campaigns`, `/api/meta/summary`, `/api/meta/breakdowns`, and `/api/meta/adsets`.
  - They are compatibility signals, not the canonical selected-range page completeness contract.
  - For historical non-today ranges they must mirror the canonical selected-range truth instead of deriving readiness from row presence alone.

## Historical Verified Truth

- When `META_AUTHORITATIVE_FINALIZATION_V2` is enabled, historical non-today Meta page routes only treat published verified truth as finalized.
- `pageReadiness` remains the canonical selected-range contract.
- Historical route payloads may still expose compatibility fields such as `isPartial` and `notReadyReason`, but those fields must mirror canonical selected-range truth.
- Historical status semantics use the verification states `processing`, `finalized_verified`, `failed`, and `repair_required`.
- Historical status payloads may expose provenance fields such as `sourceFetchedAt`, `publishedAt`, `verificationState`, and `asOf`.
- Current-day Meta account-day behavior remains live and timezone-driven.

## Not part of the current Meta page contract

The following backend fields or structures exist but are not currently rendered on this page, so they are excluded from the matrix above.

- Unrendered campaign route fields from `MetaCampaignRow`
  - Example: `manualBidAmount`, `previousManualBidAmount`, `bidStrategyType`, `isBudgetMixed`, `isConfigMixed`, `isOptimizationGoalMixed`, `isBidStrategyMixed`, `isBidValueMixed`, `previousSpend`, `previousRevenue`, `previousRoas`, `previousCpa`, `recommendationCount`, `topActionHint`, `isFocused`
- Unrendered ad set route fields beyond the visible drilldown fields
  - Example: raw `revenue`, `purchases`, `cpm`, `impressions`, `clicks`, `dailyBudget`, `lifetimeBudget`, `previousDailyBudget`, `previousLifetimeBudget`, `manualBidAmount`, `previousManualBidAmount`, mixed flags
- Breakdowns route payload fields not currently rendered on the page
  - `budget`
  - `audience`
  - `products`
- Status/backend structures not rendered directly on the page
  - `latestSync`
  - `operations`
  - `jobHealth`
  - `rangeCompletionBySurface`
  - `priorityWindow`
  - `currentDayLive`
  - `warehouse.coverage.scopes`
  - `warehouse.coverage.creatives`
- Internal helper-layer payloads that are not rendered directly
  - raw snapshot endpoint coverage maps
  - repair/requeue state
  - recommendations historical bid regime windows

This exclusion is intentional. Existing payload presence does not make a field part of the current Meta page UI contract.

## Update discipline

- If a field becomes user-visible on the Meta page, update this document in the same change.
- If a user-visible field changes truth source, nullability, or readiness semantics, update this document in the same change.
- If the surface model changes, update `lib/meta/page-contract.ts` and its tests in the same change.
