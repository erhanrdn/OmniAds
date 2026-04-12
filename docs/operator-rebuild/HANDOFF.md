# Operator Rebuild Handoff

## Current Objective

Step 9 is the latest executed step. The remaining program gate is no longer deploy reachability or Creative authority clarity. The real blocker is approved safe access to at least one connected non-demo business for live proof.

## Current Step

Step 9, `Safe Non-Demo Benchmark Proof Path And Live Evidence Upgrade`.

Verdict:

* `blocked`

Why:

* preflight repo `HEAD`, `origin/main`, live runtime, and `release-authority` were all aligned at `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* the latest operator-rebuild continuity state in docs was stale relative to actual repo truth
* there is a standalone non-program product commit after the latest Step 8 continuity commit:
  * latest continuity commit before Step 9: `1e9e359e8616e3f87fa0a744c3f8048f1843f5ae` `step8: stabilize reviewer smoke and record proof status`
  * current actual repo/live commit at Step 9 start: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878` `feat: move commercial truth from settings to main navigation`
* no approved safe session path reached `Grandmix`, `IwaStore`, or `TheSwaf`
* fresh commercial smoke access still exposed only `Adsecute Demo`
* all benchmark-business switch attempts still returned `403 No access to this business.`
* no strong live page/row/detail/drawer proof was captured on a real connected non-demo business
* reviewer smoke did regress narrowly on current live, but the regression was smoke-only and is now fixed

## Current Repo State

Preflight truth verified on April 12, 2026 before any Step 9 edits:

* current branch: `main`
* current actual repo `HEAD`: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* current actual `origin/main`: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* local `HEAD` matched `origin/main`: yes
* current live runtime SHA: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* current release-authority live SHA: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* current release-authority main SHA: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`

Continuity classification:

* latest operator-rebuild continuity commit before Step 9:
  * `1e9e359e8616e3f87fa0a744c3f8048f1843f5ae`
  * `step8: stabilize reviewer smoke and record proof status`
* standalone non-program commit after that continuity commit:
  * `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `feat: move commercial truth from settings to main navigation`
* current runtime/main drift explainable or suspicious:
  * no runtime/main drift was present at Step 9 start; live and main were aligned at the same product commit
  * do not treat the existence of the standalone product commit after the last continuity commit as a continuity bug by default

## Current Live / Release Truth

Verified at Step 9 start on April 12, 2026:

* `https://adsecute.com/api/build-info`
  * `buildId` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* `https://adsecute.com/api/release-authority`
  * `currentLiveSha` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `currentMainSha` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `currentMainShaSource` `github_branch_head`
  * `liveVsMain.status` `aligned`
  * `overall.status` `aligned`

Interpretation:

* the live runtime was already serving the current `main` product head at Step 9 start
* `release-authority` was current and not stale
* the Step 8 continuity docs lagged the actual repo/runtime state, but the system itself was behaving as designed

## Latest Accepted Findings

### Safe benchmark-business access attempts

Approved safe paths used on April 12, 2026:

* existing saved reviewer session against production
* existing saved commercial storage state against production
* fresh approved commercial smoke operator seed plus `/login`
* authenticated reads of `/api/businesses`
* authenticated switch attempts through `/api/auth/switch-business`

Observed access truth:

* existing commercial storage state:
  * `/api/auth/me` returned `401 {"authenticated":false}`
  * failure mode: session-scoping / expired session
* existing reviewer storage state:
  * `/api/businesses` exposed only `Adsecute Demo`
  * benchmark switch attempts for `Grandmix`, `IwaStore`, and `TheSwaf` all returned `403 {"error":"forbidden","message":"No access to this business."}`
  * failure mode: access-control
* fresh seeded commercial smoke operator:
  * login succeeded
  * `executionBusinessId` was `null`
  * `/api/businesses` exposed only `Adsecute Demo`
  * benchmark switch attempts for `Grandmix`, `IwaStore`, and `TheSwaf` all returned `403 {"error":"forbidden","message":"No access to this business."}`
  * failure mode: access-control

