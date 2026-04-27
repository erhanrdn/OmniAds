# Codex Authorized Runtime Smoke Recheck

Date: 2026-04-28

Branch checked: `review/creative-v2-pr78-codex-authorized-runtime-smoke-and-github-hygiene-2026-04-28`

Base PR #78 head under test: `34d9ae21e34646bfe6493f498616d66a51ce887d`

Report branch starting SHA: `0dc89247e2daf87472c9559fb2a7b13c1c2772b3`

## Verdict

`MAIN_LIVE_NOT_READY__OWNER_HOST_RUNTIME_NO_WRITE_GREEN__SMOKE_HARNESS_LOCATOR_CLEANUP_RECOMMENDED`

Product-ready: NO

Main merge-ready: NO

Live deploy-ready: NO

Queue/apply safe: NO

Consolidated #78 WIP limited read-only preview continuation: ACCEPTABLE

## Correction To Prior Runtime Access Finding

The prior access-gap report was incomplete because the local dev server had not been rechecked with the full local DB tunnel/dev environment and a temporary authenticated admin session.

On this recheck:

- The local dev server was started with the local DB tunnel-derived `DATABASE_URL`.
- `DATABASE_URL_UNPOOLED` was set to the same sanitized local tunnel value.
- `NEXT_PUBLIC_APP_URL` was set to localhost.
- `ALLOW_INSECURE_LOCAL_AUTH_COOKIE=1` was set for local auth handling.
- This is the owner-host/self-hosted runtime path for this check; the npm script name is treated as an example harness, not as the only acceptable evidence path.
- No DB URL, cookie, token, private host value, storage-state content, account ID, business ID, screenshot, or credential was written to this report.

## Temporary Auth Setup

Because the smoke fell back to `/login` without an authenticated browser context, Codex created a temporary authenticated local browser storage state through the existing demo-login route after owner authorization.

Sanitized result:

```text
storage_state_created=true
storage_state_path=/tmp/creative-v2-codex-smoke-storage.json
```

Cleanup was run after runtime checks:

```text
temporary_auth_cleanup_status=200
storage_state_removed=true
```

The temporary storage-state file was not committed.

## Example NPM Smoke Harness Result

Command:

```bash
CREATIVE_V2_SMOKE_BASE_URL="http://localhost:3000" CREATIVE_V2_SMOKE_STORAGE_STATE="/tmp/creative-v2-codex-smoke-storage.json" npm run creative:v2:self-hosted-smoke
```

Result: FAIL

The failure was not a login/env failure. The smoke reached the flagged Creative v2 preview surface, then failed on a smoke-harness locator:

```text
expect(locator).toBeVisible() failed

Locator: getByText('Scale-ready')
Expected: visible
Error: strict mode violation: getByText('Scale-ready') resolved to 2 elements
```

Interpretation: the runtime was authenticated and reachable, but the example npm smoke harness currently uses a non-unique text locator for `Scale-ready`. This is a harness cleanup item. It does not invalidate the owner-host runtime no-write evidence below, because the owner-host check reached the same surface and asserted the same release-safety properties with a non-ambiguous locator.

## Owner-Host Runtime No-Write Check

Codex ran the owner-host runtime no-write check without changing product behavior. The check used the same self-hosted DB-backed localhost app, the same temporary authenticated storage state, the same v2 preview flag, the same unsafe-method network capture, and exact/role-safe assertions for the duplicated `Scale-ready` text.

Sanitized result:

```json
{
  "adHocRuntimeCheck": "completed",
  "authenticatedStorageStateUsed": true,
  "v2PreviewOffByDefault": true,
  "v2PreviewWithFlag": true,
  "readOnlySectionsVisible": true,
  "unsafeMutationRequests": 0,
  "forbiddenRenderedActionTerms": 0,
  "forbiddenRenderedInternalTerms": 0,
  "runtimeNetworkCaptureComplete": true,
  "selfHostedLocalhostEvidence": true
}
```

## Runtime Evidence Assessment

Runtime no-write evidence for the owner-host/self-hosted path is green for the checked surface. Main/live still remains NOT READY for the broader release process until controller/Claude final main-live review accepts this evidence and any remaining GitHub hygiene/release blockers are closed.

Evidence that did pass in the ad hoc check:

- v2 preview absent/off without the explicit preview flag.
- v2 preview visible with the explicit preview flag.
- Read-only support sections rendered.
- Unsafe mutation requests captured: 0.
- Forbidden rendered action terms: 0.
- Forbidden rendered internal terms: 0.
- Runtime network capture complete for the checked v2 preview flow: true.

Remaining cleanup item:

- Fix the example npm smoke harness locator for `Scale-ready` so `npm run creative:v2:self-hosted-smoke` can also produce the same green result without a strict-mode duplicate text failure.

## Release-Safety Constraints Preserved

- No merge was performed.
- Main was not touched.
- No live deploy was triggered.
- Product-ready remains NO.
- Main merge-ready remains NO.
- Live deploy-ready remains NO.
- v1 default unchanged.
- v2 preview off-by-default unchanged.
- Queue/apply remains disabled.
- Command Center remains disconnected.
- No product code, resolver logic, gold labels, v1 behavior, UI behavior, queue/apply behavior, Command Center wiring, DB write path, or Meta/platform write path was changed by this recheck.
- No secrets or private runtime values were requested or committed.
