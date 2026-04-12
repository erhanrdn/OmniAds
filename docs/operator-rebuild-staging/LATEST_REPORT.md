# Step 6 — Creative Preview Truth Gate And Decision-First Review

## 1. Executive Summary

* Step 6 made preview/media truth the visible gating contract for Creative action instead of leaving it as background metadata.
* The Creative page now leads with one operator-first decision order: `Act now`, `Needs truth`, `Keep testing`, `Blocked`, `Protected`.
* Preview truth now changes action honesty at page level, row level, detail level, and drawer-support level.
* AI commentary remains available only as bounded support and no longer reads like peer authority when preview truth is degraded or missing.
* No Meta product surface was removed in this step because no remaining reasoning layer looked low-risk enough to delete without reopening Step 5 architecture.
* Repo implementation is pushed on `main`, but production is still verified on the previous Step 5 SHA.

## 2. Truth Reconciliation

Read order used before implementation:

1. `docs/operator-rebuild/HANDOFF.md`
2. `docs/operator-rebuild-staging/LATEST_REPORT.md`
3. `docs/operator-rebuild-staging/STATUS.md`

Verified repo truth at step start:

* branch: `main`
* repo start SHA: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* repo start summary: `docs: finalize step 5 continuity`

Continuity drift found before implementation:

* continuity docs still treated `release-authority` as if `currentLiveSha/currentMainSha` were `9addb96bedfbaf5067584418c1c3e139543f92fd`
* current verification at step start no longer matched that older story
* continuity was repaired before product changes started

Verified live/runtime truth after the Step 6 push on April 12, 2026:

* `https://adsecute.com/api/build-info`
  * build id `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* `https://adsecute.com/api/release-authority`
  * `currentLiveSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * `currentMainSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * overall posture `aligned`
* actual repo/local `HEAD` after Step 6 product changes
  * `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* actual `origin/main`
  * `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

Repo-vs-live posture at closeout:

* repo candidate truth: Step 6 is pushed on `main` at `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* live-verified truth: production is still serving `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* release-authority posture: internally `aligned`, but stale about `currentMainSha` because it still reports `8eae2d713a78ac7ca500427e0bee05ddf6afa464` while actual remote `main` is `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

Do not collapse repo candidate truth and live-verified truth.

## 3. Scope Delivered

What changed in Creative hierarchy:

* the top Creative surface now opens with a dedicated `Preview Truth Contract`
* quick filters moved under that contract instead of competing with the header controls
* operator authority order now consistently reads:
  * `Act now`
  * `Needs truth`
  * `Keep testing`
  * `Blocked`
  * `Protected`
* the drawer header now explicitly frames itself as `Decision Support`

What changed in preview/media truth visibility:

* page-level ready/degraded/missing counts and summary headline now sit above the worklist
* selected-preview strip now shows a scoped preview-truth summary instead of treating preview state as incidental
* row-level action chips now switch to `Preview degraded` or `Preview missing` when preview truth cannot support decisive wording
* row authority pills now use the same vocabulary as the top operator buckets
* detail view now leads with a `Preview Truth Gate` card that states whether action is ready, softened, or blocked
* drawer overview now includes preview-truth summary support and no longer duplicates page-level quick filters

What diagnostics were demoted or removed:

* Creative drawer framing is now explicitly secondary support
* drawer-level duplicate quick filters were removed
* AI commentary in detail is explicitly marked `Support only`
* degraded/missing preview truth now disables or softens AI instead of letting it sound authoritative
* row-level secondary labels now lead with preview truth instead of burying it after other tags

What changed in row-level action honesty:

* `promote_to_scaling` no longer renders as `Promote now` when preview truth is degraded or missing
* degraded preview rows render `Preview degraded` and `Blocked`
* missing preview rows render `Preview missing` and `Blocked`
* truth-capped rows route into `Needs truth` instead of reading like clean queue-ready work

What changed in detail/drawer discipline:

* deterministic decision stays visible and explicit
* preview truth and deployment compatibility read as gating inputs
* AI commentary is bounded support, not peer authority
* the `Decision support` path remains available, but the page worklist stays primary

Meta cleanup:

* no Meta product file was changed
* no Meta surface was fully removed in this step
* this was intentional to avoid reopening Step 5 architecture without a clearly safe deletion

## 4. Implementation Notes

Key repo files changed:

* `lib/creative-operator-surface.ts`
* `lib/operator-surface.ts`
* `components/operator/OperatorSurfaceSummary.tsx`
* `components/creatives/CreativesTopSection.tsx`
* `components/creatives/CreativesTableSection.tsx`
* `components/creatives/CreativeDecisionOsOverview.tsx`
* `components/creatives/CreativeDecisionOsDrawer.tsx`
* `components/creatives/CreativeDetailExperience.tsx`
* `app/(dashboard)/creatives/page.tsx`
* `components/creatives/CreativesTableSection.test.tsx`
* `components/creatives/CreativeDetailExperience.test.tsx`
* `playwright/tests/reviewer-smoke.spec.ts`

Shared truth-model reuse:

* existing Creative Decision OS preview status
* existing authority-state mapping
* existing deployment compatibility fields
* existing preview strip and preview helper infrastructure
* existing deterministic Decision OS objects

No new shadow decision system was introduced.

## 5. Acceptance Check

1. Preview/media truth is visibly first-class
   * accepted in repo
2. Decision-first review is clearer
   * accepted in repo
3. One Creative operator authority remains
   * accepted in repo
4. Blocked/degraded rows are honest
   * accepted in repo
5. Meta is not regressed
   * accepted in repo
6. Continuity is fully current
   * accepted for repo-side continuity at closeout, with explicit live/runtime limits recorded

Phase closure verdict:

* `shipped-not-complete`

Why not `accepted`:

* repo implementation, tests, build, and focused `/creatives` browser smoke all passed
* production is still verified on pre-Step-6 SHA `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* full reviewer smoke remains unstable in the Meta segment before it reaches the Creative path

