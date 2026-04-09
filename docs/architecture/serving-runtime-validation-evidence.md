# Serving Runtime Validation Evidence

Date: 2026-04-09

Status: pass; Phase 9 runtime truth closed

This artifact records real runtime evidence for the in-scope serving/projection/cache surfaces on branch `arch/wire-serving-owner-triggers`.

## Environment

- Environment class used: local Next.js app process already listening on `http://127.0.0.1:3000`, backed by the live-like Neon database configured in local env.
- Runtime access method: authenticated HTTP `GET` requests against the real app routes plus direct execution of the existing CLI/sync owner entrypoints.
- Secrets, cookies, account emails, shop domains, and business identifiers are redacted here. One non-demo business with active GA4, Search Console, and Shopify integrations was used throughout and is referred to as `<BUSINESS_ID>`.
- A temporary session row and cookie were created only in `/tmp` for this run and were not committed.

## Scope Under Test

Validated surfaces:

- `platform_overview_summary_ranges`
- `provider_reporting_snapshots`
  - `ga4_analytics_overview`
  - `ga4_detailed_audience`
  - `ga4_detailed_cohorts`
  - `ga4_detailed_demographics`
  - `ga4_landing_page_performance_v1`
  - `ga4_detailed_landing_pages`
  - `ga4_detailed_products`
  - `ecommerce_fallback`
  - `overview_shopify_orders_aggregate_v6`
- `seo_results_cache`
  - `overview`
  - `findings`
- `shopify_serving_state`
- `shopify_reconciliation_runs`

## Exact Runtime Commands Executed

Local runtime discovery:

```bash
lsof -iTCP:3000 -sTCP:LISTEN -n -P
curl -sS -o /tmp/omniads-root.html -D - http://127.0.0.1:3000/
```

Temporary authenticated session creation:

```bash
node --env-file=.env.local --input-type=module <<'EOF'
import { randomBytes, createHash } from 'crypto';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const sql = neon(process.env.DATABASE_URL);
const userId = '<REDACTED_ACTIVE_MEMBER_USER_ID>';
const activeBusinessId = '<BUSINESS_ID>';
const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
await sql`
  INSERT INTO sessions (user_id, token_hash, active_business_id, expires_at)
  VALUES (${userId}::uuid, ${tokenHash}, ${activeBusinessId}::uuid, ${expiresAt})
`;
fs.writeFileSync('/tmp/omniads_session_cookie.txt', token, { mode: 0o600 });
EOF
```

Reusable before/after serving snapshot command:

```bash
node --env-file=.env.local /tmp/serving_runtime_snapshot.mjs <BUSINESS_ID> /tmp/<snapshot>.json
node /tmp/serving_runtime_diff.mjs /tmp/<before>.json /tmp/<after>.json
```

Repeated authenticated GET traffic:

```bash
COOKIE=$(cat /tmp/omniads_session_cookie.txt)
for round in 1 2; do
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/overview?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/overview-summary?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21&compareMode=none"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/overview-sparklines?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/overview?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/audience?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/cohorts?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/demographics?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21&dimension=country"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/landing-page-performance?businessId=<BUSINESS_ID>&startDate=2026-03-01&endDate=2026-03-31"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/landing-pages?businessId=<BUSINESS_ID>&startDate=2025-12-23&endDate=2026-03-22"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/analytics/products?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/seo/overview?businessId=<BUSINESS_ID>&startDate=2026-03-09&endDate=2026-04-08"
  curl -sS -o /tmp/body.json -w '%{http_code}\n' -H "Cookie: omniads_session=$COOKIE" \
    "http://127.0.0.1:3000/api/seo/findings?businessId=<BUSINESS_ID>&startDate=2026-03-01&endDate=2026-03-31"
done
```

Explicit owner triggers:

```bash
node --env-file=.env.local --import tsx scripts/materialize-overview-summary-range.ts \
  --business-id <BUSINESS_ID> \
  --provider google \
  --start-date 2026-03-21 \
  --end-date 2026-03-21

node --env-file=.env.local --import tsx scripts/warm-user-facing-report-cache.ts \
  --business-id <BUSINESS_ID> \
  --report-type ga4_detailed_demographics \
  --start-date 2026-03-01 \
  --end-date 2026-03-31 \
  --dimension city

node --env-file=.env.local --import tsx scripts/warm-user-facing-report-cache.ts \
  --business-id <BUSINESS_ID> \
  --report-type overview_shopify_orders_aggregate_v6 \
  --start-date 2026-03-01 \
  --end-date 2026-03-31

node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/ga4-sync.ts'); const result = await mod.default.syncGA4Reports('<BUSINESS_ID>'); console.log(JSON.stringify(result, null, 2));"

node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/search-console-sync.ts'); const result = await mod.default.syncSearchConsoleReports('<BUSINESS_ID>'); console.log(JSON.stringify(result, null, 2));"

node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: true, triggerReason: 'runtime_validation' }); console.log(JSON.stringify(result, null, 2));"
```

Phase 9 closeout reruns reused the same constrained Shopify owner command above. A non-committed local wait/poll shell wrapper surrounded that command; it only took exact before/after snapshots for the recent `7d` Shopify surfaces, polled those markers every `10s` for `120s`, sent `SIGINT` when the owner process was still live, and captured the owner log.

## Exact GET Routes Exercised

All route calls below returned `200` twice with the same authenticated session:

