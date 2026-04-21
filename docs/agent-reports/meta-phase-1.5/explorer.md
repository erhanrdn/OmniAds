# Explorer Report

Branch under review: `feature/meta-decision-os-operator-system`
Target/base: `main`
Known commit: `a709481` (`Add Meta Decision OS analysis state safeguards`)

## Commands Run

- `git branch --show-current`
  - Output: `feature/meta-decision-os-operator-system`
- `git status --short --branch`
  - Output: clean worktree, tracking `origin/feature/meta-decision-os-operator-system`
- `git rev-list --count main..HEAD`
  - Output: `1`
- `git log --oneline main..HEAD`
  - Output: `a709481 Add Meta Decision OS analysis state safeguards`
- `git diff --name-only main..HEAD`
  - Output: 13 changed files, listed below
- `git diff --stat main..HEAD`
  - Output: 2,238 insertions and 578 deletions across the 13 files
- `rg --files ...`
  - Output: `playwright.config.ts` exists; Meta app/routes/tests are present
- `rg -n "process\\.env\\.[A-Z0-9_]+" .`
  - Output: environment variable names only, listed below

## Branch Inventory

- Current branch: `feature/meta-decision-os-operator-system`
- Git status: clean
- Commits ahead of `main`: `1`
- Changed files vs `main`:
  - `app/(dashboard)/platforms/meta/page.test.tsx`
  - `app/(dashboard)/platforms/meta/page.tsx`
  - `app/api/meta/recommendations/route.test.ts`
  - `app/api/meta/recommendations/route.ts`
  - `components/meta/meta-analysis-status-card.test.tsx`
  - `components/meta/meta-analysis-status-card.tsx`
  - `components/meta/meta-campaign-detail.test.tsx`
  - `components/meta/meta-campaign-detail.tsx`
  - `components/meta/meta-decision-os.test.tsx`
  - `components/meta/meta-decision-os.tsx`
  - `lib/meta/analysis-state.test.ts`
  - `lib/meta/analysis-state.ts`
  - `lib/meta/recommendations.ts`

## Package Scripts

Present scripts of interest in `package.json`:

- `test` -> `vitest run`
- `test:local-db` -> `node --import tsx scripts/with-local-postgres.ts -- vitest run`
- `test:watch` -> `vitest`
- `test:e2e` -> `playwright test`
- `test:smoke:local` -> build + Playwright against `http://127.0.0.1:3000`
- `test:smoke:live` -> Playwright against `https://adsecute.com`
- `dev` -> `next dev --webpack --hostname 0.0.0.0 --port 3000`
- `dev:local` -> local Postgres wrapper + `next dev`
- `dev:turbo` -> `next dev --turbopack`
- `build` -> `next build --webpack`
- `start` -> `next start`
- No `lint` script is present

## Runtime / Live Prerequisites

Environment variable names visible in the repo/search, without values:

