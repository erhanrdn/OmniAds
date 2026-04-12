# Step 7 — Deploy Step 6 Candidate And Capture Live Verification

## 1. Executive Summary

* Step 7 deployed the Step 6 Creative runtime to production.
* Production `build-info` moved from `8eae2d713a78ac7ca500427e0bee05ddf6afa464` to `8f0f0b74047c0ce05c8a74b02890e0e104d75484`.
* `release-authority` now reflects deployed reality correctly:
  * `currentLiveSha` is the live Step 6 runtime
  * `currentMainSha` is the current docs-only `main` head `eeea595f685d852acf82c744fea0a2715d76c7b0`
* focused live `/creatives` proof confirmed the Step 6 preview-truth gate and support-only authority framing on production.
* the shared live reviewer smoke still failed in Meta before it reached Creative.
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
  * `eeea595f685d852acf82c744fea0a2715d76c7b0`
* current remote `origin/main`
  * `eeea595f685d852acf82c744fea0a2715d76c7b0`
* local `HEAD` matches `origin/main`
  * yes
* current live runtime/build truth before deployment
  * `build-info buildId` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * `release-authority currentLiveSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * `release-authority currentMainSha` `eeea595f685d852acf82c744fea0a2715d76c7b0`
  * `release-authority currentMainShaSource` `github_branch_head`
  * `release-authority liveVsMain.status` `drifted`

Interpretation before deployment:

* current repo candidate SHA on `main`: `eeea595f685d852acf82c744fea0a2715d76c7b0`
* current Step 6 runtime candidate to deploy: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* current served live SHA before deployment: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* the server was behind the Step 6 runtime candidate before deployment
* that pre-deploy lag was not treated as an error by default

## 3. Deployment Record

Intended deployment SHA:

* `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

Why that was the correct runtime target:

* current repo/main `HEAD` `eeea595f685d852acf82c744fea0a2715d76c7b0` was a docs-only continuity commit
* the actual Step 6 runtime/product change remained `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

Deploy requested / attempted / completed chronology:

* deploy requested
  * Step 6 CI run `24312358343` was rerun
* exact-SHA image publish
  * rerun attempt `2` succeeded
  * `publish-images` completed successfully at `2026-04-12T17:55:00Z`
* automatic deploy request
  * deploy workflow run `24312785888` was auto-created by CI
  * it skipped itself because `require_current_main_head=true` and `8f0f0b74047c0ce05c8a74b02890e0e104d75484 != eeea595f685d852acf82c744fea0a2715d76c7b0`
* manual deploy attempt
  * manual `deploy-hetzner.yml` dispatch was sent with:
    * `sha` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
    * `require_current_main_head=false`
  * workflow run `24312805013`
* deployment completion
  * `Deploy over SSH` succeeded
  * production moved to the target SHA

Important post-deploy nuance:

* workflow run `24312805013` ended red, but not because SSH deploy failed
* the only failing step was `Verify public release authority`
* exact verifier failure detail:
  * `Current live SHA 8f0f0b74047c0ce05c8a74b02890e0e104d75484 differs from remote main eeea595f685d852acf82c744fea0a2715d76c7b0.`
* this is a post-deploy release-identity policy failure, not a failed server deploy

## 4. Live Truth After Deployment

Post-deploy verification on April 12, 2026:

* `https://adsecute.com/api/build-info`
  * `buildId` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* `https://adsecute.com/api/release-authority`
  * `currentLiveSha` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
  * `currentMainSha` `eeea595f685d852acf82c744fea0a2715d76c7b0`
  * `currentMainShaSource` `github_branch_head`
  * `liveVsMain.status` `drifted`
  * `overall.status` `drifted`

Explicit conclusions:

* live SHA after deploy: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* live now matches the deployed Step 6 runtime candidate
* Step 6 is now live
* `release-authority currentMainSha` is now correct, not stale
* `release-authority` still reports explainable drift because current live runtime differs from the current docs-only `main` head

## 5. Live `/creatives` Verification

Safe live auth method used:

* seeded a fresh commercial smoke operator against the connected database
* signed in directly through `https://adsecute.com/login`

Business reach:

* available live businesses from that safe session:
  * `Adsecute Demo`
* benchmark businesses matched:
  * none

Why benchmark-business proof was not captured:

* the safe live operator session did not expose `Grandmix`, `IwaStore`, or `TheSwaf`
* no live membership or auth state was widened just to force benchmark proof

Focused live Creative evidence captured on production:

1. Page-level Creative preview truth contract is visible
   * exact live text:
     * `Preview truth is missing across this review scope.`
     * `0 ready · 0 degraded · 8 missing. Missing preview truth blocks authoritative action until media resolves.`
     * `Ready preview media supports decisive action language. Degraded preview keeps review metrics-only. Missing preview blocks authoritative action.`

2. Operator order / lane vocabulary evidence
   * page-level live quick filter evidence on the available demo dataset only exposed:
     * `BLOCKED`
     * `Preview or deployment truth blocks clean operator action right now.`
   * limitation:
     * the safe live dataset did not expose `Act now`, `Needs truth`, `Keep testing`, and `Protected` as page-level live lanes in the same review scope