- `GET /api/overview?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21`
- `GET /api/overview-summary?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21&compareMode=none`
- `GET /api/overview-sparklines?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21`
- `GET /api/analytics/overview?businessId=<BUSINESS_ID>&startDate=2026-03-21&endDate=2026-03-21`
- `GET /api/analytics/audience?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21`
- `GET /api/analytics/cohorts?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21`
- `GET /api/analytics/demographics?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21&dimension=country`
- `GET /api/analytics/landing-page-performance?businessId=<BUSINESS_ID>&startDate=2026-03-01&endDate=2026-03-31`
- `GET /api/analytics/landing-pages?businessId=<BUSINESS_ID>&startDate=2025-12-23&endDate=2026-03-22`
- `GET /api/analytics/products?businessId=<BUSINESS_ID>&startDate=2025-12-22&endDate=2026-03-21`
- `GET /api/seo/overview?businessId=<BUSINESS_ID>&startDate=2026-03-09&endDate=2026-04-08`
- `GET /api/seo/findings?businessId=<BUSINESS_ID>&startDate=2026-03-01&endDate=2026-03-31`

## Before/After Snapshot Summary

### GET Phase

- Before snapshot: `2026-04-09T14:18:59.692Z`
- After snapshot: `2026-04-09T14:21:24.509Z`

Exact keys exercised by GET remained unchanged:

- `platform_overview_summary_ranges` google `2026-03-21..2026-03-21`
- `provider_reporting_snapshots`
  - `ga4_analytics_overview` for `2026-03-21..2026-03-21`
  - `ga4_detailed_audience` for `2025-12-22..2026-03-21`
  - `ga4_detailed_cohorts` for `2025-12-22..2026-03-21`
  - `ga4_detailed_demographics` for `dimension=country`, `2025-12-22..2026-03-21`
  - `ga4_landing_page_performance_v1` for `2026-03-01..2026-03-31`
  - `ga4_detailed_landing_pages` for `2025-12-23..2026-03-22`
  - `ga4_detailed_products` for `2025-12-22..2026-03-21`
  - `ecommerce_fallback` tracked stable key
  - `overview_shopify_orders_aggregate_v6` for `2026-03-21..2026-03-21`
- `seo_results_cache`
  - `overview` for `2026-03-09..2026-04-08`
  - `findings` for `2026-03-01..2026-03-31`
- `shopify_serving_state` tracked exact `overview_shopify:2026-03-21:2026-03-21:shop_local` row
- `shopify_reconciliation_runs` tracked exact `2026-03-21..2026-03-21` rows

Observed concurrent owner advancement during the GET window:

- `seo_results_cache overview 30d` advanced from `2026-04-09 14:20:16.228503+00`
- `seo_results_cache overview 7d` advanced from `2026-04-09 14:20:26.403745+00`
- Matching `provider_sync_jobs` rows show explicit `search_console` owner completions, not GET writes:
  - `2026-03-10:2026-04-09` completed `2026-04-09 14:20:16.246281+00`
  - `2026-04-02:2026-04-09` completed `2026-04-09 14:20:26.424398+00`

Conclusion for GET phase:

- Repeated authenticated GET traffic did not change the exact in-scope keys exercised by those GET requests.
- One business-wide watermark changed concurrently in `seo_results_cache`, but the matching `provider_sync_jobs` rows show the writer was the explicit `search-console-sync` owner lane, not a read path.

### Owner Phase

Overview summary CLI owner:

- Trigger: `scripts/materialize-overview-summary-range.ts`
- Exact key changed: `platform_overview_summary_ranges` google `2026-03-21..2026-03-21`
- `updated_at`: `2026-04-08 10:48:34.176645+00` -> `2026-04-09 14:22:44.2694+00`

Manual GA4 detail cache warmer:

- Trigger: `scripts/warm-user-facing-report-cache.ts`
- Exact key changed: `provider_reporting_snapshots.ga4_detailed_demographics` for `dimension=city`, `2026-03-01..2026-03-31`
- Row state: `0` -> `1`
- `updated_at`: `null` -> `2026-04-09 14:23:13.785012+00`

Manual Shopify overview snapshot warmer:

- Trigger: `scripts/warm-user-facing-report-cache.ts`
- Exact key changed: `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` for `2026-03-01..2026-03-31`
- Row state: already present
- `updated_at`: `2026-04-07 09:12:20.996671+00` -> `2026-04-09 14:23:44.890687+00`

GA4 sync owner:

- Trigger: `lib/sync/ga4-sync.ts`
- Result: `attempted=2`, `succeeded=2`, `failed=0`, `skipped=false`
- Exact default-window keys created or advanced:
  - `ga4_analytics_overview` `30d` -> `2026-04-09 14:24:54.106424+00`
  - `ga4_analytics_overview` `7d` -> `2026-04-09 14:25:03.546065+00`
  - `ecommerce_fallback` `30d` -> `2026-04-09 14:24:55.158144+00`
  - `ecommerce_fallback` `7d` -> `2026-04-09 14:25:04.592961+00`
  - `ga4_detailed_audience` `30d` -> `2026-04-09 14:24:56.071823+00`
  - `ga4_detailed_audience` `7d` -> `2026-04-09 14:25:05.645759+00`
  - `ga4_detailed_cohorts` `30d` -> `2026-04-09 14:24:56.92753+00`
  - `ga4_detailed_cohorts` `7d` -> `2026-04-09 14:25:06.690927+00`
  - `ga4_detailed_demographics dimension=country` `30d` -> `2026-04-09 14:24:57.833095+00`
  - `ga4_detailed_demographics dimension=country` `7d` -> `2026-04-09 14:25:08.264807+00`
  - `ga4_landing_page_performance_v1` `30d` -> `2026-04-09 14:24:59.881609+00`
  - `ga4_landing_page_performance_v1` `7d` -> `2026-04-09 14:25:10.411714+00`
  - `ga4_detailed_landing_pages` `30d` -> `2026-04-09 14:25:00.607807+00`
  - `ga4_detailed_landing_pages` `7d` -> `2026-04-09 14:25:11.585731+00`
  - `ga4_detailed_products` `30d` -> `2026-04-09 14:25:01.803499+00`
  - `ga4_detailed_products` `7d` -> `2026-04-09 14:25:12.606591+00`

