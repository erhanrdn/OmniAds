CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_JUDGE
BRANCH: review/creative-v2-merge-exception-adjudication-buyer-review-2026-04-27
HEAD_COMMIT: SEE_PUSHED_BRANCH_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-merge-exception-adjudication-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-merge-exception-adjudication-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
TARGET_PR: #81
TARGET_BRANCH: wip/creative-v2-readonly-ui-preview-2026-04-26
TARGET_HEAD_COMMIT: 41a9d8030de6ef770f64088a98225791cdd5e51b
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
RESOLVER_LOGIC_CHANGED: NO
GOLD_LABELS_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 PR #81 Hidden/Bidi Adjudication Buyer Review

This review is read-only. It does not change product code, resolver logic,
gold labels, fixtures, v1 behavior, UI behavior, queue/apply behavior,
Command Center wiring, DB write paths, or Meta/platform write paths. PR #81
is not being merged. Main is not being pushed. Queue/apply must remain
disabled and Command Center must remain disconnected. Product-ready
remains NO.

## Scope

ChatGPT's pointed adjudication question after the active-source formatting
correction landed:

- Active TS/TSX/test files normally formatted and readable: confirmed.
- `app/(dashboard)/creatives/page.test.tsx`: 297 lines (independently
  verified).
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`: 624 lines
  (independently verified).
- Hidden/bidi UI banner persists on three active diff sections after
  formatting; raw scans report zero codepoints; one banner cleared between
  `cb9eb9b` and `0ab332e`; Codex honestly keeps M1/M2 closure open.

The narrow question this review answers: should ChatGPT (a) accept the
hidden/bidi warning as a documented exception for human merge consideration
into the PR #78 stacked dependency Draft branch, (b) require one more Codex
investigation, or (c) keep PR #81 Draft-only?

This review does not duplicate the prior cycle's full analysis. It builds
on the prior review at branch
`review/creative-v2-active-source-format-buyer-review-2026-04-27` (HEAD
`e83ff8e9b03eeec3cccce6c787979527d2db1c8a`) and changes only the
adjudication recommendation in light of ChatGPT's framing.

## Infrastructure framing

- Active site runtime: self-hosted server.
- Active database runtime: self-hosted PostgreSQL.
- Vercel queued/skipped checks and Neon-specific wording are deprecated
  infrastructure and not active blockers.
- GitHub/Codex review warnings, hidden/bidi UI warnings, unsafe copy,
  queue/apply risk, write-safety risk, formatting/readability issues, and
  buyer UX issues remain active blockers if present.

## Independently verified state at TARGET_HEAD_COMMIT

- PR #81 head: `41a9d8030de6ef770f64088a98225791cdd5e51b`.
- PR #81 remains Draft.
- `app/(dashboard)/creatives/page.test.tsx`: 297 lines.
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`: 624 lines.
- Component still has only the row-card `<button>` wired to `onOpenRow`.
  No DB / Meta / Command Center / fetch / SQL references introduced.
- Read-only invariant test continues to pass.
- Forbidden rendered-term and internal-artifact scans pass.
- v1 default preserved. v2 still off by default behind the query-param
  gate.
- GitHub files-HTML banner section list at this HEAD: three files —
  `app/(dashboard)/creatives/page.test.tsx`,
  `app/(dashboard)/creatives/page.tsx`,
  `app/api/creatives/decision-os-v2/preview/route.test.ts`.
- `app/api/creatives/decision-os-v2/preview/route.ts` previously flagged
  at HEAD `cb9eb9b` is no longer listed at HEAD `0ab332e` / `41a9d80`.
- Public raw blob, `.diff`, and `.patch` scans across PR #81 files report
  zero hidden/bidi/control codepoints.
- Strict non-ASCII added/removed-line diff scan passes.

## Buyer judgment on the 6 questions

### 1. Are active TS/TSX/test files now normally formatted and readable?

Yes. Independently verified file metrics confirm normal multi-line code
with reasonable max line lengths across all eight files Codex touched in
the broader formatting pass.

### 2. Is `app/(dashboard)/creatives/page.test.tsx` no longer a single-line active blob?

Yes. 297 lines, max line length 99 at this HEAD. The previously dense
single-line vi.mock factories have been split across multiple readable
lines. By any reasonable definition this is normal multi-line test code.

### 3. Is `CreativeDecisionOsV2PreviewSurface.tsx` now readable enough for this stage?

