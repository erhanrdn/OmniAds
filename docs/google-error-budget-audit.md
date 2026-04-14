# Google API Error-Budget Audit

Use `npm run ops:google-error-budget-audit` as the global operator workflow for Google request pressure in the rebuilt environment.

This workflow is for tracking and suppression evidence only. It does not change truth contracts, readiness semantics, or execution posture.

## What It Shows

For each Google provider family:

- `Google Ads`
- `GA4`
- `Search Console`

the audit reports:

- request volume seen through governed Google request paths
- error volume and error-rate
- error-class breakdown:
  - `quota`
  - `auth`
  - `permission`
  - `generic`
- source breakdown:
  - `cron_sync`
  - `background_refresh`
  - `live_report`
  - `discovery`
- repeated failure patterns by request type and path
- active suppression:
  - cooldown hits
  - deduped hits
  - active circuit-breaker rows

Run JSON output when needed:

```bash
npm run ops:google-error-budget-audit -- --json
```

## How To Read It

Start with the summary line.

- High `errors` with low `cooldown_hits` means requests are still failing live without enough suppression.
- High `cooldown_hits` after an error burst means suppression is absorbing repeats instead of burning more Google requests.
- High `deduped` means duplicate in-flight calls are being collapsed before another equivalent request runs.

Then inspect the provider block.

- `Google Ads` pressure usually points to governed GAQL/reporting and warehouse sync sources.
- `GA4` pressure usually points to live dashboard/report routes, overview-summary, sparklines, or sync warmers.
- `Search Console` pressure usually points to SEO overview/findings/AI-analysis or search-console cache warming.

Then inspect `Sources`.

- `cron_sync` means scheduled sync or cache-warm work.
- `background_refresh` means an operator-triggered or route-triggered refresh flow.
- `live_report` means a user-facing route/report fetch.
- `discovery` means account/property/site discovery.

Then inspect `Repeated failures`.

- `class=quota` means Google is rate-limiting or quota-constrained.
- `class=auth` means OAuth or token rejection.
- `class=permission` means scope, entitlement, or provider access denial.
- `class=generic` means the failure is real but not clearly attributable to quota/auth/permission from the current evidence.
- `active_cooldown=yes` means equivalent calls are intentionally being suppressed right now.

## What Is Intentionally Suppressed

This first pass suppresses obvious request waste in Google paths that already allow honest degraded behavior:

- repeated GA4 live/report requests inside cooldown
- repeated Search Console live/report requests inside cooldown
- GA4 property discovery inside cooldown
- Search Console site discovery inside cooldown
- GA4 and Search Console sync/cache-warm loops after quota/auth/permission suppression is active

This does not claim healthy data during rebuild. It only avoids re-spending quota on clearly failing equivalent calls.

## How To Tell The Main Failure Classes Apart

- `quota`
  - `429`
  - `RESOURCE_EXHAUSTED`
  - `rate limit`
  - `quota`
- `auth`
  - `401`
  - `UNAUTHENTICATED`
  - token refresh / developer token rejection
- `permission`
  - `403`
  - `PERMISSION_DENIED`
  - missing scope / access denied
- `generic`
  - anything else that still failed but does not clearly classify

Treat `quota` and `permission/auth` differently:

- `quota` means wait for cooldown and inspect whether request waste is dropping.
- `auth` or `permission` means cooldown is only damage control; reconnect or access repair is still required.

## How To Verify Request Waste Actually Dropped

Run the audit twice during the same day while the environment is active.

- `requestCount` should stop climbing as quickly on failing paths once suppression is active.
- `cooldownHitCount` should rise on the previously noisy path if repeat calls are being absorbed.
- `errorCount` should not continue scaling linearly with user refreshes or warmer loops.
- `activeCooldowns` or `activeCircuitBreakers` should line up with the same failing request family, not with fake healthy output.

If request volume keeps rising on the same failing `source + path + requestType` with little suppression, the next pass should target that pathway directly.
