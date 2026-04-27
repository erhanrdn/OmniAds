CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_AND_RELEASE_SAFETY_JUDGE
BRANCH: review/creative-v2-release-hardening-buyer-release-review-2026-04-27
HEAD_COMMIT: SEE_PUSHED_BRANCH_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-release-hardening-buyer-release-review-2026-04-27/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-release-hardening-buyer-release-review-2026-04-27/FOR_CHATGPT_REVIEW.md
TARGET_BRANCH: wip/creative-decision-os-v2-integration-candidate-2026-04-27
TARGET_HEAD_COMMIT: 65389415808947fe64987c0ea7c20595ba59e2e1
TARGET_DRAFT_PR: #82
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
RESOLVER_LOGIC_CHANGED: NO
GOLD_LABELS_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 Release-Hardening Buyer + Release-Safety Review

This review is read-only. It does not change product code, resolver logic,
gold labels, fixtures, v1 behavior, UI behavior, queue/apply behavior,
Command Center wiring, DB write paths, or Meta/platform write paths. PR #82
is not being merged. Main is not being pushed. Queue/apply must remain
disabled. Command Center must remain disconnected. Product-ready remains
NO.

## Scope

Senior Meta media buyer and release-safety judgment review of Codex's
release-hardening sprint on Draft PR #82 at HEAD
`65389415808947fe64987c0ea7c20595ba59e2e1`.