Yes. 624 lines, max line length 111. Shared className constants extracted,
long inline class strings broken across multiple lines via `cn(...)`. This
is normal Tailwind/Next.js TSX formatting. Functional behavior is
unchanged. The component-level read-only invariant test passes.

### 4. Is the remaining hidden/bidi warning a real active-code blocker, or a GitHub diff-view/template false-positive?

Strong likelihood: GitHub diff-view / heuristic / template false-positive.

Evidence in favor of false-positive:

- Four independent scan surfaces (local files, public raw active blobs,
  public PR `.diff`, public PR `.patch`) all report zero
  hidden/bidi/control codepoints across all PR #81 files. A real hidden
  codepoint would be expected to register in at least one of these.
- Strict non-ASCII added/removed-line diff scan passes.
- Visible non-ASCII characters in the surrounding code/text are normal
  Turkish UI/report letters, not bidi control codepoints.
- **Demonstrable banner movement after formatting**: the route.ts banner
  was present at HEAD `cb9eb9b` and gone at HEAD `0ab332e`. A real
  hidden codepoint in a file's content would not be cleared by a
  whitespace/line-break-only reformat. A heuristic responding to file
  shape / diff context would respond to that change.
- The new file-hygiene compression-prevention test guards against
  regression of the file shape that triggered the heuristic.

Evidence against:

- Three banners persist after extensive formatting work, on three
  documented files.
- No exact post-formatting line/codepoint trigger has been identified.

On balance: the weight of evidence has shifted firmly toward a UI
heuristic / template artifact rather than a real active-code blocker.
This is not a unilateral buyer determination — it is a calibrated read
that should still go through owner-level adjudication before any merge.

### 5. Is Codex correct to keep merge-ready = NO?

Yes. Their stance is the right one for an automated pipeline:

- Do not silently re-introduce the prior false-positive exception.
- Document the persistent banner state honestly.
- Require owner-visible per-line evidence, banner-clear after recheck,
  or owner-level adjudication before any merge.

That is the correct discipline for a system that previously over-claimed
closure. The merge-ready = NO stance protects the project from a future
maintainer assuming closure was a mechanical determination when it was
actually an exception.

### 6. Should ChatGPT accept the warning as a documented exception, require more Codex investigation, or keep Draft-only?

Senior buyer recommendation: **escalate to a documented-exception
adjudication review by the merge owner**, scoped narrowly to human merge
consideration into the PR #78 stacked dependency Draft branch only.

Rationale:

- The evidence base is now substantially stronger than when the prior
  exception was withdrawn. Banner movement on route.ts is concrete
  evidence the warning is responsive to file shape, not to hidden
  content.
- Asking for one more "find the trigger codepoint" round risks an
  infinite loop because the heuristic may genuinely have no per-line
  codepoint trigger that is identifiable through scanning. We have
  already done two cycles of formatting + scanning without identifying
  one.
