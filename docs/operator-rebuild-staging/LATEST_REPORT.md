# Step 9 — Safe Non-Demo Benchmark Proof Path And Live Evidence Upgrade

## 1. Executive Summary

* Step 9 started by reconciling actual repo/runtime truth, not by assuming a release-authority defect.
* preflight repo `HEAD`, `origin/main`, live runtime, and `release-authority` were all aligned at `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`.
* there is a standalone non-program product commit after the latest Step 8 continuity commit:
  * continuity commit: `1e9e359e8616e3f87fa0a744c3f8048f1843f5ae`
  * actual product head at Step 9 start: `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* no approved safe path reached `Grandmix`, `IwaStore`, or `TheSwaf`.
* the saved commercial storage state had simply expired, but the healthy reviewer session and a fresh seeded commercial smoke session both still exposed only `Adsecute Demo`.
* all benchmark-business switch attempts still returned `403 No access to this business.`
* no non-demo page-level, row-level, detail-level, or drawer-level Creative proof was captured.
* reviewer smoke regressed narrowly on current live because Meta ad-set action content had moved below the fold inside a scrollable panel; a smoke-only Playwright fix restored it.
* verdict: `blocked`

## 2. Truth Reconciliation

Read order used before work:

1. `docs/operator-rebuild/HANDOFF.md`
2. `docs/operator-rebuild-staging/LATEST_REPORT.md`
3. `docs/operator-rebuild-staging/STATUS.md`

Preflight verification on April 12, 2026:

* current branch
  * `main`
* current actual repo `HEAD`
  * `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* current actual `origin/main`
  * `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* local `HEAD` matched `origin/main`
  * yes
* current live runtime/build truth
  * `build-info buildId` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `release-authority currentLiveSha` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `release-authority currentMainSha` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `release-authority currentMainShaSource` `github_branch_head`
  * `release-authority liveVsMain.status` `aligned`
  * `release-authority overall.status` `aligned`

Continuity classification:

* latest operator-rebuild continuity commit before Step 9
  * `1e9e359e8616e3f87fa0a744c3f8048f1843f5ae`
  * `step8: stabilize reviewer smoke and record proof status`
* standalone non-program commit after that continuity commit
  * `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
  * `feat: move commercial truth from settings to main navigation`
* whether standalone non-program commits exist after the latest operator-rebuild continuity commit
  * yes
* whether current runtime/main drift was explainable
  * there was no runtime/main drift at Step 9 start
  * live and main were aligned at the current product head
  * the continuity docs were stale, but the system itself was not drifting suspiciously

## 3. Benchmark-Business Access Attempt

Goal:

* reach `Grandmix`, `IwaStore`, or `TheSwaf` through approved safe paths only

Safe paths used:

* existing saved reviewer session against production
* existing saved commercial storage state against production
* fresh approved commercial smoke operator seed plus production `/login`
* authenticated reads of `/api/auth/me`
* authenticated reads of `/api/businesses`
* authenticated switch attempts through `/api/auth/switch-business`

Observed access truth by path:

* saved commercial storage state
  * `/api/auth/me`
    * `401`
    * `{"authenticated":false}`
  * classification
    * session-scoping / expired session
* saved reviewer storage state
  * `/api/businesses`
    * `Adsecute Demo` only
  * `/api/auth/switch-business`
    * `Grandmix` `403 {"error":"forbidden","message":"No access to this business."}`
    * `IwaStore` `403 {"error":"forbidden","message":"No access to this business."}`
    * `TheSwaf` `403 {"error":"forbidden","message":"No access to this business."}`
  * classification
    * access-control
* fresh seeded commercial smoke operator
  * login
    * succeeded
  * seeded execution business
    * `null`
  * `/api/businesses`
    * `Adsecute Demo` only
  * `/api/auth/switch-business`
    * `Grandmix` `403 {"error":"forbidden","message":"No access to this business."}`
    * `IwaStore` `403 {"error":"forbidden","message":"No access to this business."}`
    * `TheSwaf` `403 {"error":"forbidden","message":"No access to this business."}`
  * classification
    * access-control

Per target business:

* `Grandmix`
  * reachable
    * no
  * safe path used
    * saved reviewer session
    * fresh commercial smoke session
  * exact failure mode
    * `403 No access to this business.`
  * class
    * access-control
* `IwaStore`
  * reachable
    * no
  * safe path used
    * saved reviewer session
    * fresh commercial smoke session
  * exact failure mode
    * `403 No access to this business.`
  * class
    * access-control
* `TheSwaf`
  * reachable
    * no
  * safe path used
    * saved reviewer session
    * fresh commercial smoke session
  * exact failure mode
    * `403 No access to this business.`
  * class
    * access-control

Conclusions:

* no safely reachable non-demo benchmark business was available in Step 9
* the blocker is approved access scope, not release-authority, deploy state, or a broken business-switch route
* no membership or access-control mutation was done to force proof

## 4. Strong Live Proof Status

Required benchmark-business proof:

* not achieved

Non-demo proof actually captured in Step 9:

* page-level
  * none
* row-level
  * none
* detail-level
  * none
* drawer-level
  * none

Strongest evidence captured this step:

* access-truth evidence only
* approved reviewer and commercial paths still do not reach any of the three benchmark businesses