3. Degraded/missing preview states visibly soften or block authority
   * exact row-level live evidence:
     * `Preview missing`
     * `Blocked`
     * `Preview truth is missing, so this creative cannot headline an authoritative action yet.`

4. Row-level language is honest when preview truth is missing
   * exact blocker text on the live row:
     * `No renderable preview sources are available for this creative.`

5. Creative detail leads with the preview-truth gate
   * exact live detail text:
     * `Preview Truth Gate`
     * `Preview truth is missing, so authoritative action is blocked.`
     * `Do not treat this row as clean execute-now work until preview media becomes available for the live decision window.`

6. Deterministic decision remains explicit
   * exact live detail text:
     * `Decision + key metrics`
     * `Monitor before committing more budget`
     * `Deterministic engine marks this as a shipped winner that should stay protected.`

7. AI commentary is support-only and does not read like peer authority
   * exact live detail text:
     * `Support only`
     * `AI interpretation stays disabled because preview truth is missing.`

8. Drawer wording reflects support / secondary authority
   * exact live drawer header text:
     * `Decision Support`
     * `Creative Decision Support`
     * `The page worklist stays primary. This drawer is support for live-window decision context only.`

Evidence artifacts captured:

* focused live screenshots
  * `/tmp/adsecute-step7-1776016872015/creatives-page.png`
  * `/tmp/adsecute-step7-1776016872015/creatives-drawer.png`
  * `/tmp/adsecute-step7-1776016872015/creative-detail.png`

## 6. Reviewer Smoke

Live reviewer smoke command:

* `PLAYWRIGHT_BASE_URL='https://adsecute.com' PLAYWRIGHT_USE_WEBSERVER=0 node --env-file=.env.local node_modules/playwright/cli.js test playwright/tests/reviewer-smoke.spec.ts --project=smoke-chromium`

Result:

* reviewer auth setup passed on live
* shared smoke failed before reaching Creative

Exact live failure point:

* test timed out at `120000ms`
* failure location:
  * `playwright/tests/reviewer-smoke.spec.ts:56`
* exact checkpoint:
  * timeout while waiting for `meta-campaign-detail` to become visible after the campaign click

Artifacts:

* screenshot:
  * `test-results/reviewer-smoke-reviewer-sm-76c4a--creative-decision-surfaces-smoke-chromium/test-failed-1.png`
* error context:
  * `test-results/reviewer-smoke-reviewer-sm-76c4a--creative-decision-surfaces-smoke-chromium/error-context.md`
* trace:
  * `test-results/reviewer-smoke-reviewer-sm-76c4a--creative-decision-surfaces-smoke-chromium/trace.zip`

Meaning:

* shared reviewer smoke is still not stable enough to serve as the primary Step 7 proof path
* focused live `/creatives` proof remains the primary Step 7 evidence

## 7. Acceptance Check

1. Deploy first
   * completed
2. Verify live after deploy
   * completed
3. Capture proof
   * completed, but proof quality is limited to the safe demo business
4. Update continuity docs
   * completed

Step 7 verdict:

* `shipped-not-complete`

Why not `accepted`:

* Step 6 is genuinely live
* focused live Creative proof is real
* but the proof is not yet strong enough for `accepted` because:
  * no benchmark-business proof was safely available
  * the available live dataset only exposed the blocked path, not the full five-lane page-level order
  * the shared reviewer smoke still fails in Meta before Creative

## 8. Limitations

* benchmark-business proof was not feasible from the available safe live session
* full five-lane Creative order was not fully observable from the live demo business
* the deploy workflow still treats explainable `live != main` drift as a blocking verification failure
* reviewer smoke still times out in Meta before Creative

## 9. Copy-Paste Summary

Step 7 deployed the Step 6 Creative runtime to production. Before deployment, repo/main was `eeea595f685d852acf82c744fea0a2715d76c7b0`, the Step 6 runtime candidate was `8f0f0b74047c0ce05c8a74b02890e0e104d75484`, and live production was still serving `8eae2d713a78ac7ca500427e0bee05ddf6afa464`. CI rerun published the exact Step 6 images, the automatic deploy skipped because `require_current_main_head=true` no longer matched the docs-only `main` head, and a manual `deploy-hetzner.yml` run then successfully deployed `8f0f0b74047c0ce05c8a74b02890e0e104d75484`. After deploy, `build-info` and `release-authority currentLiveSha` both showed `8f0f0b74047c0ce05c8a74b02890e0e104d75484`, while `release-authority currentMainSha` correctly stayed `eeea595f685d852acf82c744fea0a2715d76c7b0`. Focused live `/creatives` proof confirmed the preview-truth gate, blocked authority language, deterministic decision panel, support-only AI framing, and support-only drawer framing on production. Reviewer smoke still timed out in Meta before Creative, and benchmark-business proof was not safely reachable from the available live operator session, so the honest Step 7 verdict is `shipped-not-complete`.