Search Console sync owner:

- Trigger: `lib/sync/search-console-sync.ts`
- Result: `attempted=2`, `succeeded=2`, `failed=0`, `skipped=false`
- Exact default-window keys created or advanced:
  - `seo_results_cache overview 30d` -> `2026-04-09 14:26:00.314636+00`
  - `seo_results_cache overview 7d` -> `2026-04-09 14:26:13.175524+00`
  - `seo_results_cache findings 30d` row `0` -> `1`, `generated_at=2026-04-09 14:26:00.171245+00`
  - `seo_results_cache findings 7d` row `0` -> `1`, `generated_at=2026-04-09 14:26:12.965349+00`

Shopify sync owner:

- Trigger attempted: `lib/sync/shopify-sync.ts`
- Invocation used existing lane with constrained input to avoid historical bootstrap noise:
  - `allowHistorical: false`
  - `recentWindowDays: 7`
  - `materializeOverviewState: true`
  - `triggerReason: "runtime_validation"`
- Outcome: did not complete within the validation window and was terminated after repeated waits.
- No observed advancement before termination:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` key remained `2026-04-09 04:00:02.710425+00`
  - `shopify_serving_state` business-wide max `updated_at` remained `2026-04-08 11:36:07.712972+00`
  - `shopify_reconciliation_runs` business-wide max `recorded_at` remained `2026-04-08 11:36:07.925+00`

### Phase 9 Closeout: Shopify Recent-Window Rerun

Exact constrained owner command:

```bash
node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: true, triggerReason: 'runtime_validation' }); console.log(JSON.stringify(result, null, 2));"
```

Wait / retry / termination strategy:

- Take an exact before snapshot for:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key `2026-04-03:2026-04-09`
  - `shopify_serving_state` exact recent canary key `overview_shopify:2026-04-03:2026-04-09:shop_local`
  - `shopify_reconciliation_runs` exact recent `2026-04-03..2026-04-09` rows
  - `shopify_sync_state` recent `commerce_orders_recent` and `commerce_returns_recent` rows
- Poll the same markers every `10s` for `120s`
- If the owner process is still live after `120s`, send `SIGINT` and wait `5s`
- Capture the exact after snapshot and the owner log

Existing-code rerun:

- Start: `2026-04-09T15:10:23Z`
- End: `2026-04-09T15:12:47Z`
- Total wait: `144s`
- Termination: `SIGINT`
- Exit code: `130`
- Before snapshot: `2026-04-09T15:10:22.009Z`
- After snapshot: `2026-04-09T15:12:47.509Z`

Observed markers:

- `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key stayed:
  - `row_count=1`
  - `max_updated_at=2026-04-09 04:00:02.710425+00`
- `shopify_serving_state` exact recent canary key stayed:
  - `row_count=0`
  - `max_updated_at=null`
- `shopify_reconciliation_runs` exact recent window stayed:
  - `row_count=0`
  - `max_recorded_at=null`
- `shopify_sync_state` still advanced for the recent owner lane itself:
  - `commerce_orders_recent latest_successful_sync_at=2026-04-09T15:12:22.825Z`
  - `commerce_returns_recent latest_successful_sync_at=2026-04-09T15:12:22.831Z`

Minimal observability refinement added for closeout:

- `lib/sync/shopify-sync.ts` now emits `runtime_validation`-only phase logs around the post-recent-sync path so the blocker is diagnosable without changing ownership or request behavior.

Diagnostic rerun with the same constrained owner command:

- Start: `2026-04-09T15:17:09Z`
- End: `2026-04-09T15:19:32Z`
- Total wait: `143s`
- Termination: `SIGINT`
- Exit code: `130`
- Before snapshot: `2026-04-09T15:17:08.070Z`
- Poll `120s`: `2026-04-09T15:19:26.327Z`
- After snapshot: `2026-04-09T15:19:32.802Z`

Observed markers on the diagnostic rerun:

- `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key still stayed:
  - `row_count=1`
  - `max_updated_at=2026-04-09 04:00:02.710425+00`
- `shopify_serving_state` exact recent canary key still stayed:
  - `row_count=0`
  - `max_updated_at=null`
- `shopify_reconciliation_runs` exact recent window still stayed:
  - `row_count=0`
  - `max_recorded_at=null`
- `shopify_sync_state` again moved for the recent owner lane itself:
  - at poll `120s`, both recent sync targets were still `running` with fresh `latest_sync_started_at`
  - by the after snapshot, both recent sync targets had flipped back to `succeeded`
  - exact after values:
    - `commerce_orders_recent latest_successful_sync_at=2026-04-09T15:19:32.261Z`
    - `commerce_returns_recent latest_successful_sync_at=2026-04-09T15:19:32.270Z`
- Owner log output remained limited to:

```text
[startup] db_client_initialized { timeoutMs: 8000 }
```

Closeout conclusion for the Shopify blocker:

- Automated Shopify recent-window advancement is still not proven.
- The constrained owner lane repeatedly stays live past the fixed `120s` window and must be interrupted.
- The only durable advancement observed during these closeout reruns is the recent `shopify_sync_state` owner-state rows.
- No exact recent-window advancement was observed for:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` auto `7d`
  - `shopify_serving_state`
  - `shopify_reconciliation_runs`