- Keeping PR #81 Draft-only forever is also wrong because the v2 baseline
  (PR #78) needs to absorb the v2 preview as a stacked dependency to
  unblock the product-ready work track.
- The buyer cannot unilaterally grant the exception. The merge owner
  must conduct an explicit adjudication and accept the narrow-scope
  guardrails.

Required guardrails for the documented exception (these are not optional):

- Exception scope is *only* human merge consideration into the PR #78
  stacked dependency Draft branch. Not main. Not undrafting.
- The merge owner must explicitly acknowledge in writing the persistent
  banner on the three named files at the recorded HEAD SHA.
- The merge owner must accept the four-surface zero-findings scan
  evidence and the route.ts banner-movement evidence as the basis for
  the exception.
- PR #81 stays Draft after the merge into the PR #78 branch.
- Merge to main is *not* approved by the exception. M5 (authenticated
  GraphQL review-thread inspection), M6 (CI wiring of the
  forbidden-term gate), and M3 extension (mechanical DOM scan with
  network-level write capture) remain required for any future
  main-merge consideration.
- Product-ready remains NO under all conditions of this exception.
- The merge owner must run `npm test` plus the focused Creative/v2
  preview vitest run on their machine and verify they pass before
  merging.

## Verdict

- **Verdict:** **DOCUMENTED_EXCEPTION_REVIEW_REQUIRED**.

  The evidence base is strong enough that I would not blanket-block,
  but a buyer cannot unilaterally bless the merge. The merge owner
  must conduct an explicit adjudication of the documented hidden/bidi
  exception, scoped narrowly to human merge consideration into the
  PR #78 stacked dependency Draft branch, with the guardrails listed
  above.

- **Product-ready:** NO.
- **Merge-ready to main:** NO. Multiple blockers remain (M5, M6, M3
  extension).
- **Merge-ready for human consideration into the PR #78 stacked
  dependency Draft branch:** conditional on the merge owner accepting
  the documented exception with the recorded guardrails. The buyer
  cannot grant this; the merge owner must.
- **Queue/apply safe:** NO.
- **Buyer confidence score:** 85/100 (up from 84).

  Score rationale (delta from prior packet):
  - +1 for the additional verification packet making the evidence
    base presentable to a merge owner. The state of PR #81 is unchanged
    in code, but the audit trail is now in a tighter, more
    presentable shape.
  - 0 for any code change since the prior buyer review (none in this
    cycle).
  - The 85 reflects buyer confidence in the *artefact*. It is not a
    blanket merge approval. It is the score at which I am comfortable
    recommending the merge owner conduct a documented-exception
    review.

- **Remaining blockers:**

  Pre-merge for human consideration into the PR #78 stacked
  dependency Draft branch (conditional on documented-exception
  adjudication):
  1. M1 / M2 documented-exception adjudication by the merge owner
     with the guardrails listed above.

  Pre-merge to main (additional, unchanged):
  2. M5: Authenticated GraphQL inspection of unresolved review-thread
     state across PR #78/#79/#80/#81.
  3. M6 (CI wiring): Contract parity / forbidden-term scan must fail
     the merge gate automatically in CI.
  4. M3 extension: Mechanical authenticated DOM scan with
     `data-testid` assertions plus network-level write-request
     capture.

  Product-ready (unchanged):
  - P1: Third *full* supervised operator session re-asking the
    five-second baseline question.
  - P2: Workspace-rendered direct-actionability evidence, or an
    explicit product-ready decision substituting the deterministic
    test plus the third operator session.
  - P3: Diagnose volume reviewed; either narrower resolver definition
    or surface framing as triage backlog.
  - P4: Network-level no-write enforcement on the v2 preview endpoint
    and detail/open interactions.
  - P5: Automated CI wiring of the contract parity / forbidden-term
    hard gate.
  - P6: Buyer confirmation lane behavior validated on a workspace
    that contains direct rows.
  - P7 (cosmetic): Vertical-balance polish for the
    Confirmation-empty + Buyer-Review-many-cards layout.

- **Recommended next step:**

  Send the closure packet plus this review to the merge owner and ask
  for an explicit documented-exception adjudication.

  The adjudication request to the merge owner should record:
  - PR #81 HEAD SHA `41a9d8030de6ef770f64088a98225791cdd5e51b`.
  - The three files with persistent banners.
  - The four-surface zero-findings scan evidence.
  - The route.ts banner-movement evidence.
  - The narrow-scope guardrails (PR #78 stacked dependency Draft
    branch only, no main, no undrafting, no product-ready, manual
    pre-merge gate, M5/M6/M3 extension still required for main-
    merge).

  If the merge owner accepts the documented exception with those
  guardrails, the owner may proceed to merge PR #81 into the PR #78
  stacked dependency Draft branch, keep PR #81 Draft, and continue
  limited read-only preview as supervised evidence gathering.

  If the merge owner declines, PR #81 stays Draft-only on its own
  branch and the team should consider whether to invest more cycles
  in identifying a per-line trigger or to wait for a separate signal
  (banner clearing on a future cache cycle, or a different reviewer
  identifying the heuristic).

  Do not request merge to main under either path. Do not enable
  queue/apply. Do not push to main. Do not claim product-ready.

  In parallel, the product-ready work track remains valid: schedule a
  third *full* supervised operator session, add a network-level
  no-write enforcement test, wire the contract parity / forbidden-
  term gate into CI.

## Confirmations

- This review changed no product code, resolver logic, gold labels,
  fixtures, v1 behavior, UI behavior, queue/apply behavior, Command
  Center wiring, DB write paths, or Meta/platform write paths.
- This review did not merge, did not push to main, did not enable
  queue/apply, did not wire Command Center, and did not introduce
  any write behavior.
- This review does not claim PR #81 is approved, accepted,
  product-ready, or merge-ready to main.
- This review does not unilaterally grant a merge exception. The
  merge owner must adjudicate.
- Limited read-only preview may continue as supervised evidence
  gathering only.
- All artifacts cited use sanitized row aliases.
- Active runtime validation refers to the self-hosted server and
  self-hosted PostgreSQL database only.
