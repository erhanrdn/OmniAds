# GitHub Review Warning Audit

CHATGPT_REVIEW_READY: YES
SANITIZED: YES

# PR State

| PR | State | Draft | Base | Head |
| --- | --- | --- | --- | --- |
| #78 | open | true | `main` | `wip/creative-decision-os-v2-baseline-first-2026-04-26` |
| #79 | open | true | `main` | `review/creative-v2-operator-surface-contract-2026-04-26` |
| #80 | open | true | `main` | `review/creative-v2-buyer-surface-requirements-2026-04-26` |
| #81 | open | true | `wip/creative-decision-os-v2-baseline-first-2026-04-26` | `wip/creative-v2-readonly-ui-preview-2026-04-26` |
| #82 | open | true | `wip/creative-decision-os-v2-baseline-first-2026-04-26` | `wip/creative-decision-os-v2-integration-candidate-2026-04-27` |

# Public Review/Comment Counts

Final evidence source: GitHub connector normalized reads.

| PR | Review submissions | Review threads | Combined comments |
| --- | ---: | ---: | ---: |
| #78 | 0 | 0 | 0 |
| #79 | 0 | 0 | 0 |
| #80 | 0 | 0 | 0 |
| #81 | 0 | 0 | 0 |
| #82 | 0 | 0 | 0 |

# PR #81 Supersession

PR #81 body was updated through the GitHub connector:

`Superseded by Draft PR #82 as the canonical WIP integration candidate.`

PR #81 remains open and Draft for audit/history. Its branch was not deleted.

# Auth Limitation

Local `gh` is not authenticated. Codex did not ask for a token or run
`gh auth login`.

An unauthenticated public API attempt was partially rate-limited after PR #79,
so Codex used the GitHub connector for final review/thread/comment state:

- `_list_pull_request_reviews`: zero review submissions for PR #78 through #82.
- `_list_pull_request_review_threads`: zero review threads for PR #78 through
  #82.
- `_fetch_pr_comments`: zero combined comments for PR #78 through #82.

If authenticated GitHub UI shows unresolved private threads or warnings that
are not visible in the connector evidence above, those remain owner-side gates.

# Hidden/Bidi Scope

The existing hidden/bidi exception remains scoped to WIP PR #78-branch
consideration only. It is not main-merge clearance and not product-ready
clearance.

No new hidden/bidi/control codepoints were introduced in this hardening pass.
