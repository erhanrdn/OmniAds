# Operator Rebuild Handoff

## Current Objective

Rebuild the OmniAds operator-facing Meta and Creative surfaces into a clear, operator-first workflow. Current repo/runtime truth is authoritative. The accepted Step 2 rebuild specification remains the governing design contract, and accepted Step 3 now defines the shared authority foundation that later page rebuild work must build on.

## Current Step

Continuity is repaired to accepted Step 3 truth. Step 3 is complete, live-aligned, and documented. Step 4 has not started.

## Current Repo State

* current branch: `main`
* current repo HEAD / accepted Step 3 closure SHA: `ad3d1ac52fa7c6dec381351c45005342511077ac`
* Step 3 implementation SHA: `dd2c5e79a1cbdad3eaa0c5ae2551cf8228221346`
* Step 2 accepted spec commit: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* current live SHA if verified: `ad3d1ac52fa7c6dec381351c45005342511077ac` verified via `https://adsecute.com/api/build-info` and `https://adsecute.com/api/release-authority` on April 12, 2026
* release-authority posture: live/runtime and remote `main` are aligned; accepted Step 3 is the current live baseline

## Current Working Model

* ChatGPT defines the next step and writes the step prompt
* Codex executes the step in a new chat
* Codex reads `docs/operator-rebuild/HANDOFF.md` first, then `docs/operator-rebuild-staging/LATEST_REPORT.md`, then verifies current repo/live truth
* Codex updates `docs/operator-rebuild/HANDOFF.md`, `docs/operator-rebuild-staging/LATEST_REPORT.md`, and `docs/operator-rebuild-staging/STATUS.md`
* `LATEST_REPORT.md` is temporary and replaced each step
* `HANDOFF.md` is durable and must reflect the latest accepted state
* User reports completion back in chat
* ChatGPT reads the latest repo state and defines the next step

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

- Step 3 shipped one shared operator authority contract across Meta and Creative.
- Meta now leads with one compressed authority summary; Command Center and account-context notes are supporting context rather than competing headline voices.
- Creative now uses the shared authority summary and compressed row wording at the top layer; deeper Decision OS reasoning is secondary and detail-on-demand.
- Truth-capped profitable states and preview/readiness caps are first-class operator states.
- Thin-signal and no-materiality rows no longer headline default action surfaces.
- Creative `Decision Signals` / legacy segmentation and `Creative Decision OS` should not survive as separate operator-facing authorities. Step 4 must collapse remaining Creative operator authority into one model.
- Quick filters such as `TEST MORE` and `PAUSE` are still useful, but later work should re-derive them from the unified Creative action model rather than preserve them as an independent legacy authority surface.

## Open Problems / Blockers

- Creative drawer/detail still exposes too much legacy Decision OS structure after the Step 3 top-layer cutover.
- Meta selected-campaign detail still mixes older supporting surfaces after the new top-level authority cutover.
- Preview/media truth remains the primary Creative trust blocker.
- Real-account benchmark walkthrough evidence is still missing for Step 3.

## Explicitly Out Of Scope

- Starting Step 4 automatically
- Reintroducing multiple competing operator authorities
- Preserving `Creative Decision Signals` / legacy segmentation as a separate top-level authority
- Treating quick filters as a separate source of truth instead of a projection from the unified Creative authority model
- Turning this file into a long historical log

## Next Recommended Step

Step 4 should be a page-specific rebuild, not another authority proliferation step. Default recommendation:

1. Rebuild the Meta page information architecture around the shared authority contract first.
2. Remove any remaining Meta top-level legacy authority surfaces that still compete with the shared summary.
3. Then rebuild the Creative page so one Creative authority owns the top layer and drawer/detail only support it.
4. Re-derive quick filters such as `TEST MORE` and `PAUSE` from the unified Creative action model rather than preserve them as legacy segmentation.

If current repo/runtime truth later shows a better ordering, GPT can choose Creative first, but the no-competing-authorities rule should hold either way.

## Next Chat Bootstrap

Do not start Step 4 automatically. Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next. Check `docs/operator-rebuild-staging/STATUS.md` for the current baseline. Verify current repo/runtime truth before acting. Accepted Step 3 closure SHA: `ad3d1ac52fa7c6dec381351c45005342511077ac`. Step 3 implementation SHA: `dd2c5e79a1cbdad3eaa0c5ae2551cf8228221346`. Benchmark businesses: `Grandmix`, `IwaStore`, `TheSwaf`. Step 3 is done and continuity is repaired. Only start Step 4 if the next chat explicitly assigns it.
