# Operator Rebuild Handoff

## Current Objective

Step 8 is the latest completed step. Production still serves the Step 6 Creative runtime, the shared reviewer smoke is no longer blocked before Creative, and the remaining gap is stronger live proof on a real connected non-demo business.

## Current Step

Step 8, `Strong Live Proof Collection And Reviewer Smoke Stabilization`.

Verdict:

* `shipped-not-complete`

Why:

* Step 6 runtime is still live in production at `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* `release-authority` correctly reports live `8f0f0b74047c0ce05c8a74b02890e0e104d75484` and main `6db568b3defab4fd13e19514669c09d42c796911`
* current runtime/main drift remains explainable because `6db568b3defab4fd13e19514669c09d42c796911` is a docs-only continuity head
* the shared live reviewer smoke now passes through Meta, Command Center, and Creative on production
* stronger live proof on `Grandmix`, `IwaStore`, or `TheSwaf` was still not safely reachable from the approved commercial smoke path

## Current Repo State

* current branch: `main`
* current local `HEAD`: `6db568b3defab4fd13e19514669c09d42c796911`
* current `origin/main`: `6db568b3defab4fd13e19514669c09d42c796911`
* local `HEAD` matches `origin/main`
* Step 8 repo start SHA: `6db568b3defab4fd13e19514669c09d42c796911`
* Step 6 runtime implementation SHA still live: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

Why current `main` is explainable drift:

* `git show --stat --name-only 6db568b3defab4fd13e19514669c09d42c796911` only touches:
  * `docs/operator-rebuild-staging/LATEST_REPORT.md`
  * `docs/operator-rebuild-staging/STATUS.md`
  * `docs/operator-rebuild/HANDOFF.md`
* do not treat `live runtime != current main head` as a release-authority bug by default in this state

## Current Live / Release Truth

Verified at Step 8 start on April 12, 2026:

* `https://adsecute.com/api/build-info`
  * `buildId` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* `https://adsecute.com/api/release-authority`
  * `currentLiveSha` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `currentMainSha` `6db568b3defab4fd13e19514669c09d42c796911`
  * `currentMainShaSource` `github_branch_head`
  * `liveVsMain.status` `drifted`
  * `overall.status` `drifted`

Interpretation:

* Step 6 runtime is still live
* `release-authority` is reporting the real current repo/main head
* the current live/main drift is explainable, not suspicious, because `main` moved only for docs continuity

## Latest Accepted Findings

### Benchmark-business access attempt

Safe live access method used on April 12, 2026:

* seeded the existing commercial smoke operator against production and inspected `/api/businesses`
* attempted `/api/auth/switch-business` for:
  * `Grandmix`
  * `IwaStore`
  * `TheSwaf`

Observed access truth:

* reachable businesses from the approved safe session:
  * `Adsecute Demo`
* benchmark-business access:
  * `Grandmix`: `403 No access to this business.`
  * `IwaStore`: `403 No access to this business.`
  * `TheSwaf`: `403 No access to this business.`

Conclusion:

* no safe non-demo business proof path was reachable in Step 8
* no live membership or access-control widening was done to force proof

### Focused live `/creatives` proof on the reachable dataset

Selected business:

* `Adsecute Demo`

Current live page-level preview-truth contract:

* `Preview truth is missing across this review scope.`
* `0 ready · 0 degraded · 8 missing. Missing preview truth blocks authoritative action until media resolves.`

Current live lane / order visibility:

* page-level quick filters currently expose only:
  * `BLOCKED`
  * `Preview or deployment truth blocks clean operator action right now.`
  * count `8`
* the current reachable page-level dataset still does not visibly expose `Act now`, `Needs truth`, `Keep testing`, or `Protected` as page quick filters
* the drawer summary still reports broader deterministic population:
  * `Scale-ready 3`
  * `Keep testing 4`
  * `Blocked 1`
  * `Protected winners 3`