Source artifacts read:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-release-hardening-2026-04-27/FOR_CHATGPT_REVIEW.md`
- `.../NETWORK_NO_WRITE_ENFORCEMENT.md`
- `.../SAFETY_GATE_COMMAND.md`
- `.../SELF_HOSTED_RUNTIME_SMOKE.md`
- `.../DIRECT_ACTIONABILITY_SUBSTITUTE.md`
- `.../DIAGNOSE_VOLUME_FRAMING_AUDIT.md`
- `.../GITHUB_REVIEW_WARNING_AUDIT.md`
- `.../RELEASE_HARDENING_BLOCKERS.md`
- new test file `lib/creative-v2-no-write-enforcement.test.ts`
- new script `scripts/creative-v2-safety-gate.ts`
- new runner `scripts/creative-v2-self-hosted-smoke.ts`
- CI workflow change in `.github/workflows/ci.yml`
- prior buyer reviews on the v2 cycle

## Infrastructure framing

- Active site runtime: self-hosted server.
- Active database runtime: self-hosted PostgreSQL.
- Vercel queued/skipped checks and Neon-specific wording are deprecated
  infrastructure and not active blockers.
- GitHub/Codex review warnings, hidden/bidi UI warnings, unsafe copy,
  queue/apply risk, write-safety risk, formatting/readability issues,
  and buyer UX issues remain active blockers if present.

## What Codex actually shipped (independently verified)

- New static no-write enforcement test
  `lib/creative-v2-no-write-enforcement.test.ts` covering route,
  client, model, component, and page boundaries. Includes a transitive
  GET side-effect scanner subprocess against
  `scripts/check-request-path-side-effects.ts` so indirect DB/Meta
  calls via shared utilities are caught, not only direct imports.
- New focused safety-gate command `npm run creative:v2:safety` backed
  by `scripts/creative-v2-safety-gate.ts`. Runs 9 focused vitest files
  and then evaluates the v2 gold artifact in-process, failing on
  macroF1 < 90, severe ≠ 0, high ≠ 0, watchPrimaryCount ≠ 0,
  scaleReviewPrimaryCount ≠ 0, queueEligibleCount ≠ 0,
  applyEligibleCount ≠ 0, directScaleCount ≠ 0,
  inactiveDirectScaleCount ≠ 0.
- CI wiring: `.github/workflows/ci.yml` adds
  `Creative v2 safety gate` as a pull-request test step that runs
  `npm run creative:v2:safety` after `npm run test`. No deploy
  behavior, no Vercel/Neon assumptions, no secrets.
- New manual runtime smoke runner
  `scripts/creative-v2-self-hosted-smoke.ts` (Playwright chromium
  headless) that the merge owner can run against their authenticated
  self-hosted environment. Validates off-by-default gate, with-flag
  surface, lane test-IDs, Scale-ready copy, forbidden action terms,
  forbidden internal artifact terms, and zero POST/PUT/PATCH/DELETE
  requests during no-flag, with-flag, and detail-open phases. Output
  is sanitized: path-only requests, no domains, no IDs, no cookies,
  no tokens.
- Strengthened deterministic direct-actionability substitute tests in
  `lib/creative-decision-os-v2-preview.test.tsx` proving review-only
  Scale and high-spend Cut rank above direct Protect/Test More, that
  direct rows go to Ready for Buyer Confirmation by default and only
  to Today Priority when urgency qualifies, and that Diagnose stays
  out of Buyer Confirmation.
- Diagnose volume / framing audit explicitly recommends UI framing
  only and refuses to silently tune resolver thresholds. 193/303 rows
  remain in Diagnose, broken into four classes
  (insufficient-signal 96, data-quality 51, inactive_creative 45,
  campaign-context 1).
- GitHub review/warning audit: connector evidence shows 0/0/0 across
  PR #78/#79/#80/#81/#82. PR #81 body updated through the GitHub
  connector to mark it superseded by Draft PR #82 for canonical WIP
  integration.
- Release-hardening blockers split honestly into PR #82 → PR #78
  blockers, main-merge blockers, and product-ready blockers, with the
  fresh authenticated self-hosted runtime smoke explicitly recorded
  as open because Codex did not have authenticated browser state and
  did not ask for prohibited secrets.

## Independently verified state at TARGET_HEAD_COMMIT

- Integration branch HEAD:
  `65389415808947fe64987c0ea7c20595ba59e2e1`. Draft.
- 18 files changed in the hardening commit `6538941`, +1327 lines.
- New tests cover route, client, model, component, page, and
  transitive scanner boundaries. Verified by reading the test file.
- Component still has only the row-card `<button>` wired to
  `onOpenRow` (no new interactive controls).
- CI workflow runs `npm run creative:v2:safety` after `npm run test`
  on pull requests. Verified in `.github/workflows/ci.yml`.
- Gold eval safety counters reported by the gate: macroF1 97.96,
  severe 0, high 0, queueEligibleCount 0, applyEligibleCount 0,
  directScaleCount 0, inactiveDirectScaleCount 0,
  watchPrimaryCount 0, scaleReviewPrimaryCount 0.

## Buyer + release-safety judgment on the 16 questions

### 1. Did network-level no-write enforcement meaningfully improve release safety?

Yes, substantially.

The new test file is much more comprehensive than the prior
component-level read-only invariant test. It now asserts:

- Preview route exports GET only; no POST/PUT/PATCH/DELETE handler.
- Route has no `command-center`, `execution/apply`, or `work-item`
  references; no `enqueue`, `upsert`, `insert`, `update`, `delete`,
  or `applyCommandCenter` calls; no `@/lib/meta`, `MetaApi`, or
  `facebook` imports.
- Transitive GET side-effect scanner reports zero findings for the
  preview route. This catches indirect DB/Meta calls through shared
  utilities, not just direct imports.
- Preview model + component combined have no DB / Meta / Command
  Center imports, no `fetch(`, no `sql\``, no INSERT/UPDATE/DELETE,
  no enqueue/upsert/insert/delete/applyCommandCenter calls.
- Page-level `openCreativeDrawer` callback only calls
  `setCreativeDrawerState` and `scrollIntoView` — no `fetch(`, no
  `runCreativeDecisionOsAnalysis`, no `mutate(`, no `command-center`.
- V2 surface usage in `page.tsx` routes `onOpenRow` only to
  `openCreativeDrawer`, with no `runCreativeDecisionOsAnalysis`,
  `CommandCenter`, `queue`, or `apply` references in that scope.
- Client preview fetch path is GET-only, uses no body, uses
  `cache: "no-store"`, has no method other than GET.

This is now a meaningful static gate. Combined with the manual
runtime runner for the fresh authenticated smoke, the no-write story
is materially stronger than at any prior cycle.

### 2. Does the new safety gate command cover all required items?

Yes. Verified by reading `scripts/creative-v2-safety-gate.ts` and the
9 focused test files it runs:

- Forbidden rendered button/text scan: covered by
  `lib/creative-decision-os-v2-preview.test.tsx`.
- Forbidden internal artifact scan: covered by the same.
- PR #79 v0.1.1 contract parity: covered by the same.
- Preview off-by-default: covered by
  `app/(dashboard)/creatives/page.test.tsx` and
  `app/api/creatives/decision-os-v2/preview/route.test.ts`.
- Queue/apply disabled: enforced both by the no-write enforcement
  test and the gold-counter assertions
  (queueEligibleCount = 0, applyEligibleCount = 0).
- Watch primary ban: enforced by gold-counter assertion
  (watchPrimaryCount = 0).
- Scale Review primary ban: enforced by gold-counter assertion
  (scaleReviewPrimaryCount = 0).
- No-write tests: enforced by
  `lib/creative-v2-no-write-enforcement.test.ts`,
  `lib/get-route-side-effect-guard.test.ts`,
  `src/services/data-service-ai.test.ts`.

The gate also asserts macroF1 ≥ 90, severe = 0, and high = 0 from the
gold eval. Comprehensive.

### 3. Is CI wired, or honestly manual-only?

Wired. Verified in `.github/workflows/ci.yml`: a new
`Creative v2 safety gate` step runs `npm run creative:v2:safety` on
pull requests after the existing `Test` step. No deploy behavior,
no Vercel/Neon assumptions, no secrets.

This closes the M6 (CI wiring) gate that was open across the prior
several cycles. The gate is no longer manual-only; a failing
forbidden-term, contract-parity, no-write, or gold-counter check now
fails the merge gate automatically in CI.

### 4. Is the self-hosted runtime smoke completed or honestly still open?

Honestly still open. Codex did not run it themselves because they did
not have authenticated browser state and did not ask for forbidden
secrets/domain/session details. They added a runnable Playwright
script the merge owner can execute in their authenticated
environment.

Right call. Recording it as open is the honest position. The runner
itself is a meaningful asset because it lets the owner close the gate
when they choose, with sanitized path-only output and no domain/
credential leakage.

### 5. Is the direct-actionability substitute strong enough for WIP / limited preview?

Yes. The deterministic ordering test now covers all the relevant
ordering invariants including:

- review-only Scale above direct Protect/Test More.
- high-spend Cut above direct Protect/Test More.
- Direct rows in Ready for Buyer Confirmation by default.
- Direct rows in Today Priority only when urgency qualifies.
- Diagnose stays out of Buyer Confirmation.
- Empty-state Buyer Confirmation copy is safe.

For WIP / limited preview this is enough.

### 6. Does it remain insufficient for product-ready unless live evidence or ChatGPT waiver exists?

Yes, and Codex correctly says so:
"Product-ready blocker remains open unless ChatGPT later accepts this
substitute or a self-hosted workspace renders direct rows."

This is the right discipline. Substitute evidence is sufficient for
WIP but not for product-ready.

### 7. Is Diagnose volume/framing handled as product framing rather than silent resolver tuning?

Yes. The audit explicitly says "No resolver threshold changed in
this pass" and recommends:

- Keep Diagnose collapsed by default.
- Keep Diagnose visually separate from Buyer Confirmation.
- Show class counts before row detail.
- Keep row-level detail read-only.
- Do not mix Diagnose rows into confirmation/action lanes.
- In future product work, add filters for class and spend band.

This is the right discipline. The 193/303 volume is not a buyer
defect that justifies silent resolver tuning; it is a buyer-framing
question that should remain a product-ready review item.

### 8. Did the update preserve resolver decision quality?

Yes. Gold eval macroF1 97.96 with 0 severe / 0 high mismatches.
Queue/apply/direct-Scale safety counters all zero. Identical to prior
cycles. The hardening pass added no resolver code change.

### 9. Did the read-only UI preview remain safe?

Yes. No UI code changed in this hardening pass. Component still has
only the row-card `onOpenRow` button. Forbidden-term and internal-
artifact scans pass. No new affordances introduced. Read-only
invariants are now enforced by both the prior component-level test
and the new file-level no-write enforcement test.

### 10. Is v1 still default?

Yes. Page-level test continues to assert v1 is rendered without the
preview flag. v1 behavior is unchanged.

### 11. Is v2 preview still off by default?

Yes. Off-by-default test continues to assert this. The
`page.test.tsx` test in the no-write enforcement coverage list
re-confirms it.

### 12. Are queue/apply and Command Center still disconnected?

Yes. Multiple layers now enforce this:

- Gold eval: queueEligibleCount = 0, applyEligibleCount = 0.
- No-write enforcement test asserts route, client, model, component,
  and page all lack `command-center`, `execution/apply`, `work-item`,
  `queue`, `apply` references.
- Component-level read-only invariant test still passes.

The disconnection is now multi-layered.

### 13. Are hidden/bidi exceptions properly scoped and not overclaimed?

Yes. The exception scope is unchanged from the prior cycle: PR #78-
branch WIP consideration only. Not main-merge clearance. Not product-
ready clearance. The hardening pass introduced no new
hidden/bidi/control codepoints.

### 14. Are remaining blockers correctly listed?

Yes. The blocker split is consistent with my prior reviews:

- PR #82 → PR #78 merge: only the fresh authenticated self-hosted
  runtime smoke and owner adjudication remain. Owner-side
  authenticated GitHub UI warnings are noted as open if visible to
  the owner; public connector evidence is zero across all PRs.
- Main merge: product-ready, hidden/bidi clearance for main scope,
  fresh runtime smoke on final branch, network-level runtime no-write
  capture in authenticated browser, final release-owner approval.
- Product-ready: third full operator session, workspace-rendered
  direct-actionability or accepted substitute, network-level no-write
  in authenticated runtime, Diagnose volume/framing review, Buyer
  Confirmation lane workspace validation, final blind buyer review,
  vertical-balance polish for empty-confirmation + many-Buyer-Review
  layout.

The "closed in this hardening pass" table is accurate: repeatable
safety command (closed locally), CI wiring (closed in branch,
pending GitHub CI run after push), deterministic no-write tests
(closed locally), deterministic direct-actionability substitute
(strengthened, live still open), PR #81 supersession marker
(closed).

### 15. Should ChatGPT allow PR #82 to remain canonical WIP?

Yes. The hardening pass strengthened the artifact across multiple
dimensions: static no-write enforcement, real CI gate, manual
runtime smoke runner, strengthened ordering tests, honest blocker
split. Future v2 hardening should land on PR #82.

### 16. Should ChatGPT allow PR #82 to be considered for merge into PR #78 branch, or does more hardening remain first?

PR #82 is now ready for human merge consideration into the PR #78
stacked dependency Draft branch. The remaining work to close the
M3-extension fresh-runtime gate is now a clear single owner action
(running `npm run creative:v2:self-hosted-smoke` against their
authenticated environment).

The buyer's recommendation is: the merge owner may proceed to
adjudicate the merge if they (a) run the manual pre-merge command
set including the new safety gate, (b) optionally run the new
self-hosted smoke runner and confirm zero forbidden terms and zero
mutation requests in their authenticated environment, and
(c) explicitly acknowledge the documented hidden/bidi exception
scope (PR #78-branch only, not main, not product-ready). PR #82
must stay Draft after the merge.

If the merge owner chooses not to run the smoke runner, they may
still proceed under the documented exception, accepting the static
no-write enforcement evidence + the prior supervisor-assisted
natural-language validation as substitute. The buyer recommends
running the runner as the cleanest closure path.

## Verdict

- **Verdict:**
  **PR82_READY_FOR_PR78_BRANCH_MERGE_CONSIDERATION**.

  The hardening sprint substantially strengthened release-safety
  infrastructure: real CI gate, comprehensive static no-write
  enforcement across all relevant boundaries, manual runtime smoke
  runner, strengthened deterministic ordering tests, honest blocker
  split, and Diagnose volume framed as product question rather than
  silent resolver tuning. The artifact is now at the level where the
  merge owner can responsibly adjudicate the documented hidden/bidi
  exception and proceed with merge consideration into the PR #78
  branch.

- **Product-ready:** NO.
- **Merge-ready to main:** NO. Multiple gates remain (full main-
  scope hidden/bidi clearance, fresh runtime smoke on final branch,
  authenticated runtime no-write capture, final release-owner
  approval).
- **Queue/apply safe:** NO. Queue/apply must remain disabled and
  Command Center must remain disconnected.
- **Buyer confidence score:** 90/100 (up from 87).

  Score rationale:
  - +30 safety (no unsafe copy, no write paths, v1 default
    preserved, off-by-default gate, queue/apply disabled, Command
    Center disconnected, multi-layer no-write enforcement).
  - +20 first-glance clarity (Scale-ready, lane separation,
    empirically endorsed by supervisor; pending third full operator
    session).
  - +12 Cut/Refresh clarity.
  - +12 surface contract discipline (forbidden-term scans, contract
    parity, sanitization, deterministic ordering test, lane-marker
    rendering test, Watch/Scale-Review primary bans, hard CI gate).
  - +5 Scale clarity.
  - +3 Diagnose action clarity (aggregate no-op gone; lane
    separation visually distinct; framing audit refuses silent
    tuning).
  - +5 audit honesty (every closure honestly tagged with scope and
    caveats; no silent ignoring; manual vs CI gate distinction;
    supervisor-assisted vs mechanical DOM distinction; new runner
    available for fresh runtime smoke).
  - +3 supervisor lane-separation endorsement.
  - 0 third *full* supervised operator session (still pending; for
    product-ready).
  - 0 workspace-rendered direct-actionability evidence (still
    pending; for product-ready).
  - Net: 90.

- **Release-safety confidence score:** 95/100.

  Score rationale (delta from prior cycle):
  - +5 real CI gate now exists (M6 closed). The forbidden-term and
    contract-parity scan now blocks merge automatically, not only
    as a manual command.
  - +3 comprehensive static no-write enforcement across route,
    client, model, component, page, and transitive scanner. This is
    a meaningful step beyond the component-level read-only
    invariant.
  - +2 manual runtime smoke runner is in place with sanitized
    output, lowering the cost of the M3 extension closure to a
    single owner command.
  - +1 strengthened ordering tests reduce the gap to product-ready
    direct-actionability evidence.
  - 0 fresh authenticated runtime smoke not yet run (owner action;
    runner ready).
  - 0 authenticated GraphQL review-thread inspection not run (owner
    action; connector evidence zero).
  - 0 main-scope hidden/bidi clearance not addressed (intentionally
    out of scope).
  - 0 final release-owner approval pending (intentionally out of
    scope).
  - Net: 95. Release-safety story is now strong for the WIP scope.
    Remaining 5 points reflect the still-open owner-side actions.

- **Remaining blockers:**

  Pre-merge for human consideration into the PR #78 stacked
  dependency Draft branch (via Draft PR #82):
  1. Owner runs `npm run creative:v2:safety` and verifies pass.
  2. Owner optionally runs
     `npm run creative:v2:self-hosted-smoke` against their
     authenticated environment to close the M3-extension fresh
     runtime smoke. If skipped, owner accepts the static no-write
     enforcement + prior supervisor-assisted natural-language
     validation as substitute.
  3. Owner explicitly acknowledges in writing the documented
     hidden/bidi exception scope (PR #78-branch only, not main,
     not product-ready).

  Pre-merge to main (additional, unchanged):
  - Full main-scope hidden/bidi clearance.
  - Fresh authenticated runtime smoke on the final branch.
  - Authenticated GraphQL review-thread inspection across PR
    #78/#79/#80/#81/#82.
  - Final release-owner approval.

  Product-ready (unchanged from prior reviews; substitute
  strengthened by this pass but live evidence still required):
  - P1: Third *full* supervised operator session re-asking the
    five-second baseline question.
  - P2: Workspace-rendered direct-actionability evidence, or an
    explicit product-ready decision substituting the deterministic
    ordering test plus the third operator session.
  - P3: Diagnose volume reviewed; either narrower resolver
    definition or surface framing as triage backlog. Audit in this
    pass recommends framing only.
  - P4: Network-level no-write enforcement in authenticated runtime
    (this pass added the static + manual runner; authenticated
    runtime capture still required).
  - P5: Continued CI wiring as the canonical hard merge gate (this
    pass closed the wiring; main-merge will require the gate to
    have run green on the final branch).
  - P6: Buyer confirmation lane behavior validated on a workspace
    that contains direct rows.
  - P7 (cosmetic): Vertical-balance polish for the
    Confirmation-empty + Buyer-Review-many-cards layout.

- **Recommended next step:**

  Allow Draft PR #82 to remain canonical WIP and progress to merge
  consideration into the PR #78 stacked dependency Draft branch.

  The merge owner should:

  1. Run `npm run creative:v2:safety` on their machine and verify
     the safety counters match the recorded values
     (macroF1 ≈ 97.96, all zero counters).
  2. Optionally run
     `npm run creative:v2:self-hosted-smoke` against their
     authenticated self-hosted environment with
     `CREATIVE_V2_SMOKE_BASE_URL` set locally and not committed,
     and verify the runner reports zero forbidden terms and zero
     mutation requests.
  3. Confirm the hidden/bidi exception scope in writing (PR #78-
     branch only, not main, not product-ready).
  4. Merge PR #82 into the PR #78 branch. Keep PR #82 Draft after
     the merge. Keep PR #81 open as superseded for audit/history.

  In parallel, drive the product-ready / main-merge work track on
  small focused commits onto the integration branch:

  - Schedule a third *full* supervised operator session re-asking
    the five-second baseline question on the post-hardening surface.
  - Run the authenticated runtime smoke under capture in production-
    equivalent conditions for main-merge evidence.
  - Address the cosmetic vertical-balance layout note before the
    next supervised session.

  Do not request merge to main. Do not enable queue/apply. Do not
  push to main. Do not claim product-ready.

## Confirmations

- This review changed no product code, resolver logic, gold labels,
  fixtures, v1 behavior, UI behavior, queue/apply behavior, Command
  Center wiring, DB write paths, or Meta/platform write paths.
- This review did not merge, did not push to main, did not enable
  queue/apply, did not wire Command Center, and did not introduce
  any write behavior.
- This review does not claim PR #82 is approved, accepted,
  product-ready, or merge-ready to main.
- This review does not unilaterally execute a merge. The merge owner
  must run their own due-diligence gate and acknowledge the
  documented exception.
- Limited read-only preview may continue on the integration branch
  as supervised evidence gathering only.
- All artifacts cited use sanitized row aliases.
- Active runtime validation refers to the self-hosted server and
  self-hosted PostgreSQL database only.
