CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_JUDGE
BRANCH: review/creative-v2-ui-iteration-buyer-review-2026-04-27
HEAD_COMMIT: SEE_PUSHED_BRANCH_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-ui-iteration-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-ui-iteration-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
TARGET_PR: #81
TARGET_BRANCH: wip/creative-v2-readonly-ui-preview-2026-04-26
TARGET_HEAD_COMMIT: 54d62bddcb04bc50c86395441b77d854a42ba9f1
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
RESOLVER_LOGIC_CHANGED: NO
GOLD_LABELS_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 UI Iteration Buyer Review

This review is read-only. It does not change product code, resolver logic, gold
labels, fixtures, v1 behavior, UI behavior, queue/apply behavior, Command
Center wiring, DB write paths, or Meta/platform write paths. PR #81 is not
being merged. Main is not being pushed. Queue/apply must remain disabled and
Command Center must remain disconnected.

## Scope

Senior Meta media buyer judgment review of Codex's UI iteration on PR #81
following the completed supervised operator session.

Source artifacts read on `origin/wip/creative-v2-readonly-ui-preview-2026-04-26`
at HEAD `54d62bddcb04bc50c86395441b77d854a42ba9f1`:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/PR_REVIEW_CLEANUP_AUDIT.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-limited-operator-preview-session-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-limited-operator-preview-session-2026-04-26/SESSION_OBSERVATIONS.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-limited-operator-preview-session-2026-04-26/OPERATOR_SESSION_CHECKLIST.md`
- prior buyer review on `review/creative-v2-completed-operator-session-buyer-review-2026-04-27`
- diff of commit `54d62bd fix: clarify creative v2 readonly preview UX`
- relevant excerpts of `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`
- relevant excerpts of `lib/creative-decision-os-v2-preview.test.tsx`
- relevant excerpts of `app/(dashboard)/creatives/page.test.tsx`

## Infrastructure framing

- Active site runtime: self-hosted server.
- Active database runtime: self-hosted PostgreSQL.
- Vercel queued/skipped checks and Neon-specific wording are deprecated
  infrastructure and are not active blockers in this judgment.
- GitHub/Codex review warnings, hidden/bidi UI warnings, unsafe copy, queue/
  apply risk, write-safety risk, formatting/readability issues, and buyer UX
  issues remain active blockers if present.

## What Codex actually changed (independently verified from the diff)

- Above-the-fold scale label changed from `Scale-worthy` to `Scale-ready`.
- New `detail` field added to the scale summary metric:
  - When `scaleWorthyCount === 0`:
    "No scale-ready creative cleared the evidence bar yet. Promising
    creatives may still appear under Protect, Test More, or Today Priority
    until recent evidence is strong enough."
  - When `scaleWorthyCount > 0`:
    "Only creatives that clear the stricter evidence bar count as
    scale-ready."
- Diagnose lane subtitle changed from
  "Collapsed by default and grouped by blocker or problem class."
  to
  "Needs investigation before buyer action. This is not buyer confirmation."
- Diagnose per-problem-class aggregate `<button>` (the no-op observed by the
  operator) was removed. It is now a non-clickable `<div>` reading
  "Needs investigation before buyer action".
- `Ready for Buyer Confirmation` lane is rendered whenever the bucket exists,
  with explicit empty-state copy:
  "No direct confirmation candidates in this workspace."
- Lane subtitle is sharpened from a confidence note to:
  "Separate from Diagnose. These rows have enough evidence for buyer
  confirmation but still make no live changes."
- `Investigate` is removed from the documented allowed-controls list and the
  Diagnose aggregate no longer renders it.
- Tests added/updated:
  - Deterministic ordering test asserts review-only Scale and high-spend Cut
    rank above direct Protect/Test More: `today_priority` rowIds order is
    `["high-spend-cut", "review-scale"]` and `ready_for_buyer_confirmation`
    rowIds are `["direct-test-more", "direct-protect"]`.
  - Strict scale-ready empty-state copy test (no `Scale-worthy`, presence of
    new explanation).
  - Diagnose-vs-confirmation separation test (presence of empty-state and
    "Needs investigation before buyer action. This is not buyer confirmation."
    plus a regex assertion that there is no `<button>...Investigate</button>`).
  - Read-only component invariant test asserts the component has no
    `@/lib/db`, `@/lib/meta`, `command-center`, `fetch(`, `sql\``, `INSERT`,
    `UPDATE`, or `DELETE` references.
  - Page-level test asserts the v2 preview is off by default and only
    enables with `?creativeDecisionOsV2Preview=1`.

## Independent verification cross-checks

- Component scan for remaining clickable `<button>`s in
  `CreativeDecisionOsV2PreviewSurface.tsx`: only one remains, the row card
  button wired to `onOpenRow(row.rowId)`. Its label is dynamic via
  `actionButtonLabel(row)`, returning one of `View diagnosis`, `See blocker`,
  `Compare evidence`, or `Open detail`. None of these are write language and
  none claims to do anything beyond opening the existing detail experience.
- The aggregate Diagnose `Investigate` no-op control is no longer present in
  the rendered HTML, consistent with both the diff and the new HTML-level
  test assertion.
- Resolver logic, gold labels, and v2 contract were not modified by this
  iteration. The 1-of-303 Scale count from the prior fixture remains; the
  iteration intentionally chose to explain the strict count rather than
  loosen it.
- The session ordering claim (review-only Scale and high-spend Cut above
  direct Protect/Test More) now has a deterministic component-level test, not
  only fixture sort tests.

## Known limitation Codex documented

Codex did not complete authenticated DOM validation of the iterated UI on the
self-hosted runtime. The local automation session did not have an
authenticated browser state, `/api/auth/demo-login` redirected to login
without returning a local credential, and macOS Computer Use access returned
an Apple Events permission error. This is an honest gap and must be closed
before any merge-readiness claim. It is not a reason to pause the limited
preview, but the supervisor's authenticated browser must repeat the
self-hosted runtime check before merge.

## Buyer judgment on the 11 questions

### 1. Is the `Scale-worthy` / `Scale-ready` confusion likely fixed?

Likely yes, pending second supervised operator session.

The rename + the explicit strict-state explanation directly targets the
operator's recorded confusion. The new copy explains *why* a buyer's
personal sense of "this looks promising" can coexist with `Scale-ready = 0`,
which is the correct senior-buyer mental model. The empirical confirmation
must come from a second supervised session, but the code-level change is the
right shape.

### 2. Is the new scale empty-state explanation buyer-clear?

Yes. It uses buyer-natural language: "evidence bar", "promising creatives",
"recent evidence is strong enough", and points the operator to the lanes
where promising-but-not-yet-scale-ready creatives may appear (Protect, Test
More, Today Priority). It does not use internal terminology and it does not
oversell. A senior buyer reading this will understand that Scale-ready is a
strict gate, not a sentiment.

### 3. Does the UI now avoid fake Scale while still explaining promising-but-not-scale-ready creatives?

Yes. The resolver was not loosened (still 1 of 303 in the fixture). The
strict-state copy explains the gap. The above-the-fold metric still says
exactly what the resolver counted, and the explanation prevents a buyer
from chasing creatives that have not cleared the evidence bar. This is the
correct trade-off for a senior buyer panel: be honest about strictness and
trust the buyer to read.

### 4. Is Diagnose now honestly presented as "needs investigation before buyer action"?

Yes. The lane subtitle now reads: "Needs investigation before buyer action.
This is not buyer confirmation." The aggregate no-op affordance is gone. A
senior buyer cannot reasonably mistake Diagnose for a confirmation queue
after this iteration.

### 5. Is removing the clickable no-op `Investigate` acceptable, or should a read-only detail panel be required before merge?

Removing the *aggregate* no-op is the right call for this iteration. It is
acceptable for limited preview and acceptable for merge-readiness on the
*aggregate* control specifically.

Important nuance: the row-level path is *not* a no-op. Each Diagnose row
still renders an `Open detail` / `View diagnosis` button wired to the
existing `onOpenRow` callback (the v1 detail experience). That preserves a
read-only investigation path per row. The operator's complaint was about
the aggregate group control claiming to be interactive while doing nothing,
which is the one that was removed. So buyers retain a working investigation
path; what they no longer have is a misleading aggregate button.

If the team eventually wants an aggregate-level investigation surface, it
must be a real read-only context view with tests asserting zero DB and zero
Meta writes. Until then, removing the affordance is preferable to faking
it.

### 6. Is `Ready for Buyer Confirmation` now clearly separate from Diagnose?

Yes. It is a separate `<section>` with its own header, its own subtitle that
explicitly says "Separate from Diagnose", and an explicit empty state when
the bucket has no rows. The new HTML test asserts both labels appear and
the regex assertion confirms no aggregate Investigate button exists in the
Diagnose lane. A buyer can no longer reasonably collapse the two into one
mental model.

### 7. Does the page still answer the 5-second buyer questions?

Likely yes, with the empirical confirmation pending a second supervised
session. The above-the-fold metrics still surface Bleeding spend,
Scale-ready, Fatiguing on budget, Leave alone, and Needs diagnosis at the
top. Today Priority still routes high-spend Cut and review-only Scale rows
to the front, now with a deterministic test backing the ordering claim.
Scale-ready and Diagnose are now honest about what they are. The page is
materially more buyer-honest than the version the first operator saw.

### 8. Is limited read-only preview still safe to continue?

Yes. No write paths were added. Forbidden-term scans still pass on rendered
output. v2 remains off by default behind the query-param gate. v1 remains
default. The component-level read-only invariant test now actively prevents
DB, Meta, Command Center, fetch, or SQL wiring from being introduced into
the preview component. No queue/apply, no Command Center, no work-item
flow.

The one residual safety note: the prior cleanup audit recorded a `npm test`
/ `vitest` clean-checkout pathing issue that was resolved with an untracked
local symlink. That symlink is documented as removed before commit, but the
underlying pathing fragility was not fixed. This is a reproducibility risk,
not a write-safety risk, but it should be tracked.

### 9. Is a second supervised operator session required after this UI iteration?

Yes. The first session recorded three specific UX issues; this iteration
claims to fix all three. The only honest way to confirm is a second
supervised session in which the same operator (or a comparable senior
buyer) reads the new `Scale-ready` empty-state copy, the Diagnose subtitle,
and the explicit `Ready for Buyer Confirmation` empty state, and reports
whether the prior confusions are gone. Code-level evidence is necessary but
not sufficient; the buyer judgment on first-glance reading must be
re-collected.

The second session can run in parallel with the still-open
post-iteration self-hosted runtime check.

### 10. What remains blocking before merge-readiness?

Pre-merge blockers (must be fixed or explicitly closed with evidence):

- M1. PR #81 GitHub files-view hidden/bidirectional Unicode warning banners
  must be driven to zero or explicitly closed with documented evidence.
- M2. PR #79 / #81 conversation-page historical hidden/bidi warnings must
  be explicitly closed with evidence (commit SHA + scan output).
- M3. Self-hosted authenticated runtime validation must be repeated with
  the supervisor's already-authenticated browser session against the
  self-hosted server and self-hosted PostgreSQL DB. Codex documented this
  honestly as still open after the UI iteration.
- M4. The `npm test` / `vitest` clean-checkout repeatability issue must be
  fixed so future reviewers can rerun the gate without a bespoke local
  symlink.
- M5. All open Codex/GitHub PR review threads on #78, #79, #80, #81 must
  be zero or explicitly resolved with evidence at the time of merge.
- M6. The contract parity scan (`Auto-*`, `Push live`, `Push to review
  queue`, plus the standard forbidden set) must remain a hard merge gate.
  This iteration kept the scans active in tests, but it must be wired so
  any failure blocks merge.
- M7. The aggregate Diagnose `Investigate` no-op must not return as a
  no-op. If a future iteration wants an aggregate Investigate, it must
  open a real read-only context view with zero-write assertions in tests.

### 11. What remains blocking before product-ready?

Product-ready blockers (in addition to all merge blockers above):

- P1. Second supervised operator session must confirm `Scale-ready` empty
  state and Diagnose vs buyer confirmation separation are now buyer-clear,
  with first-glance clarity materially above the prior 85 percent and
  zero blocking buyer hesitations on Scale, Diagnose, or buyer
  confirmation meaning.
- P2. Direct-actionability evidence: the new deterministic ordering test
  is materially stronger than fixture-only sort tests, but a workspace-
  rendered direct-actionability row would still be the strongest
  product-ready evidence. If no such row appears in production data, the
  deterministic test plus the second operator session can stand in, but
  this should be an explicit product-ready decision, not an implicit one.
- P3. Diagnose volume (193 of 303 rows in the prior fixture) is still
  large even when collapsed. Either the resolver narrows what qualifies as
  Diagnose, or the surface explicitly frames Diagnose as a triage backlog
  rather than the primary buyer panel.
- P4. Write-safety enforced by automated tests on the v2 preview endpoint
  and detail/open interactions, not only by manual observation. The new
  component-level read-only invariant test is a good first layer; a
  network-level no-write test for the preview endpoint and detail/open
  interactions should follow.
- P5. The post-iteration self-hosted authenticated runtime validation
  (M3) must be completed and recorded.
- P6. The optional but recommended stronger evidence for buyer
  confirmation lane behavior on a workspace that actually contains direct
  rows (rather than an empty state) should be produced before product-
  ready, even if only via fixture-driven preview validation.

## Verdict

- **Verdict:** **SECOND_OPERATOR_SESSION_REQUIRED**.

  Limited read-only preview can continue while the second operator session
  is being scheduled. The UI iteration is well-targeted at the recorded
  buyer issues, and the code-level evidence (rename, strict-state copy,
  removed no-op, separate empty state, deterministic ordering test,
  component read-only invariant test) is the right shape. Empirical buyer
  confirmation, a self-hosted authenticated runtime check, and the
  remaining merge gates are still required.

- **Product-ready:** NO.
- **Merge-ready:** NO.
- **Queue/apply safe:** NO. Queue/apply must remain disabled and Command
  Center must remain disconnected. Nothing in this iteration changes that.
- **Buyer confidence score:** 80/100 (up from 72).

  Score rationale:
  - +30 safety (no unsafe copy, no write paths, v1 default preserved,
    inactive rows clean, off-by-default gate, new component read-only
    invariant test).
  - +20 first-glance clarity (Scale-ready rename plus strict-state copy
    targets the recorded operator confusion; pending empirical
    confirmation).
  - +12 Cut/Refresh clarity (still positive).
  - +10 surface contract discipline (forbidden-term scans, contract
    parity, sanitization, deterministic ordering test).
  - +5 Scale clarity (rename + empty-state copy directly addresses the
    operator's confusion; resolver not loosened; no fake Scale).
  - +3 Diagnose action clarity (aggregate no-op removed; row-level View
    diagnosis still works; lane copy now honest).
  - 0 post-iteration self-hosted authenticated runtime validation (still
    pending, honestly documented).
  - 0 second supervised operator session (still pending).
  - Net: 80.

- **UX issues fixed (pending empirical confirmation):**
  1. `Scale-worthy = 0` confusion: addressed by `Scale-ready` rename and
     strict-state explanation.
  2. Diagnose aggregate `Investigate` no-op: removed; replaced with
     non-clickable status copy.
  3. Diagnose vs buyer confirmation separation: addressed via separate
     lane, sharpened subtitles, and explicit empty-state copy.

- **Remaining UX issues:**
  1. Empirical confirmation that the operator no longer reads
     `Scale-ready = 0` as a contradiction is still required.
  2. Diagnose volume relative to the rest of the surface remains large;
     even with honest framing, the surface's center of mass is still in
     a triage lane rather than in actionable buyer work.
  3. Workspace-rendered direct-actionability evidence is still absent;
     the new deterministic test improves this but does not replace
     production buyer evidence.

- **Pre-merge blockers:** M1-M7 above.

- **Product-ready blockers:** P1-P6 above (in addition to all merge
  blockers).

- **Recommended next step:**

  Schedule a second supervised operator session against the self-hosted
  site and self-hosted PostgreSQL DB. The same operator should be asked
  the same 5-second buyer questions, with explicit attention to Scale-
  ready empty-state copy, the Diagnose subtitle, and the separate Ready
  for Buyer Confirmation lane. In parallel, the supervisor should
  complete the post-iteration authenticated DOM validation that Codex
  could not complete in this pass. Do not request merge. Do not enable
  queue/apply. Do not push to main. Re-run this senior buyer review
  against the second-session evidence before any merge or product-ready
  claim.

## Confirmations

- This review changed no product code, resolver logic, gold labels,
  fixtures, v1 behavior, UI behavior, queue/apply behavior, Command Center
  wiring, DB write paths, or Meta/platform write paths.
- This review did not merge, did not push to main, did not enable queue/
  apply, did not wire Command Center, and did not introduce any write
  behavior.
- This review does not claim PR #81 is approved, accepted, product-ready,
  or merge-ready.
- Limited read-only preview may continue as supervised evidence gathering
  only.
- All artifacts cited use sanitized row aliases.
- Active runtime validation refers to the self-hosted server and self-
  hosted PostgreSQL database only.