- The blocker is now narrowed to: the owner lane can persist recent sync-state progress, but in this environment it does not persist the recent overview-facing Shopify artifacts before the process is interrupted.

### Phase 9 Closeout: Shopify Target-Split Matrix

Exact matrix cases executed:

- Case A: orders-only recent sync, no overview materialization

```bash
node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: false, triggerReason: 'runtime_validation', recentTargets: { orders: true, returns: false } }); console.log(JSON.stringify(result, null, 2));"
```

- Case B: returns-only recent sync, no overview materialization

```bash
node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: false, triggerReason: 'runtime_validation', recentTargets: { orders: false, returns: true } }); console.log(JSON.stringify(result, null, 2));"
```

- Case C: both recent targets, no overview materialization

```bash
node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: false, triggerReason: 'runtime_validation', recentTargets: { orders: true, returns: true } }); console.log(JSON.stringify(result, null, 2));"
```

- Case D: both recent targets, overview materialization enabled

```bash
node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: true, triggerReason: 'runtime_validation', recentTargets: { orders: true, returns: true } }); console.log(JSON.stringify(result, null, 2));"
```

Exact wait / extension policy used for every case:

- Poll the exact recent `7d` markers every `10s`
- Keep the original comparability boundary at `120s`
- If the process is still live at `120s`, extend once for another `120s`
- If the process is still live at `240s`, send `SIGINT` and capture the exact after snapshot

Tracked recent markers for every case:

- `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` exact auto key `2026-04-03:2026-04-09`
- `shopify_serving_state` exact canary key `overview_shopify:2026-04-03:2026-04-09:shop_local`
- `shopify_reconciliation_runs` exact `2026-04-03..2026-04-09` rows
- `shopify_sync_state.commerce_orders_recent`
- `shopify_sync_state.commerce_returns_recent`

Case A summary:

- Start: `2026-04-09T15:54:32.062Z`
- End: `2026-04-09T15:58:42.396Z`
- Total wait: `250s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Exact recent overview-facing markers: unchanged
- `shopify_sync_state`:
  - `commerce_orders_recent latest_successful_sync_at` advanced from `2026-04-09T15:53:45.846Z` to `2026-04-09T15:57:54.623Z`
  - `commerce_returns_recent latest_successful_sync_at` also advanced from `2026-04-09T15:53:45.851Z` to `2026-04-09T15:57:54.628Z`
- Runtime-validation log: only startup line; no `warehouse_shadow_started` marker was emitted

Case B summary:

- Start: `2026-04-09T15:58:43.190Z`
- End: `2026-04-09T15:58:55.333Z`
- Total wait: `12s`
- Completion: `completed_within_base_wait`
- Termination: none
- Exact recent overview-facing markers: unchanged, as expected with materialization disabled
- `shopify_sync_state`:
  - `commerce_returns_recent latest_successful_sync_at` advanced from `2026-04-09T15:57:54.628Z` to `2026-04-09T15:58:47.736Z`
  - `commerce_orders_recent` moved to `running` during the same wall-clock window, but the owner output for this case explicitly recorded `recentTargets.orders=false`
- Runtime-validation log reached:
  - `warehouse_shadow_succeeded`
  - `ledger_shadow_succeeded`
  - `recent_sync_succeeded`
- Owner result for this case ended with:
  - `orders: 0`
  - `returns: 0`
  - `recentTargets: { orders: false, returns: true }`

Case C summary:

- Start: `2026-04-09T15:58:56.125Z`
- End: `2026-04-09T16:02:56.947Z`
- Total wait: `241s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Exact recent overview-facing markers: unchanged
- `shopify_sync_state`:
  - `commerce_orders_recent latest_successful_sync_at` advanced to `2026-04-09T16:02:10.740Z`
  - `commerce_returns_recent latest_successful_sync_at` advanced to `2026-04-09T16:02:10.744Z`
- Runtime-validation log: only startup line; no `warehouse_shadow_started` marker was emitted

Case D summary:

