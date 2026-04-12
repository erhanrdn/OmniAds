# Operator Rebuild Handoff

## Current Objective

Rebuild the OmniAds operator-facing Meta and Creative surfaces into a clear, operator-first workflow. Current repo/runtime truth remains authoritative over older plans, but implementation must now follow the Step 2 rebuild specification rather than the older Phase 03 / Phase 04 additive UI framing.

## Current Step

Step 3 is complete. Step 3 delivered the first shared operator-facing authority layer. The next step should start from the accepted Step 3 state, not the older Step 2-only contract.

## Current Repo State

* current branch: `main`
* Step 3 implementation SHA: `dd2c5e7d1adbb3eaf42b7483530344ee8a367f41`
* repo SHA at Step 3 rebuild start: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* Step 2 accepted spec commit: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* current live SHA if verified: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8` verified via `https://adsecute.com/api/build-info` and `https://adsecute.com/api/release-authority` on `2026-04-12`
* release-authority posture during Step 3: live/runtime still drifted from remote `main`; production did not advance during this step

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
2. Current live build and browser-observed UI behavior when available
3. Real connected business outputs for benchmark businesses
4. Existing docs and prior plans only when they do not conflict with current truth
5. Step 2 rebuild specification for implementation decisions

## Benchmark Businesses

- `Grandmix`
- `IwaStore`
- `TheSwaf`

## Latest Accepted Findings

- The correct rebuild shape is a major rewrite with selective salvage, not incremental cleanup.
- Meta and Creative both need a new backend-to-UI compression layer that converts internal reasoning into one operator-facing action contract.
- Step 3 implemented the first shared action-authority schema, the first shared summary renderer, and the first Meta + Creative adapter cutover onto that contract.
- Meta top-level UI now leads with one compressed authority surface; Command Center and account-context notes were demoted below it.
- Creative top-level UI now uses the shared authority summary and compressed row copy; the old drawer entry was demoted into `Show why` detail.
- Truth, degraded, readiness, and blocker handling must be shared across Meta and Creative with one visible authority model and one operator vocabulary set.
- Campaign-type and bid-regime logic must become explicit operator wording, especially for cost-cap, bid-cap, lowest-cost / ASC, open / broad, low-signal, profitable-but-constrained, and unstable-learning states.
- Authority, policy, provenance, benchmark, fatigue, queue, and source-health objects are still useful, but only as detail-on-demand or debug layers.

## Open Problems / Blockers

- Production runtime is still on `79ea776...`; the Step 3 repo implementation is ahead of live runtime.
- Creative preview truth remains the primary trust blocker even though the new surface now labels it explicitly.
- Creative drawer detail and Meta selected-campaign detail still expose too much legacy structure after the new top-layer cutover.

## Explicitly Out Of Scope

- Starting Step 4 automatically
- Treating the Step 3 authority layer as the final Meta or final Creative rebuild
- Expanding scope into unrelated channels or execution surfaces unless they directly affect Meta / Creative operator design
- Turning this file into a long historical log

## Next Recommended Step

Default recommendation: Step 4 should build the first full page-specific rebuild on top of the shared authority layer. If GPT review does not find a better ordering, do Meta first, then Creative. The next execution order should be:

1. confirm the Step 3 authority layer is the right foundation
2. rebuild the Meta page IA around the shared authority model
3. remove any now-redundant legacy Meta top surfaces
4. then rebuild the Creative page IA on the same contract with stricter preview/media gating

## Next Chat Bootstrap

Continue the OmniAds Operator Rebuild from Step 4 planning.
Read `docs/operator-rebuild/HANDOFF.md` first.
Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next.
Check `docs/operator-rebuild-staging/STATUS.md` for the latest baseline.
Use current repo/runtime truth over older docs or plans.
Step 3 implementation SHA: `dd2c5e7d1adbb3eaf42b7483530344ee8a367f41`.
Last verified live SHA: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8`.
Benchmark businesses: `Grandmix`, `IwaStore`, `TheSwaf`.
Step 3 is done. Review whether the next page-specific rebuild should start with Meta or Creative; default recommendation is Meta first unless the latest repo truth argues otherwise.
