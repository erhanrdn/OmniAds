# Operator Rebuild Handoff

## Current Objective

Rebuild the OmniAds operator-facing Meta and Creative surfaces into a clear, operator-first workflow. Current repo/runtime truth is authoritative. The accepted Step 2 rebuild specification remains the governing design contract. Step 3 established the shared authority foundation. Step 4 now completes the first real Creative page unification pass on top of that foundation.

## Current Step

Step 4 is complete in repo on implementation SHA `9bd5d736c13031c14f1bc19bc48142eb6f7dbf8a`. Creative now has one operator-facing authority in repo, with quick filters derived from the unified Creative Decision OS action model. Live/runtime still serves the accepted Step 3 baseline on `ad3d1ac52fa7c6dec381351c45005342511077ac`. Step 5 has not started.

## Current Repo State

* current branch: `main`
* Step 4 implementation SHA: `9bd5d736c13031c14f1bc19bc48142eb6f7dbf8a`
* repo SHA before Step 4 started: `3a9144d95d41c29298902989bd9824a963189ca0`
* previous accepted Step 3 live product SHA: `ad3d1ac52fa7c6dec381351c45005342511077ac`
* Step 3 implementation SHA: `dd2c5e79a1cbdad3eaa0c5ae2551cf8228221346`
* Step 2 accepted spec commit: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* current live SHA if verified: `ad3d1ac52fa7c6dec381351c45005342511077ac` verified via `https://adsecute.com/api/build-info` and `https://adsecute.com/api/release-authority` on April 12, 2026
* release-authority posture: live/runtime still serves the Step 3 baseline; repo `main` now carries the Step 4 Creative unification candidate and updated authority docs, so live-vs-main drift remains expected until deploy advances

## Current Working Model

* ChatGPT defines the next step and writes the step prompt
* Codex executes the step in a new chat
* Codex reads `docs/operator-rebuild/HANDOFF.md` first, then `docs/operator-rebuild-staging/LATEST_REPORT.md`, then verifies current repo/live truth
* Codex updates `docs/operator-rebuild/HANDOFF.md`, `docs/operator-rebuild-staging/LATEST_REPORT.md`, and `docs/operator-rebuild-staging/STATUS.md`
* `LATEST_REPORT.md` is temporary and replaced each step
* `HANDOFF.md` is durable and must reflect the latest accepted state
* User reports completion back in chat
* ChatGPT reads the latest repo state and defines the next step

## Continuity Integrity Rule

* A step is not complete until `HANDOFF.md`, `LATEST_REPORT.md`, and `STATUS.md` all reflect the latest accepted state
* New Codex chats must read handoff first, then latest report, then verify repo/live truth
* Temporary report content is replaced each step
* Durable accepted continuity stays in `HANDOFF.md`

## Step Lifecycle

1. New Codex chat starts
2. Handoff and latest report are read first
3. Current repo/live truth is verified
4. Only the current step is executed
5. Reports are updated
6. Changes are committed and pushed
7. Worktree ends clean
8. Next step is not started automatically

## Current Authority Order

1. Current repo, runtime, and DB truth
2. Current live build, release-authority, and browser-observed UI behavior when available
3. Real connected business outputs for benchmark businesses
4. Accepted rebuild continuity docs and the Step 2 rebuild specification
5. Older plans only when they do not conflict with current truth

## Benchmark Businesses

- `Grandmix`
- `IwaStore`
- `TheSwaf`

## Latest Accepted Findings

- Step 4 removed the standalone top-level Creative `Decision Signals` operator strip from the table flow.
- Creative now exposes one operator-facing authority: the shared Creative authority summary backed by Creative Decision OS.
- Quick filters now come from one unified mapping over Creative Decision OS states: `SCALE`, `TEST MORE`, `PAUSE`, `NEEDS TRUTH`, `BLOCKED`, and `NO ACTION`.
- The preview strip/grid and the table now respond to the same page-level quick-filter state, so counts and filtered rows stay coherent.
- The drawer now uses the same quick-filter model instead of a separate queue vocabulary.
- Release-authority docs and repo inventory now treat `Decision Signals` as legacy compatibility rather than a live peer operator surface.

## Open Problems / Blockers

- Preview/media truth remains the primary Creative trust blocker.
- Creative detail and drawer surfaces are still denser than the top layer.
- Meta selected-campaign detail still mixes older supporting surfaces after the Step 3 authority cutover.
- Real-account benchmark walkthrough evidence is still missing for Step 4.
- Live has not yet advanced to the Step 4 repo candidate.

## Explicitly Out Of Scope

- Starting Step 5 automatically
- Reintroducing multiple competing operator authorities on Creative
- Treating quick filters as a separate decision system instead of a projection from Creative Decision OS
- Solving preview/media truth plumbing in full during this step
- Turning this file into a long historical log

## Next Recommended Step

Step 5 should rebuild the Meta page information architecture around the shared authority contract:

1. Remove any remaining Meta top-level surfaces that still compete with the shared summary.
2. Keep Command Center and account-context panels secondary to one Meta action authority.
3. Re-check whether Creative detail density still warrants a follow-up cleanup after the Meta rebuild.
4. Continue to treat preview/media truth as a trust dependency, not as a reason to reintroduce duplicate Creative authorities.

## Next Chat Bootstrap

Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next. Check `docs/operator-rebuild-staging/STATUS.md` for the latest accepted repo baseline. Verify current repo/runtime truth before acting. Step 4 implementation SHA is `9bd5d736c13031c14f1bc19bc48142eb6f7dbf8a`. Verified live SHA remains `ad3d1ac52fa7c6dec381351c45005342511077ac` as of April 12, 2026. Step 4 is complete in repo but not yet observed live. Do not start Step 5 unless the next chat explicitly assigns it.