- Start: `2026-04-09T16:02:57.679Z`
- End: `2026-04-09T16:07:00.399Z`
- Total wait: `243s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Exact recent overview-facing markers: unchanged
- `shopify_sync_state`:
  - `commerce_orders_recent latest_successful_sync_at` advanced to `2026-04-09T16:06:15.953Z`
  - `commerce_returns_recent latest_successful_sync_at` advanced to `2026-04-09T16:06:15.958Z`
- Runtime-validation log: only startup line; no `warehouse_shadow_started` marker was emitted

Target-split conclusion:

- By the stated decision rule, the blocker localizes to the recent orders sync path because Case A failed while Case B succeeded.
- Cases C and D matched Case A rather than diverging from each other.
- Because Case C already failed with overview materialization disabled, the matrix does not support a post-recent overview-facing persistence blocker as the primary cause of the current runtime-truth gap.
- The current runtime-validation instrumentation sharpens that conclusion further:
  - Case B reached `warehouse_shadow_*`, `ledger_shadow_*`, and `recent_sync_succeeded`
  - Cases A, C, and D emitted only the startup line
  - This places the stall before the post-recent shadow/materialization path whenever the recent orders target is enabled
- Automated Shopify recent-window advancement remains unproven after the matrix because the exact recent overview-facing artifacts never advanced in any case.

## Matrix

| Surface | GET changed rows/timestamps? | Owner trigger executed | Owner changed rows/timestamps? | Conclusion |
| --- | --- | --- | --- | --- |
| `platform_overview_summary_ranges` | No on tracked exact key | `overview:summary:materialize` CLI owner | Yes | GET stayed read-only; explicit CLI owner advanced projection row |
| `provider_reporting_snapshots.ga4_analytics_overview` | No on tracked exact GET key | `ga4-sync` | Yes on default `7d` and `30d` keys | Automated owner lane advanced only explicit default windows |
| `provider_reporting_snapshots.ga4_detailed_audience` | No | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.ga4_detailed_cohorts` | No | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.ga4_detailed_demographics country` | No | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.ga4_detailed_demographics city` | Not exercised by GET | Manual `reporting:cache:warm` CLI owner | Yes | Non-`country` dimension remained manual and advanced only by explicit CLI owner |
| `provider_reporting_snapshots.ga4_landing_page_performance_v1` | No | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.ga4_detailed_landing_pages` | No | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.ga4_detailed_products` | No | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.ecommerce_fallback` | No on tracked stable key | `ga4-sync` | Yes on default `7d` and `30d` keys | Same as intended |
| `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` tracked historical GET key | No | Manual `reporting:cache:warm` CLI owner for `2026-03-01..2026-03-31` | Yes | Manual targeted warmer advanced snapshot outside recent auto window |
| `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key | Not changed by GET | `shopify-sync` target-split matrix cases A-D | No exact recent key advancement observed in any case | Automated Shopify recent-window advancement remains unproven; target-split matrix localizes the blocker to runs that include recent orders sync |
| `seo_results_cache overview` tracked GET key `2026-03-09..2026-04-08` | No | `search-console-sync` | Yes on default `30d` and `7d` keys | GET key stayed read-only; automated owner advanced current default windows |
| `seo_results_cache findings` tracked GET key `2026-03-01..2026-03-31` | No | `search-console-sync` | Yes on default `30d` and `7d` keys | Same as intended |
| `shopify_serving_state` | No on tracked exact GET row | `shopify-sync` target-split matrix cases A-D | No exact recent canary row observed in any case | GET stayed read-only; automated Shopify serving-state advancement remains unproven and does not appear to be the primary blocker segment |
| `shopify_reconciliation_runs` | No on tracked exact GET rows | `shopify-sync` target-split matrix cases A-D | No exact recent reconciliation row observed in any case | GET stayed read-only; automated Shopify reconciliation advancement remains unproven and does not appear to be the primary blocker segment |

## Conclusions

- Repeated authenticated GET traffic against the in-scope user-facing routes did not mutate the exact tracked serving/projection/cache keys exercised by those routes.
- One business-wide `seo_results_cache` watermark moved during the GET window, but matching `provider_sync_jobs` rows show the writer was the explicit `search-console-sync` owner lane. This is concurrent non-GET owner activity, not request-path mutation.
- The explicit non-GET owners successfully advanced:
  - `platform_overview_summary_ranges`
  - manual GA4 detail cache warmer for non-auto `dimension=city`
  - manual Shopify overview snapshot warmer for a non-recent custom range
  - GA4 sync default `7d` / `30d` overview, fallback, and eligible detail keys
  - Search Console sync default `7d` / `30d` overview and findings keys
- Automated Shopify recent-window advancement through `syncShopifyCommerceReports()` remains unproven after the target-split matrix. The remaining blocker is now localized to runs that include recent orders sync, before the post-recent shadow/materialization path.

## Remaining Caveats / Blockers

- This run reused a live-like local app process that was already listening on port `3000`; `npm run dev` was not used because the port was already occupied.
- Background owner activity can overlap the GET window on a live-like environment. For this run, the only observed overlap was Search Console sync, and it was attributable via `provider_sync_jobs`.
- Shopify recent-window runtime proof required a longer bounded validation window than the original `120s + 120s` policy because the recent-orders lane uses slow row-by-row warehouse upserts and only reaches the post-recent overview path after those writes finish.

## Phase 9B Closeout: Shopify Recent-Orders Sub-Phase Localization

Exact rerun case executed:

```bash
node --env-file=.env.local --import tsx -e "const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('<BUSINESS_ID>', { allowHistorical: false, recentWindowDays: 7, materializeOverviewState: false, triggerReason: 'runtime_validation', recentTargets: { orders: true, returns: false } }); console.log(JSON.stringify(result, null, 2));"
```

Exact wait / retry policy reused:

- Poll the exact recent `7d` markers every `10s`
- Keep the original comparability boundary at `120s`
- If still live at `120s`, extend once to `240s`
- If still live at `240s`, send `SIGINT`, wait up to `10s`, and then capture the exact after snapshot

Phase markers added for the recent orders sub-flow:

- outer lane:
  - `recent_orders_phase_started`
  - `recent_orders_phase_failed`
  - `recent_orders_cursor_or_state_persist_started`
  - `recent_orders_cursor_or_state_persist_succeeded`
  - `recent_orders_phase_completed`
  - `transition_to_shadow_started`
