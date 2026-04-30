# Canonical Cleanup - 2026-04-30

## Main

- Rollback base restored locally to `96bd0386208868b18d9763d64917ab9d4aa22b53`.
- Final pushed `origin/main` is this cleanup audit commit on top of `96bd038`.
- Owner explicitly accepted that this removes the `cf48e6d` docs-only auto-deploy guard. Future `docs/team-comms/**` pushes may again trigger the CI auto-deploy chain until that guard is reintroduced in a separate, approved change.

## PR #84

- PR: https://github.com/erhanrdn/OmniAds/pull/84
- GitHub state before cleanup: `MERGED`, `mergedAt=2026-04-29T21:07:44Z`.
- Attempted GraphQL deletion failed because GitHub exposes no `deletePullRequest` mutation for this object.
- Posted the required cleanup comment: https://github.com/erhanrdn/OmniAds/pull/84#issuecomment-4348254679
- Result: PR remains merged in GitHub history; removing a merged PR is not available through the GitHub API used here.

## Branches

- `origin/codex/canonical-decision-refactor` verified absent after deletion.

## GHCR Images

- Requested package versions: `omniads-web` and `omniads-worker` for tags `9a365eb`, `ef0d366`, `7f133ba`, `2ee4c6c`, `68f1f0f`, `11f191f`, `cc8c3f1`, `130518a`, `6755e76`, `d47cb12`, and `cf48e6d`.
- Cleanup could not enumerate or delete GHCR package versions with the available GitHub token. GitHub returned `403` on `/users/erhanrdn/packages/container/<package>/versions` with: `You need at least read:packages scope to get a package's versions.`
- Escalation: rerun GHCR cleanup with a token that has `read:packages` and `delete:packages` for the `erhanrdn` user packages. Do not delete `96bd0386208868b18d9763d64917ab9d4aa22b53`.

## Workflow Runs

Deleted 13 matching GitHub Actions runs for canonical-attempt SHAs. The first pass removed `CI` / `Deploy to Hetzner`; the second pass removed matching `Post-Deploy Verification` runs for the same SHA set:

- `25137307269`
- `25137149414`
- `25136838367`
- `25136761620`
- `25136592675`
- `25134151798`
- `25133949582`
- `25131154858`
- `24725047612`
- `24724832974`
- `25137354528`
- `25136898951`
- `24725078126`

Verification query after deletion returned no remaining workflow runs for the listed canonical-attempt SHAs.

## Releases And Tags

- `gh release list` found no releases.
- Git refs under `refs/tags` returned no tags to prune.

## Issues

- Issue search found `#83` (`Remove verdictContract=v0 compatibility flag after Happy Harbor rollout`), which referenced the removed Happy Harbor/verdictContract work.
- 2026-04-30 followup: attempted GraphQL `deleteIssue`, but GitHub returned `FORBIDDEN` (`Viewer not authorized to delete`).
- Closed `#83` as obsolete with the required rollback comment.
- Removed the `happy-harbor` label from `#83` and deleted the repository label because no other issue or PR used it.
- Verified `cleanup` exists and is now only on closed `#83`; left it intact because it is a generic label.
- Final sweep for `canonical`, `verdictContract`, `happy harbor`, and `PR 84` found no other open issue from this work attempt. It found PR #84 and historical unrelated PRs only; those were left untouched.

## Remaining GitHub Artifacts

- Merged PR #84 remains visible because GitHub API deletion is unavailable for it.
- GHCR package versions remain until a token with package scopes is provided.
