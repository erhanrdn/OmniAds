# Operator Rebuild Handoff

## Current Objective

Rebuild the OmniAds operator-facing Meta and Creative surfaces into a clear, operator-first workflow. Current repo/runtime truth remains authoritative over older plans, but implementation must now follow the Step 2 rebuild specification rather than the older Phase 03 / Phase 04 additive UI framing.

## Current Step

Step 3 is now active. Step 2 defined the rebuild specification and product contract for Meta and Creative. Step 3 is the first implementation pass for the shared operator-facing authority layer.

## Current Repo State

* current branch: `main`
* current repo SHA: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* local `main` and `origin/main` both resolve to `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* Step 2 accepted spec commit: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`
* current live SHA if verified: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8` verified via `https://adsecute.com/api/build-info` and `https://adsecute.com/api/release-authority` on `2026-04-12`
* release-authority posture: live/runtime still drifts from remote `main`; release authority reports `79ea776...` live versus `2a43df0...` main

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
- Meta top-level UI must become a unified priority action surface driven by the real action owner, not account-level recommendation emptiness, OS boards, or debug cards.
- Creative top-level UI must become a preview-first operator surface where preview/media truth is a gating contract for authoritative creative action.
- Truth, degraded, readiness, and blocker handling must be shared across Meta and Creative with one visible authority model and one operator vocabulary set.
- Campaign-type and bid-regime logic must become explicit operator wording, especially for cost-cap, bid-cap, lowest-cost / ASC, open / broad, low-signal, profitable-but-constrained, and unstable-learning states.
- Authority, policy, provenance, benchmark, fatigue, queue, and source-health objects are still useful, but only as detail-on-demand or debug layers.

## Open Problems / Blockers

- Production runtime is still on `79ea776...`; the Step 2 spec is ahead of live implementation.
- The current code still exposes authority, policy, queue, and preview internals directly. Step 3 must replace that adapter layer before surface polish will matter.
- Creative preview truth remains unresolved in implementation and is still the critical blocker for trusting the Creative surface.

## Explicitly Out Of Scope

- Starting Step 3 implementation in this step
- Preserving current Meta or Creative page structure for backward-compatibility reasons
- Expanding scope into unrelated channels or execution surfaces unless they directly affect Meta / Creative operator design
- Turning this file into a long historical log

## Next Recommended Step

Step 3 should deliver the shared operator contract first. The next execution order inside this step should be:

1. shared action-authority schema and vocabulary
2. Meta top-layer compression and action-surface reconciliation
3. Creative top-layer compression with preview/media gating on the same authority model
4. detail/debug retention only behind secondary or explicit reasoning surfaces

## Next Chat Bootstrap

Continue the OmniAds Operator Rebuild from Step 3.
Read `docs/operator-rebuild/HANDOFF.md` first.
Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next.
Check `docs/operator-rebuild-staging/STATUS.md` for the latest baseline.
Use current repo/runtime truth over older docs or plans.
Current repo SHA: `2a43df0a37d2a3c16604c97bd10639df7abe9ef1`.
Last verified live SHA: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8`.
Benchmark businesses: `Grandmix`, `IwaStore`, `TheSwaf`.
Step 3 should implement the shared operator authority foundation described in the accepted Step 2 specification and stop after reports, commit, push, and a clean worktree.