- recent orders fetch / normalization:
  - `recent_orders_page_loop_started`
  - `recent_orders_source_fetch_started`
  - `recent_orders_source_fetch_succeeded`
  - `recent_orders_source_fetch_failed`
  - `recent_orders_page_received`
  - `recent_orders_snapshot_persist_started`
  - `recent_orders_snapshot_persist_succeeded`
  - `recent_orders_normalization_started`
  - `recent_orders_normalization_succeeded`
- recent orders upsert chain:
  - `recent_orders_upsert_started`
  - `recent_orders_orders_upsert_started`
  - `recent_orders_orders_upsert_succeeded`
  - `recent_orders_order_lines_upsert_started`
  - `recent_orders_order_lines_upsert_succeeded`
  - `recent_orders_refunds_upsert_started`
  - `recent_orders_refunds_upsert_succeeded`
  - `recent_orders_sales_events_upsert_started`
  - `recent_orders_sales_events_upsert_succeeded`
  - `recent_orders_transactions_upsert_started`
  - `recent_orders_transactions_upsert_succeeded`
  - `recent_orders_upsert_succeeded`

Orders-only rerun with page-level markers:

- Start: `2026-04-09T17:01:39.903Z`
- End: `2026-04-09T17:06:12.249Z`
- Total wait: `272s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Extension started: `2026-04-09T17:03:55.730Z`
- Exact last emitted phase marker: `recent_orders_upsert_started`
- Exact last successful page-3 phase before the stall: `recent_orders_normalization_succeeded`
- Before / after recent markers:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key stayed:
    - before `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
    - after `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
  - `shopify_serving_state` exact recent canary key stayed:
    - before `row_count=0`, `max_updated_at=null`
    - after `row_count=0`, `max_updated_at=null`
  - `shopify_reconciliation_runs` exact recent window stayed:
    - before `row_count=0`, `max_recorded_at=null`
    - after `row_count=0`, `max_recorded_at=null`
  - `shopify_sync_state.commerce_orders_recent` / `commerce_returns_recent` still changed independently of the runtime-validation run:
    - before both rows already reflected a concurrent null-trigger run in `running`
    - after both rows reflected a concurrent null-trigger run in `succeeded`

Orders-only rerun with per-upsert markers:

- Start: `2026-04-09T17:07:58.168Z`
- End: `2026-04-09T17:12:31.309Z`
- Total wait: `273s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Extension started: `2026-04-09T17:10:14.892Z`
- Exact last emitted phase marker: `recent_orders_sales_events_upsert_started`
- Exact last successful phase before the stall: `recent_orders_refunds_upsert_succeeded`
- Exact page context at the stall:
  - `pageCount=3`
  - `ordersBatchCount=100`
  - `orderLinesBatchCount=204`
  - `refundsBatchCount=3`
  - `salesEventsBatchCount=106`
  - `transactionsBatchCount=152`
- Before / after recent markers:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key stayed:
    - before `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
    - after `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
  - `shopify_serving_state` exact recent canary key stayed:
    - before `row_count=0`, `max_updated_at=null`
    - after `row_count=0`, `max_updated_at=null`
  - `shopify_reconciliation_runs` exact recent window stayed:
    - before `row_count=0`, `max_recorded_at=null`
    - after `row_count=0`, `max_recorded_at=null`
  - `shopify_sync_state.commerce_orders_recent` / `commerce_returns_recent` again changed independently of the runtime-validation run:
    - before both rows reflected a concurrent null-trigger run in `succeeded`
    - after both rows reflected a later concurrent null-trigger run in `succeeded`

Phase 9B closeout conclusion:

- Automated Shopify recent-window advancement is still not proven.
- The remaining blocker is now localized to the existing recent-orders owner lane at:
  - `recent_orders_sales_events_upsert_started`
  - page `3` of the `updated_at` recent-orders loop
- The exact last successful phase before the observed stall is:
  - `recent_orders_refunds_upsert_succeeded`
- This means the current evidence no longer supports a source-fetch, raw-snapshot, normalization, orders-table, order-lines-table, refunds-table, transactions-table, shadow-read, or overview-materialization blocker as the primary cause of the still-unproven recent Shopify path.
- No small safe correctness bug is proven yet from this run alone. The live-like evidence is still consistent with a stall or lock wait inside `upsertShopifySalesEvents()` on page `3`, potentially while concurrent non-runtime owner activity is also present in the same environment.

## Phase 9C Closeout: Shopify Sales-Events Writer Truth

Existing lease mechanism used:

- Yes. The reruns below used the existing `sync_runner_leases` lane with `provider_scope='shopify'`.
- Lease owner format:
  - `runtime_validation:shopify_sales_events:<run_id>`
- This was used to reduce lease-aware concurrent overlap without changing ownership or scheduling behavior.

Reusable validation command introduced for this phase:

```bash
node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <BUSINESS_ID> --recent-targets=orders --materialize=0 --use-runner-lease=1
```

That wrapper:

- acquires and renews the existing Shopify runner lease
- spawns the constrained `syncShopifyCommerceReports()` owner command with `triggerReason: "runtime_validation"`
- polls the tracked Shopify recent surfaces every `10s`
- captures `pg_stat_activity`, `pg_blocking_pids()`, and `pg_locks` for tagged sales-events queries when visible
- terminates the child cleanly after the same `120s + 120s` wait policy

Runtime-validation-only writer diagnostics added for this phase:

- row-level sales-events markers:
  - `recent_orders_sales_events_row_upsert_started`
  - `recent_orders_sales_events_row_upsert_succeeded`
