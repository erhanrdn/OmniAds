# Step 8 — Strong Live Proof Collection And Reviewer Smoke Stabilization

## 1. Executive Summary

* Step 8 did not deploy anything new.
* Production still serves the Step 6 Creative runtime `8f0f0b74047c0ce05c8a74b02890e0e104d75484`.
* `release-authority` correctly reports live `8f0f0b74047c0ce05c8a74b02890e0e104d75484` and main `6db568b3defab4fd13e19514669c09d42c796911`.
* current runtime/main drift remains explainable because `6db568b3defab4fd13e19514669c09d42c796911` is a docs-only continuity head.
* safe benchmark-business access still was not reachable:
  * `Grandmix`, `IwaStore`, and `TheSwaf` all returned `403 No access to this business.`
* the shared live reviewer smoke is now stabilized and passes through Creative on production.
* verdict: `shipped-not-complete`

## 2. Truth Reconciliation

Read order used before work:

1. `docs/operator-rebuild/HANDOFF.md`
2. `docs/operator-rebuild-staging/LATEST_REPORT.md`
3. `docs/operator-rebuild-staging/STATUS.md`

Preflight verification on April 12, 2026:

* current branch
  * `main`
* current local repo `HEAD`
  * `6db568b3defab4fd13e19514669c09d42c796911`
* current remote `origin/main`
  * `6db568b3defab4fd13e19514669c09d42c796911`
* local `HEAD` matches `origin/main`
  * yes
* current live runtime/build truth
  * `build-info buildId` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `release-authority currentLiveSha` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `release-authority currentMainSha` `6db568b3defab4fd13e19514669c09d42c796911`
  * `release-authority currentMainShaSource` `github_branch_head`
  * `release-authority liveVsMain.status` `drifted`

Drift interpretation:

* Step 6 runtime is still live
* `release-authority` is not stale
* `git show --stat --name-only 6db568b3defab4fd13e19514669c09d42c796911` shows a docs-only continuity commit:
  * `docs/operator-rebuild-staging/LATEST_REPORT.md`
  * `docs/operator-rebuild-staging/STATUS.md`
  * `docs/operator-rebuild/HANDOFF.md`
* current runtime/main drift is therefore explainable, not suspicious

## 3. Benchmark-Business Access Attempt

Goal:

* try to reach `Grandmix`, `IwaStore`, and `TheSwaf` without mutating live access scope

Safe method used:

* seeded the approved commercial smoke operator against production
* authenticated to `https://adsecute.com/login`
* read `/api/businesses`
* attempted `/api/auth/switch-business` for the benchmark businesses

Observed access truth:

* accessible businesses from the safe commercial session:
  * `Adsecute Demo`
* benchmark business attempts:
  * `Grandmix`
    * `403`
    * `{"error":"forbidden","message":"No access to this business."}`
  * `IwaStore`
    * `403`
    * `{"error":"forbidden","message":"No access to this business."}`
  * `TheSwaf`
    * `403`
    * `{"error":"forbidden","message":"No access to this business."}`

Conclusions:

* no safely reachable non-demo business was available in Step 8
* no membership or access-control mutation was done to force proof
* stronger non-demo live proof was not captured

## 4. Current Live `/creatives` Proof

Selected reachable business:

* `Adsecute Demo`

### Page-level preview-truth contract

Exact current live text:

* `Preview truth is missing across this review scope.`
* `0 ready · 0 degraded · 8 missing. Missing preview truth blocks authoritative action until media resolves.`
* `Ready preview media supports decisive action language. Degraded preview keeps review metrics-only. Missing preview blocks authoritative action.`

### Page-level lane / order visibility

Exact currently visible page quick-filter subset:

* `BLOCKED`
* `Preview or deployment truth blocks clean operator action right now.`
* count `8`

Exact limitation:

* the current reachable page-level dataset does not visibly expose `Act now`, `Needs truth`, `Keep testing`, or `Protected` as page quick filters

Important nuance from the drawer support surface:

* the Decision Support drawer still reports broader deterministic population:
  * `Scale-ready 3`
  * `Keep testing 4`
  * `Blocked 1`
  * `Protected winners 3`
* do not collapse that drawer summary into a claim that the page-level quick filters visibly expose those lanes

### Row-level authority wording

First visible row:

* `UrbanTrail Explorer Backpack Creative 1`

Exact row-level state / wording:

* `Preview missing`
* `Blocked`
* `Protected winner`
* `Preview truth is missing, so this creative cannot headline an authoritative action yet.`
* `No renderable preview sources are available for this creative.`

### Detail preview-truth gate

Exact live detail text:

* `Preview Truth Gate`
* `Preview truth is missing, so authoritative action is blocked.`
* `Do not treat this row as clean execute-now work until preview media becomes available for the live decision window.`