Why proof state was not upgraded:

* no real connected non-demo business was safely reachable
* Step 8 demo-only proof remains the strongest Creative runtime proof, and Step 9 did not improve it

## 5. Reviewer Smoke Stability

Exact live smoke command:

* `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`

Initial regression on current live:

* failure:
  * `playwright/tests/reviewer-smoke.spec.ts:65`
  * `meta-campaign-adset-actions` existed but remained hidden to Playwright
* actual cause:
  * not a Meta data regression
  * the current layout left the ad-set action card below the fold inside the scrollable Meta detail panel

Exact safe smoke-only change made:

* `playwright/tests/reviewer-smoke.spec.ts`
  * after opening campaign reasoning, use DOM `scrollIntoView({ block: "center", inline: "nearest" })` on:
    * `meta-campaign-adset-actions`
    * `meta-adsets-section`
* `playwright/tests/commercial-truth-smoke.spec.ts`
  * mirror the same DOM scroll for `meta-campaign-adset-actions`

Final verification:

* reviewer smoke rerun
  * passed
  * `2 passed (18.4s)`
* commercial Meta recheck
  * the long commercial smoke spec did not return promptly after producing the relevant Meta/Command Center artifacts
  * final targeted verification therefore used a one-off Playwright probe against the seeded commercial smoke operator
  * result:
    * `meta-campaign-adset-actions` visible and in viewport after the same DOM scroll used in the smoke
    * `meta-adsets-section` visible and in viewport after the same DOM scroll used in the smoke

Meaning:

* reviewer smoke is healthy again through Creative
* no product-runtime change was required
* the Step 9 blocker remains non-demo access, not smoke reachability

## 6. Commands Run And Results

Truth reconciliation:

* `git branch --show-current`
  * `main`
* `git rev-parse HEAD`
  * `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* `git ls-remote origin refs/heads/main`
  * `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* `curl -fsSL https://adsecute.com/api/build-info`
  * `buildId` `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`
* `curl -fsSL https://adsecute.com/api/release-authority`
  * live/main aligned at `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`

Access-truth verification:

* one-off Playwright probes were used to:
  * inspect saved reviewer and commercial storage states
  * seed and log in the approved commercial smoke operator
  * read `/api/businesses`
  * attempt `/api/auth/switch-business`

Smoke verification:

* reviewer smoke command above
  * first run: failed at `meta-campaign-adset-actions` visibility
  * final run: passed, `2 passed (18.4s)`
* targeted commercial Meta probe
  * confirmed the mirrored Meta smoke interaction stays valid after the DOM scroll adjustment

Build / typecheck:

* `npx tsc --noEmit`
  * first run failed because the workspace had stale `.next/types` include references before build regeneration
* `npm run build`
  * passed
* `npx tsc --noEmit`
  * rerun after build
  * passed

## 7. Acceptance Check

Required for strong Step 9 success:

1. at least one real connected non-demo business safely reachable
2. strong live Creative proof captured there
3. overall proof state materially upgraded beyond Step 8 demo-only evidence

Current Step 9 state:

1. safe non-demo business reachable
   * not achieved
2. strong non-demo Creative proof captured
   * not achieved
3. smoke health preserved
   * achieved after a smoke-only fix

Step 9 verdict:

* `blocked`

Why not `shipped-not-complete`:

* Step 9’s assigned objective was to secure an approved non-demo proof path
* the real reason the program cannot advance now is a hard operational/access blocker
* no honest non-demo proof upgrade is possible until that blocker changes

## 8. Remaining Blocker

* approved safe reviewer and commercial sessions still do not have access to `Grandmix`, `IwaStore`, or `TheSwaf`
* all three switch attempts still fail with exact `403 No access to this business.`
* there is no configured `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID` to provide an already-approved real-business proof path

## 9. Copy-Paste Summary

Step 9 began by reconciling actual repo/runtime truth and found that the system was already aligned at `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878`, not at the older Step 8 continuity SHA. That shift was explainable: a standalone product commit `df9e7a515c74afc5cb36a2eaa3e02dc90bb1e878 feat: move commercial truth from settings to main navigation` had landed after the last Step 8 continuity commit `1e9e359e8616e3f87fa0a744c3f8048f1843f5ae`, and `release-authority` correctly reported live/main alignment there. Step 9 then re-attempted benchmark-business access through approved safe paths only. The saved commercial storage state had simply expired with `401 {"authenticated":false}`, but the healthy saved reviewer session and a fresh seeded commercial smoke session both exposed only `Adsecute Demo`; switch attempts to `Grandmix`, `IwaStore`, and `TheSwaf` all still returned `403 {"error":"forbidden","message":"No access to this business."}`. No non-demo page, row, detail, or drawer Creative proof was captured, so the proof state was not upgraded. While rechecking smoke health, reviewer smoke regressed narrowly on Meta because `meta-campaign-adset-actions` was now below the fold inside the scrollable detail panel. A smoke-only Playwright fix that uses DOM `scrollIntoView(...)` restored the flow, and the final reviewer smoke rerun passed in `18.4s`. `npm run build` passed, and `npx tsc --noEmit` passed after rerunning on the regenerated `.next/types`. The honest Step 9 verdict is `blocked` because approved access scope is now the real reason the program cannot advance.