- tagged SQL comment on each sales-events row upsert:
  - `shopify_rtval_sales_events run_id=<run_id> page=<page> row=<row> total=<total> event_id=<...> source_id=<...> source_kind=<...>`
- This tagging is only used when `triggerReason: "runtime_validation"` is routed through the shared diagnostics path.

Lease-backed rerun A:

```bash
node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <BUSINESS_ID> --recent-targets=orders --materialize=0 --use-runner-lease=1
```

- Run id: `shopify_rtval_mnrro0o3_91dtuf`
- Start: `2026-04-09T17:44:23.385Z`
- End: `2026-04-09T17:48:37.146Z`
- Total wait: `254s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Existing runner lease used: yes
- Result:
  - page `3` sales-events row loop advanced through all `106` rows
  - `recent_orders_sales_events_upsert_succeeded` was emitted
  - the last emitted marker then moved forward to `recent_orders_transactions_upsert_started`
- Interpretation:
  - the previously suspected `upsertShopifySalesEvents()` blocker did not reproduce on this isolated run
  - this disproved a stable always-blocking sales-events writer failure mode

Lease-backed rerun B, captured to artifact file for detailed lock inspection:

```bash
node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <BUSINESS_ID> --recent-targets=orders --materialize=0 --use-runner-lease=1 > /tmp/shopify-sales-events-runtime-validation.json
```

- Run id: `shopify_rtval_mnrrundr_1dy2m3`
- Start: `2026-04-09T17:49:31.984Z`
- End: `2026-04-09T17:53:47.574Z`
- Total wait: `256s`
- Completion: `terminated_after_extended_wait`
- Termination: `SIGINT`
- Existing runner lease used: yes
- Exact last emitted phase marker:
  - `recent_orders_sales_events_row_upsert_started`
- Exact last successful sales-events row before the stall:
  - page `3`, row `88`
  - `event_id='order:6419435192562'`
  - `source_id='6419435192562'`
  - `source_kind='order'`
- Exact first row not observed to succeed afterward:
  - page `3`, row `89`
  - `event_id='order:6388240744690'`
  - `source_id='6388240744690'`
  - `source_kind='order'`

Exact DB-level writer evidence captured for rerun B:

- Non-empty tagged writer activity polls: `1`
- Observed tagged writer backend:
  - `pid=25389`
  - `state='idle'`
  - `wait_event_type='Client'`
  - `wait_event='ClientRead'`
  - query text still showed the tagged `shopify_rtval_sales_events ...` insert comment
- `pg_blocking_pids(25389) = []`
- `pg_locks` snapshot for that pid: no relation lock wait evidence was captured
- blocking activity summary: none

What that means:

- The lease-backed sales-events reruns do not prove an external DB lock/contention blocker.
- The one poll where the tagged writer query was visible did not show `Lock` waiting, blocking pids, or relation lock pressure.
- At the same time, the sales-events row loop still failed to finish consistently under the isolated runner lease.
- Therefore the Phase 9C conclusion is:
  - not proven writer correctness bug
  - not proven external DB lock/contention
  - still inconclusive overall, but the evidence now weighs against a simple external lock-wait explanation for the sales-events writer

Tracked recent Shopify surfaces during the lease-backed reruns:

- `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key stayed unchanged
- `shopify_serving_state` exact recent canary key stayed absent
- `shopify_reconciliation_runs` exact recent window stayed absent
- automated Shopify recent-window advancement is still not proven

Phase 9C closeout conclusion:

- Phase 9 is still not fully closed.
- Automated Shopify recent-window advancement is still not proven.
- The sales-events writer is no longer a cleanly reproduced lock-wait culprit:
  - one isolated run completed the full page-3 sales-events batch and moved the stall forward to transactions
  - another isolated run stalled at page `3` row `89`, but without captured `pg_blocking_pids()` or lock-wait evidence
- The exact blocker conclusion for this phase is therefore:
  - `still inconclusive`
  - with current evidence favoring neither a proven small internal correctness bug nor a proven external DB lock/contention explanation inside `upsertShopifySalesEvents()`

## Phase 9D Closeout: Shopify Recent-Orders Lane Completion Truth

Why the prior blocker no longer reproduced:

- The earlier `120s + 120s` validation boundary was not long enough for the existing recent-orders lane to finish its row-by-row `orders`, `order_lines`, `sales_events`, and `transactions` writes and then transition into the post-recent path.
- The new child-process lifecycle summary showed that the child was still actively emitting in-lane phase markers late in the run, not becoming silently wedged after a completed phase.
- No correctness fix was needed. The existing owner lane completed once the validation window was long enough.

Exact lease-backed reruns used for Phase 9D:

```bash
node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <BUSINESS_ID> --recent-targets=orders --materialize=0 --use-runner-lease=1 --base-wait-seconds=120 --extended-wait-seconds=480
node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <BUSINESS_ID> --recent-targets=both --materialize=0 --use-runner-lease=1 --base-wait-seconds=120 --extended-wait-seconds=480
node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <BUSINESS_ID> --recent-targets=both --materialize=1 --use-runner-lease=1 --base-wait-seconds=120 --extended-wait-seconds=480
```

Common validation facts for all three reruns:

- Existing `sync_runner_leases` runner lease used: yes
- Poll cadence: every `10s`
- Base wait: `120s`
- Extended wait: `480s`
- Child lifecycle capture included:
  - `startTime`
  - `endTime`
  - `totalWaitSeconds`
  - `exitCode`
  - `exitSignal`
  - `lastStdoutMarker`
  - `lastStderrMarker`
  - `childBecameSilentAfterKnownSuccessfulPhase`

