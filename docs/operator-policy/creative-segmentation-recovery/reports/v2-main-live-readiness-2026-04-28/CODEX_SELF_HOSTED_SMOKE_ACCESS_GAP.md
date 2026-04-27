# Codex Self-Hosted Smoke Access Gap

Date: 2026-04-28

Status: SUPERSEDED_BY_RECHECK

Superseding report: `CODEX_AUTHORIZED_RUNTIME_SMOKE_RECHECK.md`

Superseding finding: owner-host runtime no-write check completed with temporary authenticated local storage state after owner authorization. The initial access-gap finding below is retained as historical evidence for the first unauthenticated attempt, but it is no longer the current runtime-smoke status.

Verdict: `SELF_HOSTED_SMOKE_BLOCKED_BY_AUTHENTICATED_SESSION_GAP`

Product-ready: NO

Main merge-ready: NO

Live deploy-ready: NO

Queue/apply safe: NO

## What Was Available

The self-hosted smoke script exists:

```text
script.creative:v2:self-hosted-smoke=true
```

The script requires:

```text
CREATIVE_V2_SMOKE_BASE_URL
```

The script optionally accepts:

```text
CREATIVE_V2_SMOKE_STORAGE_STATE
```

Owner-delegated local tunnel/dev setup was attempted using process-local environment values. Private runtime values were not printed or committed.

## What Was Missing

Initial non-secret presence checks:

```text
CREATIVE_V2_SMOKE_BASE_URL.configured=false
CREATIVE_V2_SMOKE_STORAGE_STATE.configured=false
DATABASE_URL.configured=false
existing storage-state files found=false
```

After the local app was started, a base URL was available locally, but no non-writing authenticated storage/session context was available.

## Smoke Attempt

Command shape:

```text
CREATIVE_V2_SMOKE_BASE_URL=http://localhost:3000 npm run creative:v2:self-hosted-smoke
```

Sanitized result:

```text
npm run creative:v2:self-hosted-smoke=FAIL_UNAUTHENTICATED_ACCESS_GAP
unsafeMutationRequests=not_assessed
forbiddenRenderedActionTerms=not_assessed
forbiddenRenderedInternalTerms=not_assessed
v2PreviewOffByDefault=not_assessed
v2PreviewWithFlag=not_assessed
runtimeNetworkCaptureComplete=false
selfHostedSiteEvidence=partial_local_boot_only
selfHostedPostgresEvidence=incomplete_without_authenticated_read_path
```

The unauthenticated run redirected to login and timed out waiting for `/creatives`.

## Explicit Non-Use Of Demo Login

`/api/auth/demo-login` was inspected and not used because it performs session-table writes. This task forbids DB writes.

## Security Handling

No secret, token, cookie, browser state, DB URL, server credential, domain, account ID, business ID, creative ID, screenshot, session value, or private runtime credential was requested, printed, or committed.

## Blocker

Main/live/product-ready remains blocked until an already-authorized, non-writing authenticated storage/session context is available to Codex or another approved mechanism can run the smoke without violating the no-DB-write/no-secret-exposure constraints.
