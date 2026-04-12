# Operator Rebuild Handoff

## Current Objective

Rebuild the OmniAds operator-facing Meta and Creative surfaces into a clear, operator-first workflow. Future work must follow current repo/runtime/DB truth and real business behavior over older plans or docs.

## Current Step

Step 1 is the teardown phase. It is complete. This step produced a hard evidence-based teardown of the current Meta and Creative operator surfaces and did not start redesign or implementation work.

## Current Repo State

* current branch: `main`
* current HEAD SHA: `bc97463dbd7276029232aa80b4ca92c6ce4b9b18`
* current live SHA if verified: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8` verified via `https://adsecute.com/api/build-info` on `2026-04-12`

## Current Authority Order

1. Current repo, runtime, and DB truth
2. Current live build and browser-observed UI behavior when available
3. Real connected business outputs for benchmark businesses
4. Existing docs and prior plans only when they do not conflict with current truth

## Benchmark Businesses

- `Grandmix`
- `IwaStore`
- `TheSwaf`

## Latest Accepted Findings

- Meta is overloaded with backend reasoning leakage and does not convert internal decision logic into a clean operator action model.
- Creative is worse than Meta because preview/media truth is inconsistent with the decision layer and the operator often cannot confidently inspect the asset being judged.
- The top-level Meta recommendation surface is structurally wrong because account-level recommendations can be empty while campaign and ad set decisions still exist.
- Opportunity and queue framing is misleading. Sampled real businesses had no queue-ready promotion work and no meaningful top-level Meta opportunity intake.
- Campaign-type and bid-regime logic exists internally, but the surfaced action language is too generic to guide a buyer through budget vs cap vs structure sequencing.
- Authority, readiness, degraded, policy, provenance, and diagnostic layers are being rendered too directly and should move behind on-demand detail.
- The core problem is both presentation and backend-to-UI contract, with the contract problem slightly deeper.
- Step 1 temporary report: `docs/operator-rebuild-staging/LATEST_REPORT.md`

## Open Problems / Blockers

- Real benchmark businesses were inspected through current runtime/API/DB outputs, but they were not directly browsed in the UI during this step.
- The creative preview/media truth contract is unresolved and is a blocker for trusting the Creative operator surface.
- The live product SHA is still behind the latest doc-only Step 1 reporting commit.

## Explicitly Out Of Scope

- Starting Step 2 implementation
- Redesigning or rebuilding Meta or Creative in this step
- Turning this file into a long historical log
- Creating permanent historical docs beyond the compact continuity layer unless explicitly requested

## Next Recommended Step

Step 2 should convert the accepted Step 1 teardown into a rebuild plan and target product contract. That step should define the operator-first information architecture, the compressed backend-to-UI action contract, the regime-specific Meta action model, and the preview/media truth requirements for Creative before any UI implementation starts.

## Next Chat Bootstrap

Continue the OmniAds Operator Rebuild from Step 1.
Read `docs/operator-rebuild/HANDOFF.md` first.
The full Step 1 teardown is in `docs/operator-rebuild-staging/LATEST_REPORT.md`.
Use current repo/runtime/DB truth over older docs or plans.
Benchmark businesses: `Grandmix`, `IwaStore`, `TheSwaf`.
Latest Step 1 report baseline SHA: `bc97463dbd7276029232aa80b4ca92c6ce4b9b18`.
Last verified live SHA: `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8`.
Next step is Step 2 planning only: define the rebuild structure and action contract.
Do not start implementation until the Step 2 planning artifact is written.
