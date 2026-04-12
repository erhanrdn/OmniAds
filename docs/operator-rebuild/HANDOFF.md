# Operator Rebuild Handoff

## Current Objective

Step 7 is the latest completed step. Production now serves the Step 6 Creative runtime, and live verification has been captured. No new step is active. Do not start Step 8 unless a later chat explicitly assigns it.

## Current Step

Step 7, `Deploy Step 6 Candidate And Capture Live Verification`.

Verdict:

* `shipped-not-complete`

Why:

* the Step 6 runtime SHA is now live in production
* focused live `/creatives` verification proved the preview-truth gate, blocked authority language, deterministic decision, support-only AI framing, and support-only drawer framing
* proof quality is still limited because the safe live operator session only exposed `Adsecute Demo`, not `Grandmix`, `IwaStore`, or `TheSwaf`
* the shared live reviewer smoke still failed in the Meta segment before reaching Creative

## Current Repo State

* current branch: `main`
* current local `HEAD`: `eeea595f685d852acf82c744fea0a2715d76c7b0`
* current `origin/main`: `eeea595f685d852acf82c744fea0a2715d76c7b0`
* local `HEAD` matches `origin/main`
* Step 7 repo start SHA: `eeea595f685d852acf82c744fea0a2715d76c7b0`
* Step 6 runtime implementation SHA: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* Step 5 continuity closeout SHA: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`

Important interpretation:

* `eeea595f685d852acf82c744fea0a2715d76c7b0` is the current repo/main head, but it is a docs-only continuity commit
* the runtime/product candidate that Step 7 needed to deploy was still the Step 6 runtime SHA `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* do not collapse those two facts into one story

## Current Live / Release Truth

Verified at Step 7 start on April 12, 2026:

* `https://adsecute.com/api/build-info`
  * `buildId` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* `https://adsecute.com/api/release-authority`
  * `currentLiveSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * `currentMainSha` `eeea595f685d852acf82c744fea0a2715d76c7b0`
  * `currentMainShaSource` `github_branch_head`
  * overall posture `drifted`

Verified after the Step 7 manual deploy completed on April 12, 2026:

* `https://adsecute.com/api/build-info`
  * `buildId` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* `https://adsecute.com/api/release-authority`
  * `currentLiveSha` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `currentMainSha` `eeea595f685d852acf82c744fea0a2715d76c7b0`
  * `currentMainShaSource` `github_branch_head`
  * `liveVsMain.status` `drifted`
  * `overall.status` `drifted`

Interpretation:

* Step 6 is now live in production at `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* the server is no longer behind the Step 6 runtime candidate
* `release-authority currentMainSha` is no longer stale; it correctly reports the docs-only repo/main head `eeea595f685d852acf82c744fea0a2715d76c7b0`
* the remaining drift is explainable `live runtime != current docs-only main head`
* that repo/live divergence is not, by itself, a product bug

## Deployment Record

What happened:

* Step 6 CI rerun was requested on workflow run `24312358343`
* rerun attempt `2` succeeded and published the exact Step 6 runtime images
* the automatic deploy workflow run `24312785888` was created by CI but skipped itself because:
  * input SHA was `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `require_current_main_head` was `true`
  * current `main` had already moved to docs-only `eeea595f685d852acf82c744fea0a2715d76c7b0`
* the real deploy attempt was then manually dispatched through the existing `deploy-hetzner.yml` workflow with:
  * `sha` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `require_current_main_head` `false`
* manual deploy workflow run `24312805013`:
  * `Deploy over SSH` succeeded
  * production `build-info` moved to `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * workflow conclusion still showed failure only because `Verify public release authority` treated `live != main` as blocking

Do not misread the red workflow as a failed server deploy. The server deploy succeeded; the post-deploy verifier failed on release-identity drift semantics.

## Latest Accepted Findings

Focused live `/creatives` proof on April 12, 2026:

* page-level contract is live and explicit:
  * `Preview truth is missing across this review scope.`
  * `0 ready · 0 degraded · 8 missing. Missing preview truth blocks authoritative action until media resolves.`
* row-level blocked language is live and honest:
  * `Preview truth is missing, so this creative cannot headline an authoritative action yet.`
* detail view now leads with the preview-truth gate:
  * `Preview truth is missing, so authoritative action is blocked.`
  * `AI commentary disabled`
* deterministic decision remains explicit in detail even when preview truth blocks authority:
  * `Decision + key metrics`
  * `Monitor before committing more budget`
* AI commentary is live as secondary support only:
  * badge `Support only`
  * `AI interpretation stays disabled because preview truth is missing.`
* drawer framing is live as support/secondary authority:
  * `The page worklist stays primary. This drawer is support for live-window decision context only.`

Supporting artifacts captured during Step 7:

* focused live Creative screenshots saved under `/tmp/adsecute-step7-1776016872015/`
* live reviewer smoke failure artifacts saved under `test-results/reviewer-smoke-reviewer-sm-76c4a--creative-decision-surfaces-smoke-chromium/`

## Open Problems / Blockers

* shared live reviewer smoke still fails in the Meta segment before it reaches Creative
  * live failure point: `playwright/tests/reviewer-smoke.spec.ts` timed out waiting for `meta-campaign-detail` after the campaign click
* safe live operator access only exposed `Adsecute Demo`
  * no safe live proof was captured for `Grandmix`, `IwaStore`, or `TheSwaf`
* the deploy workflow’s post-deploy verifier still marks the run red whenever live intentionally differs from the current repo/main head
  * current example: live `8f0f0b74047c0ce05c8a74b02890e0e104d75484` vs main `eeea595f685d852acf82c744fea0a2715d76c7b0`
* full five-lane Creative order was not fully observable from the available live demo dataset
  * live page-level quick filters only exposed the blocked lane because preview truth was missing across the demo review scope

## Explicitly Out Of Scope

* starting Step 8 automatically
* new product feature work
* a new Meta rebuild
* forcing benchmark-business access by mutating live memberships
* treating explainable repo/live SHA divergence as the primary bug story

## Next Recommended Step

No next step is authorized by default. If a later prompt assigns follow-up work, start by re-verifying:

1. `git branch --show-current`
2. `git rev-parse HEAD`
3. `git ls-remote origin refs/heads/main`
4. `https://adsecute.com/api/build-info`
5. `https://adsecute.com/api/release-authority`

Then decide whether the next task is:

* stronger live proof collection on a real connected benchmark business
* or a release-authority / deploy-verifier policy fix so explainable `live != main` drift stops reading like a failed deploy

## Next Chat Bootstrap

Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` second. Read `docs/operator-rebuild-staging/STATUS.md` third. Re-verify branch, local `HEAD`, `origin/main`, `https://adsecute.com/api/build-info`, and `https://adsecute.com/api/release-authority` before touching code. Current repo/main head is `eeea595f685d852acf82c744fea0a2715d76c7b0`; current live SHA is `8f0f0b74047c0ce05c8a74b02890e0e104d75484`; current release-authority `currentMainSha` is `eeea595f685d852acf82c744fea0a2715d76c7b0`. Do not start Step 8 unless explicitly assigned.