Lease-backed rerun D1, orders-only, no overview materialization:

- Start: `2026-04-09T18:22:19.503Z`
- End: `2026-04-09T18:27:49.275Z`
- Total wait: `330s`
- Completion: `completed_within_extended_wait`
- Exit code: `0`
- Exit signal: `null`
- Exact last emitted marker: `transition_to_post_recent_path_started`
- Child became silent after a known successful phase: `false`
- Exact in-lane markers reached:
  - `recent_orders_transactions_upsert_succeeded`
  - `recent_orders_cursor_persist_succeeded`
  - `recent_orders_state_persist_succeeded`
  - `recent_orders_phase_completed`
  - `transition_to_post_recent_path_started`
- Before / after tracked Shopify surface summary:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d`
    - before `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
    - after `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
  - `shopify_serving_state`
    - before `row_count=0`
    - after `row_count=0`
  - `shopify_reconciliation_runs`
    - before `row_count=0`
    - after `row_count=0`
  - `shopify_sync_state`
    - `commerce_orders_recent` advanced to `latestSyncStatus='succeeded'`, `triggerReason='runtime_validation'`, `recentTargets={ orders: true, returns: false }`
    - `commerce_returns_recent` stayed on its previous successful row

Lease-backed rerun D2, both recent targets, no overview materialization:

- Start: `2026-04-09T18:27:57.508Z`
- End: `2026-04-09T18:34:00.382Z`
- Total wait: `363s`
- Completion: `completed_within_extended_wait`
- Exit code: `0`
- Exit signal: `null`
- Exact last emitted marker: `transition_to_post_recent_path_started`
- Child became silent after a known successful phase: `false`
- Exact in-lane markers reached:
  - `recent_orders_transactions_upsert_succeeded`
  - `recent_orders_cursor_persist_succeeded`
  - `recent_orders_state_persist_succeeded`
  - `recent_orders_phase_completed`
  - `transition_to_post_recent_path_started`
- Before / after tracked Shopify surface summary:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d`
    - before `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
    - after `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
  - `shopify_serving_state`
    - before `row_count=0`
    - after `row_count=0`
  - `shopify_reconciliation_runs`
    - before `row_count=0`
    - after `row_count=0`
  - `shopify_sync_state`
    - `commerce_orders_recent` advanced to `latestSyncStatus='succeeded'`, `triggerReason='runtime_validation'`, `recentTargets={ orders: true, returns: true }`
    - `commerce_returns_recent` advanced to `latestSyncStatus='succeeded'`, `triggerReason='runtime_validation'`, `recentTargets={ orders: true, returns: true }`

Lease-backed rerun D3, both recent targets, overview materialization enabled:

- Start: `2026-04-09T18:34:07.971Z`
- End: `2026-04-09T18:40:10.099Z`
- Total wait: `362s`
- Completion: `completed_within_extended_wait`
- Exit code: `0`
- Exit signal: `null`
- Exact last emitted marker: `post_recent_overview_snapshot_succeeded`
- Child became silent after a known successful phase: `false`
- Exact post-recent markers reached:
  - `transition_to_post_recent_path_started`
  - `overview_materialization_started`
  - `post_recent_serving_state_started`
  - `post_recent_serving_state_succeeded`
  - `post_recent_reconciliation_started`
  - `post_recent_reconciliation_succeeded`
  - `overview_materialization_succeeded`
  - `post_recent_overview_snapshot_started`
  - `overview_snapshot_warm_started`
  - `overview_snapshot_warm_succeeded`
  - `post_recent_overview_snapshot_succeeded`
- Before / after tracked Shopify surface summary:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d`
    - before `row_count=1`, `max_updated_at=2026-04-09 04:00:02.710425+00`
    - after `row_count=1`, `max_updated_at=2026-04-09 18:40:03.293812+00`
  - `shopify_serving_state`
    - before `row_count=0`
    - after `row_count=1`, `max_updated_at=2026-04-09 18:40:01.767053+00`
  - `shopify_reconciliation_runs`
    - before `row_count=0`
    - after `row_count=2`, `max_recorded_at=2026-04-09 18:39:59.381+00`
  - `shopify_sync_state`
    - `commerce_orders_recent` advanced to `latestSyncStatus='succeeded'`, `triggerReason='runtime_validation'`, `recentTargets={ orders: true, returns: true }`
    - `commerce_returns_recent` advanced to `latestSyncStatus='succeeded'`, `triggerReason='runtime_validation'`, `recentTargets={ orders: true, returns: true }`

Phase 9D exact blocker conclusion:

- Not a proven `transactions` sub-flow bug
- Not a proven recent-orders completion / state-persist handoff bug
- Not a proven child-process / pooled-connection completion-signaling bug
- Not a proven later post-recent overview-persistence bug
- The remaining runtime-truth gap was caused by the validation window being too short to observe the existing lane completing

Phase 9 closeout conclusion:

- Phase 9 is now fully closed.
- Automated Shopify recent-window advancement is now proven on the intended in-scope surfaces when the existing call path enables overview materialization:
  - `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent `7d` auto key
  - `shopify_serving_state` exact recent canary row
  - `shopify_reconciliation_runs` exact recent window rows
- No small correctness bug was proven or fixed in the existing owner lane.
- Ownership boundaries and product behavior stayed unchanged.