## 6. Test Evidence

Exact commands run:

* `npx tsc --noEmit`
  * passed
* `npx vitest run lib/creative-operator-surface.test.ts lib/creative-decision-os.test.ts components/creatives/CreativesTableSection.test.tsx components/creatives/CreativeDetailExperience.test.tsx components/creatives/CreativeDecisionOsOverview.test.tsx components/creatives/CreativeDecisionOsDrawer.test.ts components/creatives/creatives-top-section-support.test.ts app/(dashboard)/creatives/page-support.test.ts lib/meta/__tests__/creatives-preview.test.ts app/api/meta/creatives/route.test.ts app/api/meta/creatives/history/route.test.ts app/api/meta/creatives/detail/route.test.ts app/api/creatives/decision-os/route.test.ts app/api/ai/creatives/commentary/route.test.ts app/api/ai/creatives/decisions/route.test.ts`
  * passed
  * `15` test files passed
  * `65` tests passed
* `npm run build`
  * passed

Focused browser/local smoke:

* local production-build browser smoke for `/creatives`
  * started local smoke server from built output
  * opened `/creatives` with reviewer auth
  * verified:
    * `creative-preview-truth-contract`
    * `creative-quick-filters-panel`
    * `Decision support` entry point
    * `creative-decision-os-drawer`
    * `creative-preview-truth-summary`
    * row open -> `creative-detail-preview-truth`
    * `creative-detail-deterministic-decision`
    * `creative-detail-ai-commentary`
  * result: passed

Reviewer smoke status:

* updated `playwright/tests/reviewer-smoke.spec.ts` for:
  * Creative button rename `Show why` -> `Decision support`
  * Creative preview-truth surface assertions
  * Creative detail preview-truth assertion
* local reviewer smoke run:
  * failed before the Creative segment completed
  * failure remained in the Meta segment during campaign-detail expansion
  * exact limitation: reviewer smoke is not primary proof for Step 6 because Meta smoke instability still blocks the shared end-to-end script

`/platforms/meta` smoke:

* not required for Step 6 because Meta product code was not changed

## 7. Deployment / Rollout

* repo start SHA: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* exact implementation SHA: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* current repo HEAD after product changes: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* current live SHA if verified: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* repo candidate vs live posture:
  * repo/origin main are ahead on Step 6
  * live build-info and release-authority still point to Step 5 closeout SHA
  * release-authority `currentMainSha` is stale relative to actual `origin/main`

## 8. Limitations

* no live deployment proof for Step 6
* no Meta browser smoke required or claimed for Step 6 product behavior
* full reviewer smoke still unstable in Meta before the Creative segment finishes
* no Meta surface was deleted in this step

## 9. Copy-Paste Summary

Step 6 is implemented and pushed on `main` at `8f0f0b74047c0ce05c8a74b02890e0e104d75484`. Creative now leads with a visible preview-truth contract, one operator decision vocabulary, honest degraded/missing preview states, and support-only AI framing when preview truth is not ready. Typecheck, the targeted 15-file Vitest subset, build, and focused local `/creatives` browser smoke all passed. Production is still verified on `8eae2d713a78ac7ca500427e0bee05ddf6afa464`, and `release-authority` is currently stale about `currentMainSha`, so repo candidate truth and live truth must stay separate in the next chat.
