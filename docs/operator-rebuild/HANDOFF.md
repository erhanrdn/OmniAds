# Operator Rebuild Handoff

## Current Objective

Step 6 is complete in repo. The Creative surface now treats preview/media truth as the visible gating contract for authoritative action, and the default scan path is decision-first instead of diagnostics-first. No new step is active yet. Do not start Step 7 unless the next chat explicitly assigns it.

## Current Step

Step 6, `Creative Preview Truth Gate And Decision-First Review`, implemented on `main` at `8f0f0b74047c0ce05c8a74b02890e0e104d75484`.

What changed:

* Creative top-level framing now leads with a visible preview-truth contract and one operator worklist vocabulary.
* Quick filters now follow the operator scan path: `Act now`, `Needs truth`, `Keep testing`, `Blocked`, `Protected`.
* Row actions, row state pills, and row reasons now soften or block when preview truth is degraded or missing.
* Creative detail now leads with a preview-truth gate, keeps the deterministic decision explicit, and keeps AI commentary support-only when preview truth is not ready.
* The Creative drawer is now explicitly decision support instead of a competing primary authority.
* No Meta product surface was rebuilt in this step. Meta cleanup was intentionally skipped because no removal was clearly low-risk enough to justify reopening Step 5 structure.

## Current Repo State

* current branch: `main`
* repo SHA before Step 6 started: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* Step 6 implementation SHA: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* Step 5 implementation SHA: `14ff6f80288563bdc2d29b563733c262a8201c54`
* Step 5 continuity closeout SHA: `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* actual current repo/local `HEAD` must still be re-verified at the start of the next chat
* `origin/main` matched the Step 6 implementation SHA at closeout: `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

## Current Live / Release Truth

Verified after the Step 6 push on April 12, 2026:

* `https://adsecute.com/api/build-info` returned build id `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* `https://adsecute.com/api/release-authority` returned:
  * `currentLiveSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * `currentMainSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
  * overall posture `aligned`
* local repo and `origin/main` were already on `8f0f0b74047c0ce05c8a74b02890e0e104d75484`

Interpretation:

* repo candidate truth: Step 6 is pushed on `main` at `8f0f0b74047c0ce05c8a74b02890e0e104d75484`
* live-verified truth: production is still serving `8eae2d713a78ac7ca500427e0bee05ddf6afa464`
* release-authority posture: internally `aligned`, but stale versus actual repo/remote `main` because its `currentMainSha` still reports `8eae2d713a78ac7ca500427e0bee05ddf6afa464`

Do not collapse repo truth and live truth into one story.

## Current Working Model

* ChatGPT defines the next step and writes the step prompt
* Codex executes only the assigned step
* Codex reads `docs/operator-rebuild/HANDOFF.md` first, then `docs/operator-rebuild-staging/LATEST_REPORT.md`, then `docs/operator-rebuild-staging/STATUS.md`
* Codex verifies repo HEAD, branch, and live/runtime truth before implementation
* Codex updates `HANDOFF.md`, `LATEST_REPORT.md`, and `STATUS.md`
* `LATEST_REPORT.md` is step-local and replaced each step
* `HANDOFF.md` is durable and should reflect the latest accepted repo-side state plus the last verified live posture

## Continuity Integrity Rule

* A step is not complete until `HANDOFF.md`, `LATEST_REPORT.md`, and `STATUS.md` all reflect the accepted repo result and the last verified live truth
* New Codex chats must re-verify current repo HEAD and live truth even when these docs look fresh
* Repo candidate truth, live build truth, and release-authority truth must stay distinct when they differ

## Current Authority Order

1. Current repo truth and exact local/remote commit state
2. Current live build and release-authority endpoint truth when freshly verified
3. Local build, targeted tests, and focused browser smoke
4. Accepted continuity docs and the underlying phase contracts
5. Older plans only when they do not conflict with the verified repo/live state

## Latest Accepted Findings

* Preview/media truth is now first-class on the Creative page and in Creative detail.
* The top Creative scan path is now action-first and truth-first rather than drawer-first or commentary-first.
* Degraded preview rows no longer read like clean execute-now work.
* AI commentary is now explicitly bounded as support and does not present as a peer decision authority when preview truth is degraded or missing.
* The Creative drawer remains available, but it now reads as decision support instead of the primary decision surface.
* Meta was not regressed in repo because this step did not add or reopen Meta top-level authority layers.

## Open Problems / Blockers

* Production is still on pre-Step-6 SHA `8eae2d713a78ac7ca500427e0bee05ddf6afa464`.
* `release-authority` currently reports `currentMainSha` `8eae2d713a78ac7ca500427e0bee05ddf6afa464`, which is stale relative to actual repo/remote `main` `8f0f0b74047c0ce05c8a74b02890e0e104d75484`.
* Full reviewer smoke is still unstable in the Meta segment before it reaches Creative; Step 6 proof relies on focused `/creatives` browser smoke instead.
* No low-risk Meta reasoning surface was clean enough to remove outright in this step.

## Explicitly Out Of Scope

* Starting Step 7 automatically
* Rebuilding Meta again
* Adding write-back or action queue persistence for Creative
* Inventing new AI-authored decision objects
* Claiming Step 6 is live in production without fresh deployment proof

## Next Recommended Step

No next step is authorized by default. If a later prompt assigns follow-up work, it should begin by reconciling:

1. actual current repo/local `HEAD`
2. actual `origin/main`
3. current live `build-info`
4. current `release-authority` posture

Only after that reconciliation should a Step 7 or release-authority follow-up be scoped.

## Next Chat Bootstrap

Read `docs/operator-rebuild/HANDOFF.md` first. Read `docs/operator-rebuild-staging/LATEST_REPORT.md` next. Read `docs/operator-rebuild-staging/STATUS.md` third. Re-verify `git rev-parse HEAD`, `git branch --show-current`, `git ls-remote origin refs/heads/main`, `https://adsecute.com/api/build-info`, and `https://adsecute.com/api/release-authority` before touching code. Step 6 implementation SHA is `8f0f0b74047c0ce05c8a74b02890e0e104d75484`; last verified live SHA is `8eae2d713a78ac7ca500427e0bee05ddf6afa464`. Do not assume `release-authority currentMainSha` is current until you verify it again.