Per target business:

* `Grandmix`
  * reachable: no
  * safe path attempted: reviewer session, fresh commercial smoke session
  * exact failure mode: `403 No access to this business.`
  * classification: access-control
* `IwaStore`
  * reachable: no
  * safe path attempted: reviewer session, fresh commercial smoke session
  * exact failure mode: `403 No access to this business.`
  * classification: access-control
* `TheSwaf`
  * reachable: no
  * safe path attempted: reviewer session, fresh commercial smoke session
  * exact failure mode: `403 No access to this business.`
  * classification: access-control

Conclusion:

* no approved safe non-demo proof path was reachable in Step 9
* this is now the real blocker to advancing the program honestly
* no live membership, access-control, or privileged shortcut was added to force proof

### Strong live proof status

Strong non-demo proof captured in Step 9:

* none

Why no proof upgrade occurred:

* page-level non-demo proof: not captured
* row-level non-demo proof: not captured
* detail-level non-demo proof: not captured
* drawer-level non-demo proof: not captured
* the strongest new artifact was the access-truth record itself, which does not justify upgrading beyond demo-only proof

### Reviewer smoke stability

Current live reviewer smoke command:

* `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`

Exact regression found during Step 9:

* the smoke failed before Creative on current live
* `meta-campaign-adset-actions` still existed with real content, but the current layout left it below the fold inside a scrollable Meta detail panel
* this was not a product data or release-authority regression

Exact safe fix made:

* `playwright/tests/reviewer-smoke.spec.ts`
  * scroll `meta-campaign-adset-actions` and `meta-adsets-section` into view with DOM `scrollIntoView(...)` before visibility assertions
* `playwright/tests/commercial-truth-smoke.spec.ts`
  * mirror the same DOM scroll for `meta-campaign-adset-actions`

Final smoke result:

* reviewer smoke now passes again on live production
* result:
  * `2 passed (18.4s)`

Meaning:

* reviewer smoke remains healthy through Creative after the smoke-only fix
* Step 9 did not require any product-runtime change

## Open Problems / Blockers

* approved safe sessions still cannot reach `Grandmix`, `IwaStore`, or `TheSwaf`
* `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID` is unset, so there is no preconfigured safe commercial canary business path
* no strong real connected non-demo Creative proof can be captured until access truth changes through an approved channel

## Explicitly Out Of Scope

* Step 10
* deployment work by default
* release-authority redesign without a real defect
* widening live memberships or access control to force benchmark-business proof
* creating a new privileged shortcut just to make Step 9 pass
* broad auth-system changes

## Next Recommended Step

No next step is authorized by default. If a later prompt assigns follow-up work, start by re-verifying:

1. `git branch --show-current`
2. `git rev-parse HEAD`
3. `git ls-remote origin refs/heads/main`
4. `https://adsecute.com/api/build-info`
5. `https://adsecute.com/api/release-authority`

Then only continue if there is an explicitly approved non-demo access path for `Grandmix`, `IwaStore`, or `TheSwaf`, or an explicitly approved canary business configuration that does not widen permissions ad hoc.

## Next Chat Bootstrap

Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` second. Read `docs/operator-rebuild-staging/STATUS.md` third. Re-verify branch, local `HEAD`, `origin/main`, `https://adsecute.com/api/build-info`, and `https://adsecute.com/api/release-authority` before touching code. Step 9 found that actual repo/live truth had already moved to `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`, which is a standalone product commit after the last Step 8 continuity commit `1e9e359e8616e3f87fa0a744c3f8048f1843f5ae`, and that this was not a continuity bug by default. The real blocker is still approved safe access to a real connected non-demo business: reviewer and commercial smoke flows only expose `Adsecute Demo`, and switch attempts to `Grandmix`, `IwaStore`, and `TheSwaf` still return `403 No access to this business.` Reviewer smoke is healthy again after a smoke-only Meta scroll fix. Do not start Step 10 without an explicit follow-up prompt.