`ALLOW_INSECURE_LOCAL_AUTH_COOKIE`, `APP_BUILD_ID`, `APP_LOG_LEVEL`, `AUTH_DEBUG`, `CI`, `COMMAND_CENTER_EXECUTION_V1`, `COMMERCIAL_SMOKE_OPERATOR_EMAIL`, `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID`, `CRON_SECRET`, `DATABASE_URL`, `DB_APPLICATION_NAME`, `DB_DROP_LEGACY_CORE_TABLES`, `DB_ENABLE_LEGACY_CORE_COMPAT_TABLES`, `DB_WEB_POOL_MAX`, `DB_WEB_QUERY_TIMEOUT_MS`, `DEMO_USER_EMAIL`, `DEPLOY_MIGRATION_TIMEOUT_MS`, `DISABLE_WEBPACK_CACHE`, `ENABLE_RUNTIME_MIGRATIONS`, `GITHUB_ACTOR`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_TOKEN`, `GOOGLE_ADS_API_VERSION`, `GOOGLE_ADS_CAMPAIGN_CORE_LIMIT`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DAILY_REQUEST_BUDGET_PER_BUSINESS`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_ENABLE_IN_PROCESS_RUNTIME`, `GOOGLE_ADS_EXTENDED_GENERAL_REOPEN`, `GOOGLE_ADS_EXTENDED_HISTORICAL_PRESSURE_LIMIT`, `GOOGLE_ADS_INCIDENT_SAFE_MODE`, `GOOGLE_ADS_RETENTION_BATCH_SIZE`, `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`, `GOOGLE_ADS_RETENTION_LEASE_MINUTES`, `GOOGLE_ADS_RETENTION_QUERY_TIMEOUT_MS`, `GOOGLE_ADS_WORKER_ID`, `GOOGLE_ANALYTICS_REDIRECT_URI`, `GOOGLE_ANALYTICS_SCOPES`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `HOSTNAME`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `LOCAL_POSTGRES_DATA_DIR`, `LOCAL_POSTGRES_HOST`, `LOCAL_POSTGRES_LOG_DIR`, `LOCAL_POSTGRES_LOG_FILE`, `LOCAL_POSTGRES_PG_CTL`, `LOCAL_POSTGRES_PG_ISREADY`, `LOCAL_POSTGRES_PORT`, `LOCAL_POSTGRES_VOLUME_PATH`, `LOCAL_SYNC_DEFAULT_BUSINESS_NAMES`, `LOCAL_SYNC_MODE`, `LOCAL_SYNC_SOURCE_DATABASE_URL`, `LOCAL_SYNC_SOURCE_REMOTE_PORT`, `LOCAL_SYNC_SOURCE_SSH_HOST`, `LOCAL_SYNC_STATE_FILE`, `META_ACCOUNT_CONTEXT_CACHE_TTL_MS`, `META_APP_ID`, `META_APP_SECRET`, `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES`, `META_AUTHORITATIVE_FINALIZATION_V2`, `META_CREATIVES_DEBUG_GROUPING`, `META_DEBUG_PRIORITY_BUSINESS_IDS`, `META_DECISION_OS_CANARY_BUSINESSES`, `META_DECISION_OS_V1`, `META_ENABLE_IN_PROCESS_RUNTIME`, `META_EXECUTION_APPLY_ENABLED`, `META_MEMORY_FLUSH_THRESHOLD_ROWS`, `META_PAGE_STATUS_CACHE_TTL_MS`, `META_PREVIEW_DEBUG`, `META_RECENT_RECOVERY_DAYS`, `META_RETENTION_BATCH_SIZE`, `META_RETENTION_EXECUTION_ENABLED`, `META_RETENTION_LEASE_MINUTES`, `META_RETENTION_QUERY_TIMEOUT_MS`, `META_STATUS_CACHE_TTL_MS`, `META_WORKER_CONCURRENCY`, `META_WORKER_ID`, `MIGRATION_TIMEOUT_MS`, `NEXT_BUILD_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_OVERVIEW_API_URL`, `NODE_ENV`, `OPENAI_API_KEY`, `PERF_DEBUG`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_EXECUTION_CANARY_BUSINESS_ID`, `PLAYWRIGHT_REUSE_EXISTING_SERVER`, `PLAYWRIGHT_USE_WEBSERVER`, `PORT`, `RAILWAY_GIT_COMMIT_SHA`, `RELEASE_AUTHORITY_PREVIOUS_KNOWN_GOOD_SHA`, `RELEASE_AUTHORITY_PREVIOUS_KNOWN_GOOD_SOURCE`, `RELEASE_AUTHORITY_REMOTE_MAIN_SHA`, `RENDER_GIT_COMMIT`, `SHOPIFY_ADMIN_API_VERSION`, `SHOPIFY_ANALYTICS_API_VERSION`, `SHOPIFY_APP_HANDLE`, `SHOPIFY_APP_URL`, `SHOPIFY_BILLING_API_VERSION`, `SHOPIFY_BILLING_CURRENCY`, `SHOPIFY_CANARY_TRUST_TTL_MINUTES`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_CUSTOMER_EVENTS_SECRET`, `SHOPIFY_HISTORICAL_SYNC_CHUNKS_PER_RUN`, `SHOPIFY_HISTORICAL_SYNC_ENABLED`, `SHOPIFY_ORDERS_MAX_PAGES_PER_WINDOW`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_RETURNS_MAX_PAGES_PER_WINDOW`, `SHOPIFY_REVIEWER_EMAIL`, `SHOPIFY_SCOPES`, `SHOPIFY_SYNC_ENABLED`, `SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER`, `SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER_MAX_AGE_MINUTES`, `SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER_MIN_LEDGER_RUNS`, `SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER_MIN_STABLE_RUNS`, `SHOPIFY_WAREHOUSE_PREVIEW_CANARY_BUSINESSES`, `SHOPIFY_WAREHOUSE_READ_CANARY`, `SIGN_WITH_FACEBOOK_REDIRECT_URI`, `SIGN_WITH_GOOGLE_CLIENT_ID`, `SIGN_WITH_GOOGLE_CLIENT_SECRET`, `SIGN_WITH_GOOGLE_REDIRECT_URI`, `SIGN_WITH_GOOGLE_SCOPES`, `STARTUP_DEBUG`, `SYNC_CRON_ENFORCE_SOAK_GATE`, `SYNC_DEPLOY_GATE_MODE`, `SYNC_RELEASE_CANARY_BUSINESSES`, `SYNC_RELEASE_GATE_MODE`, `SYNC_RETENTION_BATCH_SIZE`, `SYNC_RETENTION_LEASE_MINUTES`, `SYNC_RETENTION_QUERY_TIMEOUT_MS`, `SYNC_WORKER_MODE`, `TZ`, `VITEST`, `WORKER_GLOBAL_DB_CONCURRENCY`, `WORKER_INSTANCE_ID`, `WORKER_MAX_BUSINESSES_PER_TICK`, `WORKER_PARTITION_TICK_LIMIT`, `WORKER_POLL_INTERVAL_MS`, `WORKER_RUNNER_LEASE_MINUTES`

## Browser Tool

- `playwright.config.ts` exists.
- `test:e2e` and `test:smoke:*` scripts use Playwright.
- This repo therefore has a browser automation path available for local checks.

