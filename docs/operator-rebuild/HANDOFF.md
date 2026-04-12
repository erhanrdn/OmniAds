# Operator Rebuild Handoff

## Current Objective

Rebuild the OmniAds operator-facing Meta and Creative surfaces into a clear, operator-first workflow. Current repo/runtime truth remains authoritative over older plans, but implementation must now follow the Step 2 rebuild specification rather than the older Phase 03 / Phase 04 additive UI framing.

## Current Step

Step 2 is complete. This step defined the rebuild specification and product contract for Meta and Creative. It did not start implementation.

## Current Repo State

* current branch: `main`
* repo baseline SHA used for Step 2: `4d27ad800513bacd0f756a9bdb874ebee0dad4da`
* current live SHA if verified: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8` verified via `https://adsecute.com/api/build-info` and `https://adsecute.com/api/release-authority` on `2026-04-12`
* release-authority posture during Step 2: live/runtime still drifted from remote `main`, but the drift is continuity-doc-only above the live product baseline

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

Step 3 should implement the shared operator contract first, then rebuild the Meta surface on top of it, then rebuild Creative with preview/media gating on the same authority model. The order should be:

1. shared action-authority schema and vocabulary
2. Meta compression layer and page rebuild
3. Creative compression layer with preview gating and page rebuild
4. detail/debug reintroduction only after the primary operator flow is clean

## Next Chat Bootstrap

Continue the OmniAds Operator Rebuild from Step 2.
Read `docs/operator-rebuild/HANDOFF.md` first.
Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next.
Check `docs/operator-rebuild-staging/STATUS.md` for the latest baseline.
Use current repo/runtime truth over older docs or plans.
Repo baseline used for Step 2: `4d27ad800513bacd0f756a9bdb874ebee0dad4da`.
Last verified live SHA: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8`.
Benchmark businesses: `Grandmix`, `IwaStore`, `TheSwaf`.
Step 3 should implement the shared operator contract and Meta-first rebuild described in the Step 2 specification.