* treat that as drawer/support evidence, not as page-level lane visibility proof

Current live row-level authority wording:

* first visible row: `UrbanTrail Explorer Backpack Creative 1`
* visible row state:
  * `Preview missing`
  * `Blocked`
  * `Protected winner`
* exact row authority wording:
  * `Preview truth is missing, so this creative cannot headline an authoritative action yet.`
  * `No renderable preview sources are available for this creative.`

Current live detail preview-truth gate:

* `Preview Truth Gate`
* `Preview truth is missing, so authoritative action is blocked.`
* `Do not treat this row as clean execute-now work until preview media becomes available for the live decision window.`

Current live deterministic decision language:

* `Decision + key metrics`
* `Monitor before committing more budget`
* `Deterministic engine marks this as a shipped winner that should stay protected.`

Current live AI commentary framing:

* badge `Support only`
* `AI interpretation stays disabled because preview truth is missing.`

Current live drawer framing:

* `Decision Support`
* `Creative Decision Support`
* `The page worklist stays primary. This drawer is support for live-window decision context only.`

### Reviewer smoke stabilization

Exact failing smoke before the fix:

* command:
  * `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`
* failure:
  * `playwright/tests/reviewer-smoke.spec.ts:56`
  * timed out at `120000ms` while still pinned to the old Meta checkpoint

Root cause actually found:

* not a broad Meta regression
* `page.waitForLoadState("networkidle")` after the Meta campaign click was burning about 30 seconds on the live SPA even though `meta-campaign-detail` became visible almost immediately once waited for directly
* after removing that dead wait, the next honest blocker was Creative:
  * stale quick-filter selector shape
  * pointer-click brittleness inside the oversized Decision Support drawer

Exact safe smoke-only change made in `playwright/tests/reviewer-smoke.spec.ts`:

* removed the Meta `networkidle` wait after the campaign click
* updated the Creative quick-filter selector from the stale `creative-quick-filter-panel-*` prefix to the current `creative-quick-filter-*` prefix
* activated the first quick filter through scroll + focus + `Enter` instead of a brittle pointer click inside the drawer

Final live smoke result:

* same command now passes
* result:
  * `2 passed (17.0s)`

Meaning:

* shared reviewer smoke no longer blocks before Creative
* Creative verification is now reachable through the shared reviewer smoke

## Open Problems / Blockers

* no safe live proof has been captured yet for `Grandmix`, `IwaStore`, or `TheSwaf`
* `accepted` is still not justified because Step 8 did not obtain at least one strong real connected non-demo business proof path
* current release-authority drift remains explainable background, not the main Step 8 story

## Explicitly Out Of Scope

* starting Step 9
* new deployment work
* release-authority redesign without a real defect
* widening live memberships or access control to force benchmark-business proof
* turning Step 8 into feature work

## Next Recommended Step

No next step is authorized by default. If a later prompt assigns follow-up work, start by re-verifying:

1. `git branch --show-current`
2. `git rev-parse HEAD`
3. `git ls-remote origin refs/heads/main`
4. `https://adsecute.com/api/build-info`
5. `https://adsecute.com/api/release-authority`

Then focus only on securing a safe non-demo benchmark-business proof path without mutating live access scope.

## Next Chat Bootstrap

Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` second. Read `docs/operator-rebuild-staging/STATUS.md` third. Re-verify branch, local `HEAD`, `origin/main`, `https://adsecute.com/api/build-info`, and `https://adsecute.com/api/release-authority` before touching code. Current repo/main head is `6db568b3defab4fd13e19514669c09d42c796911`; current live SHA is `8f0f0b74047c0ce05c8a74b02890e0e104d75484`; current release-authority `currentMainSha` is `6db568b3defab4fd13e19514669c09d42c796911`. Step 8 improved smoke stability, but the honest program verdict remains `shipped-not-complete` until a real non-demo live proof path is safely captured.
