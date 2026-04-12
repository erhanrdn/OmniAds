# Operator Rebuild Handoff

## Current Objective

Step 5 completed the Meta daily operator surface rebuild on top of the Step 2 accepted spec and the shared authority foundation from Steps 3 and 4. The next objective is no longer to keep extending Meta top-level surfaces; it is to carry the same operator-first discipline into Creative preview/media truth and decision-first review without regressing the Meta cutover.

## Current Step

Step 5 is complete on `main`. The Meta daily operator surface implementation landed on `14ff6f80288563bdc2d29b563733c262a8201c54`. Meta now leads with one persistent page-level operator surface, while campaign drilldown, recommendations, operating mode, workflow, and breakdown context are secondary. Live/runtime was last verified on the older SHA `ad3d1ac52fa7c6dec381351c45005342511077ac`. Step 6 has not started.

## Current Repo State

* current branch: `main`
* Step 5 implementation SHA: `14ff6f80288563bdc2d29b563733c262a8201c54`
* repo SHA before Step 5 started: `bbefb3020336c3394bc54024676883c69573cfc4`
* Step 4 implementation SHA: `9bd5d736c13031c14f1bc19bc48142eb6f7dbf8a`
* previous accepted Step 3 live product SHA: `ad3d1ac52fa7c6dec381351c45005342511077ac`
* Step 3 implementation SHA: `dd2c5e79a1cbdad3eaa0c5ae2551cf8228221346`
* Step 2 accepted spec commit: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* current live SHA if verified: `ad3d1ac52fa7c6dec381351c45005342511077ac` verified via `https://adsecute.com/api/build-info` and `https://adsecute.com/api/release-authority` on April 12, 2026
* release-authority posture: Step 5 used live verification for awareness only; live remained on the older accepted baseline while repo work advanced on top of `bbefb3020336c3394bc54024676883c69573cfc4`

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

- Meta now keeps one persistent page-level daily operator surface visible above KPIs and drilldown.
- The campaign list now derives its visible action owner from the shared Meta operator summary instead of recommendation badges plus raw Decision OS chips.
- Capped-regime wording is more explicit in the operator layer: `Review cost cap`, `Review bid cap`, and `Review target ROAS` now replace generic lower-bid phrasing.
- Operating mode, workflow linkage, recommendations context, and breakdown grids are now secondary/collapsed instead of prime page space.
- Selected-campaign reasoning is still available, but it now sits behind explicit expansion instead of leading the detail pane.
- Repo-side Meta UI contract and release-authority notes now describe the new action-first hierarchy instead of the older mixed surface order.

## Open Problems / Blockers

- Creative preview/media truth is still the main cross-surface trust blocker.
- Some capped Meta regimes still stop at `Review ...` instead of a full raise/lower direction.
- Meta `Show why` and selected-campaign reasoning remain denser than the ideal operator detail layer.
- Real-account benchmark walkthrough evidence is still missing.
- Live has not yet been verified on the Step 5 repo candidate.

## Explicitly Out Of Scope

- Starting Step 6 automatically
- Reintroducing multiple competing top-level Meta authorities
- Treating recommendations, workflow, or breakdown context as a peer operator voice again
- Solving Creative preview/media truth plumbing in full during this step
- Turning this file into a long historical log

## Next Recommended Step

Step 6 should shift to Creative preview/media truth and decision-first review:

1. Make preview/media truth the visible gating contract for authoritative creative actions.
2. Keep one operator-facing Creative authority and demote residual diagnostics further if they still compete with the worklist.
3. Re-check whether any remaining Meta legacy reasoning surface can now be removed entirely rather than merely hidden behind expansion.
4. Preserve the release-authority honesty rule: repo candidate truth and live-verified truth must stay distinct.

## Next Chat Bootstrap

Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next. Check `docs/operator-rebuild-staging/STATUS.md` for the latest accepted repo baseline. Re-verify current repo HEAD and current runtime truth before acting. Step 5 implementation SHA is `14ff6f80288563bdc2d29b563733c262a8201c54`. Verified live SHA remains `ad3d1ac52fa7c6dec381351c45005342511077ac` as of April 12, 2026. Step 5 is complete in repo but was not observed live in this step. Do not start Step 6 unless the next chat explicitly assigns it.