### Deterministic decision language

Exact live detail text:

* `Decision + key metrics`
* `Monitor before committing more budget`
* `Deterministic engine marks this as a shipped winner that should stay protected.`

### AI commentary framing

Exact live detail text:

* `Support only`
* `AI interpretation stays disabled because preview truth is missing.`

### Drawer support framing

Exact live drawer text:

* `Decision Support`
* `Creative Decision Support`
* `The page worklist stays primary. This drawer is support for live-window decision context only.`

## 5. Reviewer Smoke Stabilization

Exact live repro command:

* `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`

### Initial failure

Result before fixes:

* reviewer auth setup passed
* smoke failed after `120000ms`
* reported checkpoint:
  * `playwright/tests/reviewer-smoke.spec.ts:56`
  * waiting for `meta-campaign-detail`

What the timing probe actually showed:

* this was not a broad Meta product regression
* the smoke was wasting about 30 seconds on:
  * `page.waitForLoadState("networkidle")`
* on live production, `meta-campaign-detail` became visible almost immediately once waited for directly

### First stabilization pass

Change made:

* removed the Meta `networkidle` wait after the campaign click
* updated the Creative quick-filter selector from stale `creative-quick-filter-panel-*` to current `creative-quick-filter-*`

Follow-up failure:

* same smoke then failed later at:
  * `playwright/tests/reviewer-smoke.spec.ts:121`
* exact issue:
  * pointer-click retries on the first Creative quick filter were being intercepted by other drawer elements inside the oversized Decision Support drawer

### Final stabilization pass

Final exact change:

* kept the same filter proof
* switched activation to:
  * `scrollIntoViewIfNeeded()`
  * `focus()`
  * `press("Enter")`

Why this was the minimum safe fix:

* the quick-filter button is a real interactive button
* keyboard activation proves the filter still works without broadening product behavior or adding arbitrary sleeps

### Final smoke result

Exact command rerun:

* `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`

Result:

* `2 passed (17.0s)`

Meaning:

* reviewer smoke now reaches Creative
* the Meta segment no longer blocks Creative verification

## 6. Commands Run And Results

Typecheck:

* `npx tsc --noEmit`
  * passed

Reviewer smoke:

* `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`
  * first run: failed at old Meta checkpoint after timeout
  * second run: failed at Creative quick-filter pointer interception
  * final run: passed, `2 passed (17.0s)`

Focused live verification:

* one-off `node --input-type=module --env-file=.env.local` Playwright probes were used to:
  * authenticate the commercial smoke operator
  * read `/api/businesses`
  * attempt `/api/auth/switch-business`
  * extract current production `/creatives` proof text

Targeted Vitest:

* none applicable
* only Playwright smoke code and continuity docs changed

## 7. Acceptance Check

Required to move beyond `shipped-not-complete`:

1. strong live proof on at least one real connected non-demo business
2. reviewer smoke no longer blocked before Creative, or only limited in a way that does not materially weaken the Creative verification story

Current Step 8 state:

1. real non-demo business proof
   * not achieved safely
2. reviewer smoke reaches Creative
   * achieved

Step 8 verdict:

* `shipped-not-complete`

Why not `accepted`:

* the smoke blocker is fixed
* but Step 8 still did not obtain a strong non-demo live proof path

## 8. Remaining Blockers

* benchmark businesses are still not safely reachable from the approved commercial smoke session
* strongest currently captured live proof still comes from `Adsecute Demo`
* current runtime/main drift remains explainable background, but it is not the Step 8 blocker

## 9. Copy-Paste Summary

Step 8 re-verified that production still serves Step 6 runtime `8f0f0b74047c0ce05c8a74b02890e0e104d75484`, while `release-authority` correctly reports current `main` as the docs-only continuity head `6db568b3defab4fd13e19514669c09d42c796911`. That drift remained explainable and was not treated as a bug. The safe commercial smoke operator still exposed only `Adsecute Demo`, and live switch attempts to `Grandmix`, `IwaStore`, and `TheSwaf` all returned `403 No access to this business`, so no strong non-demo live proof was captured. Focused live `/creatives` verification on the reachable dataset reconfirmed the preview-truth gate, blocked row honesty, deterministic decision panel, support-only AI framing, and support-only drawer framing; the currently visible page quick-filter subset still only exposed `BLOCKED`. The shared reviewer smoke was then stabilized by removing a dead `networkidle` wait after the Meta campaign click and by updating the Creative quick-filter interaction to the current selector plus keyboard activation inside the drawer. The final live reviewer smoke command passed end-to-end in `17.0s`, so Creative is no longer blocked by the Meta segment. The honest Step 8 verdict remains `shipped-not-complete` because real non-demo live proof is still missing.