## Local API Routes

### `app/api/meta/recommendations/route.ts`

- Handles `GET` with `businessId`, `startDate`, and `endDate` query params.
- Returns 400 when required params are missing.
- Feature-gated Decision OS path:
  - `isMetaDecisionOsV1EnabledForBusiness(businessId)` controls the unified path.
  - Fallback payload is tagged with `analysisSource.system = "snapshot_fallback"` and `fallbackReason`.
  - Demo businesses return `analysisSource.system = "demo"`.
- Relevant lines: `47-64`, `67-119`, `121-170`, `172-298` in `app/api/meta/recommendations/route.ts`

### `app/api/meta/decision-os/route.ts`

- Handles `GET` with required `businessId`; optional `startDate` and `endDate` default to a 30-day window.
- Returns 404 when `META` Decision OS is feature-gated off for the workspace.
- Returns the base Meta Decision OS payload and optionally adds Creative linkage.
- Relevant lines: `21-88` in `app/api/meta/decision-os/route.ts`

### Local callability

- Unit tests invoke both handlers through `new NextRequest("http://localhost/...")`, which means the route code is callable locally in test harnesses.
- `app/api/meta/recommendations/route.test.ts`: `152-195`
- `app/api/meta/decision-os/route.test.ts`: `216-256`
- Actual server reachability on a running local app: requires runtime verification

## Relevant Meta Files

### `lib/meta/analysis-state.ts`

- Adds the analysis-state model and normalization used by the UI.
- Key logic:
  - `MetaAnalysisState`, `MetaDecisionOsDisplayStatus`, `MetaPresentationMode` definitions at `7-35`
  - `getMetaRecommendationSource()` at `124-139`
  - `getMetaDecisionOsDegradedReasons()` at `156-190`
  - `deriveMetaAnalysisStatus()` at `242-407`
  - `didMetaAnalysisRefetchProduceUsableData()` at `441-453`
- Important safeguard behavior:
  - Range mismatch becomes `error`
  - Snapshot fallback becomes `recommendation_fallback`
  - Decision OS errors stay separate from recommendation source
  - Decision OS recommendations can be shown as `decision_os_recommendation_context` without claiming the full surface is ready

### `components/meta/meta-analysis-status-card.tsx`

- Renders the analysis-status summary card and surfaces:
  - running state
  - Decision OS status
  - recommendation source
  - presentation mode
  - safe error message
  - analyzed range and timestamp
- Relevant lines: `39-113`

### `components/meta/meta-decision-os.tsx`

- Renders the Decision OS panels and lists for campaigns, ad sets, winners, opportunity board, GEO, and placement views.
- Relevant lines:
  - decision surfaces and chips: `72-140`
  - ad set and campaign rows: `142-255`
  - winner scale and opportunity board rows: `258-340`

### `components/meta/meta-campaign-detail.tsx`

- The campaign headline demotes recommendation content to context unless `analysisStatus.presentationMode === "decision_os_primary"`.
- Snapshot fallback gets explicit context copy.
- Relevant lines: `190-324`

### `app/(dashboard)/platforms/meta/page.tsx`

- Fetches both recommendation and Decision OS payloads from local API routes.
- `fetchMetaRecommendations()` at `112-126`
- `fetchMetaDecisionOs()` at `128-144`
- Query wiring for `meta-recommendations-v8` and `meta-decision-os` at `724-737`
- Status derivation at `740-755`
- Status card and campaign detail wiring at `1420-1441`

### `lib/meta/recommendations.ts`

- Extends the response shape with `analysisSource`.
- Relevant lines:
  - `MetaRecommendationAnalysisSourceSystem` and `MetaRecommendationsResponse` at `104-125`
  - `attachAnalysisSource()` usage in route is reflected by this contract

## Related Tests

- `lib/meta/analysis-state.test.ts`
  - Covers not-run, running, Decision OS ready, snapshot fallback, demo context, range mismatch, and safe error behavior.
  - Relevant lines: `65-260`
- `components/meta/meta-analysis-status-card.test.tsx`
  - Covers rendering for not-run, fallback, Decision OS recommendation context, demo context, and running states.
  - Relevant lines: `27-130`
- `app/api/meta/recommendations/route.test.ts`
  - Covers snapshot fallback and Decision OS unified-path tagging.
  - Relevant lines: `136-213`
- `app/api/meta/decision-os/route.test.ts`
  - Covers successful payload build and 404 gating.
  - Relevant lines: `46-135`, `216-257`
- `app/(dashboard)/platforms/meta/page.test.tsx`
  - Covers analysis running and Decision OS recommendation context.
  - Relevant lines: `612-640`
- `components/meta/meta-campaign-detail.test.tsx`
  - Covers fallback context behavior for campaign details.
  - Relevant lines: `347-387`, `389-430`

## Explorer Conclusion

Branch inventory complete.
Blockers: live/local runtime endpoint verification is not performed here, so local server reachability for `/api/meta/recommendations` and `/api/meta/decision-os` remains requires runtime verification.
