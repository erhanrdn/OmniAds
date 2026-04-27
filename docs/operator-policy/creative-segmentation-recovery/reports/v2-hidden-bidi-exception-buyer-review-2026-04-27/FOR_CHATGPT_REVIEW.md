CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_JUDGE
BRANCH: review/creative-v2-hidden-bidi-exception-buyer-review-2026-04-27
HEAD_COMMIT: SEE_PUSHED_BRANCH_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-hidden-bidi-exception-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-hidden-bidi-exception-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
TARGET_PR: #81
TARGET_BRANCH: wip/creative-v2-readonly-ui-preview-2026-04-26
TARGET_HEAD_COMMIT: bc9624e49d6c8b76746d6eb0ad062ce0ea5b43fc
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
RESOLVER_LOGIC_CHANGED: NO
GOLD_LABELS_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 PR #81 Hidden/Bidi Exception Buyer Review

This review is read-only. It does not change product code, resolver logic,
gold labels, fixtures, v1 behavior, UI behavior, queue/apply behavior,
Command Center wiring, DB write paths, or Meta/platform write paths. PR #81
is not being merged. Main is not being pushed. Queue/apply must remain
disabled and Command Center must remain disconnected. Product-ready
remains NO.

## Scope

Senior Meta media buyer judgment review of Codex's targeted hidden/bidi
exception proof packet on PR #81.

Source artifacts read at PR #81 HEAD
`bc9624e49d6c8b76746d6eb0ad062ce0ea5b43fc`:

- commit `bc9624e docs: add targeted creative v2 warning proof`
- commit `029a612 docs: record creative v2 raw url verification`
- updated `MERGE_READINESS_FINAL_CLOSURE.md`
- updated `MERGE_READINESS_BLOCKER_AUDIT.md`
- updated `FOR_CHATGPT_REVIEW.md`
- prior buyer review at branch
  `review/creative-v2-merge-exception-adjudication-buyer-review-2026-04-27`
  (HEAD `b9a29f82e04e0dc646fdc090a7a8be0175e31ccb`)

## Infrastructure framing

- Active site runtime: self-hosted server.
- Active database runtime: self-hosted PostgreSQL.
- Vercel queued/skipped checks and Neon-specific wording are deprecated
  infrastructure and not active blockers.
- GitHub/Codex review warnings, hidden/bidi UI warnings, unsafe copy,
  queue/apply risk, write-safety risk, formatting/readability issues, and
  buyer UX issues remain active blockers if present.

## What changed since the prior buyer review

Two new documentation-only commits at HEAD `bc9624e` and `029a612`:

- `029a612` records the raw URL verification: explicit `curl` invocations
  with HTTP 200 status against the public raw GitHub URLs for
  `app/(dashboard)/creatives/page.test.tsx` and
  `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`, with
  exact `wc -l` results (297 and 624) and an `awk` long-line check that
  produced no output. Confirms files are real multi-line content under
  the active branch URL, not just a local artifact.
- `bc9624e` records a targeted file-by-file hidden/bidi exception proof
  for the four flagged files. For each file: public raw line count,
  long-line scan, hidden/bidi/control codepoint scan, non-ASCII scan,
  base-branch comparison, and GitHub files-warning status. This is
  exactly the per-file owner-visible evidence I asked for in the prior
  buyer review.

No code changes. No resolver, gold-label, contract, or v1 changes.
PR #81 remains Draft.

## Independently verified state at TARGET_HEAD_COMMIT

Cross-checks I ran against the active branch (matches Codex's reported
metrics within trailing-newline counting differences):

- `app/(dashboard)/creatives/page.test.tsx`: 297 lines.
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`: 624
  lines.
- Component still has only the row-card `<button>` wired to
  `onOpenRow`. No DB / Meta / Command Center / fetch / SQL references
  introduced.
- Read-only invariant test continues to pass.
- Forbidden rendered-term and internal-artifact scans still pass.
- v1 default preserved. v2 still off by default behind the query-param
  gate. Queue/apply disabled. Command Center disconnected.

## Strength of the new evidence base

The targeted proof packet brings the evidence base to a materially
stronger level than any prior cycle:

- File-by-file scan results, not aggregated:
  - `app/(dashboard)/creatives/page.test.tsx`: 297 lines, no >220-char
    line, zero hidden/bidi/control, no non-ASCII, not introduced by
    PR #81. Banner template still present in public files HTML.
  - `app/(dashboard)/creatives/page.tsx`: 1267 lines, no >220-char
    line, zero hidden/bidi/control, normal Turkish UI letters only
    (U+00F6, U+00FC, U+0131, U+011F, U+00E7, U+015F, U+00D6, U+00B7),
    pre-existing in base branch, *not* introduced by PR #81. Banner
    template still present.
  - `app/api/creatives/decision-os-v2/preview/route.test.ts`: 66
    lines, no >220-char line, zero hidden/bidi/control, no non-ASCII.
    Banner template still present.
  - `app/api/creatives/decision-os-v2/preview/route.ts`: 120 lines,
    no >220-char line, zero hidden/bidi/control, no non-ASCII. Banner
    *not* present in this round's files-HTML capture, but checked
    anyway because ChatGPT had named it.
- The exact reproducible commands are recorded:
  `curl -LfsS "$RAW_URL" | wc -l`,
  `awk 'length($0)>220 {print FNR ":" length($0)}'`,
  `perl -ne 'print "$ARGV:$.:$_" if /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{202A}-\x{202E}\x{2066}-\x{2069}]/'`,
  plus a non-ASCII codepoint counter and a zero-context base-branch
  diff.
- Banner movement evidence carried over from the prior cycle:
  `app/api/creatives/decision-os-v2/preview/route.ts` cleared between
  HEAD `cb9eb9b` and HEAD `0ab332e` after a whitespace-only reformat.
- Public PR #81 `.diff` and `.patch` scans continue to report zero
  hidden/bidi/control codepoints.

The narrative is now concrete: the only non-ASCII in any of the four
flagged files is a small set of normal Turkish letters in
`app/(dashboard)/creatives/page.tsx`, and they were already present
in the base branch — PR #81 did not introduce them. The other three
files have no non-ASCII content at all. None of the four files contains
hidden, bidi, or control codepoints. The visible warning banner
therefore cannot be explained by anything in the active file content
that PR #81 introduced.

## Honesty check on Codex's reports

The targeted proof packet explicitly says:

> No false-positive closure is claimed here.

> Human merge consideration into PR #78: NO until ChatGPT accepts this
> exact file-level exception evidence or the GitHub files-view warning
> banners disappear.

This is the right tone. Codex is presenting concrete evidence and asking
for owner-level adjudication, not silently re-claiming closure. They are
not overclaiming. They have done what I asked for in the prior cycle:
file-by-file owner-visible evidence with reproducible commands.

## Buyer judgment on the 8 questions

### 1. Are active source/test files now formatted and readable enough?

Yes. Independently verified at TARGET HEAD: 297 lines for
`page.test.tsx`, 624 lines for the component, no lines >220 chars,
normal Tailwind/Next.js shape. The new file-hygiene compression test
guards against regression.

### 2. Is the previous single-line/generated-looking source blocker closed?

Yes, closed. This is no longer in dispute.

### 3. Is Codex's hidden/bidi evidence strong enough to treat the remaining GitHub banner as a documented exception for PR #78-branch human merge consideration?

Yes. With the file-by-file targeted proof in `bc9624e`, the evidence
base is owner-presentable, reproducible, and concrete:

- All four flagged files independently scanned and reported zero
  hidden/bidi/control codepoints.
- Every non-ASCII character in those files identified by codepoint and
  shown to be pre-existing Turkish UI text, not a PR #81 introduction.
- Banner movement on route.ts after a whitespace-only reformat is
  concrete evidence that the warning is responsive to file shape /
  GitHub heuristic, not to file content.
- Multiple independent scan surfaces (local, raw, `.diff`, `.patch`,
  zero-context base diff) all return zero.

That is materially stronger than at any prior HEAD and is sufficient
to support a documented exception, scoped narrowly to human merge
consideration into the PR #78 stacked dependency Draft branch only.

### 4. Or should PR #81 remain blocked until the GitHub banner disappears completely?

No. Holding indefinitely on the banner alone is now wrong:

- Codex has done two rounds of formatting + scanning + verification.
- The remaining banner has no per-file content explanation that any
  scan can identify.
- It is consistent with a GitHub UI heuristic / template artifact that
  may persist on a stale-cache surface even after every active scan
  surface clears.
- Continuing to require "banner disappears completely" without any
  evidence-driven path to make that happen is an indefinite block.

### 5. Are Codex's reports honest, or are they still overclaiming?

Honest. The reports do not re-introduce the prior false-positive
closure. They explicitly say "No false-positive closure is claimed
here" and route the decision through ChatGPT/owner adjudication. They
keep merge-ready = NO and product-ready = NO. They explicitly require
that "ChatGPT accept this exact file-level exception evidence" or the
banners actually disappear. That is the right discipline.

### 6. Is PR #81 ready for human merge consideration into the PR #78 branch, or still Draft-only?

Ready for human merge consideration into the PR #78 stacked dependency
Draft branch only. Still Draft and must remain Draft after any merge.

### 7. Product-ready must remain NO.

Confirmed. Product-ready: NO. The remaining product-ready blockers
(P1-P7) carry forward unchanged.

### 8. Merge-ready to main must remain NO.

Confirmed. Merge-ready to main: NO. M5 (authenticated GraphQL review-
thread inspection), M6 (CI wiring of the forbidden-term gate), and the
M3 extension (mechanical authenticated DOM scan with network-level
write-request capture) remain required for any future main-merge
consideration.

## Verdict

- **Verdict:** **READY_FOR_HUMAN_MERGE_CONSIDERATION_INTO_PR78_BRANCH**.

  The buyer is no longer requiring more investigation. The
  bc9624e/029a612 evidence is at file-by-file owner-visible level with
  reproducible commands, the active raw content is provably clean, and
  the remaining warning is consistent with a GitHub UI heuristic /
  template artifact. The merge owner has what they need to adjudicate
  and proceed.

- **Product-ready:** NO.
- **Merge-ready to main:** NO.
- **Merge-ready for human consideration into the PR #78 stacked
  dependency Draft branch:** YES, conditional on the merge owner's
  standard pre-merge due diligence (run `npm test` plus the focused
  Creative/v2 preview vitest run on their machine and verify they
  pass) and explicit acknowledgment that they have read the targeted
  exception evidence in `bc9624e` and `029a612`. PR #81 must stay
  Draft after the merge.
- **Queue/apply safe:** NO. Queue/apply must remain disabled and
  Command Center must remain disconnected.
- **Buyer confidence score:** 87/100 (up from 85).

  Score rationale:
  - +1 file-by-file targeted proof packet provides the per-file
    owner-visible evidence I asked for in the prior cycle.
  - +1 reproducible command set in the proof makes the evidence
    independently verifiable by the merge owner.
  - 0 for the raw URL verification packet (already implicit in the
    prior cycle's score).
  - The 87 reflects buyer confidence in the artefact and the audit
    trail. It is not an unconditional bless. The merge owner still
    runs their own due-diligence gate before merging.

- **Remaining blockers:**

  Pre-merge for human consideration into the PR #78 stacked
  dependency Draft branch:
  - None from the buyer side. The merge owner runs the standard
    pre-merge command set (`npm test` plus the focused Creative/v2
    preview vitest run) and explicitly acknowledges the documented
    exception in writing before merging.

  Pre-merge to main (additional, unchanged):
  - M5: Authenticated GraphQL inspection of unresolved review-thread
    state across PR #78/#79/#80/#81.
  - M6 (CI wiring): Contract parity / forbidden-term scan must fail
    the merge gate automatically in CI, not only as a manual
    pre-merge command set.
  - M3 extension: Mechanical authenticated DOM scan with
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

  Send the closure packet plus this review to the merge owner. The
  merge owner should:

  1. Read the targeted exception proof in
     `MERGE_READINESS_FINAL_CLOSURE.md` (HEAD `bc9624e`).
  2. Optionally re-run the recorded scan commands themselves to
     confirm the file-by-file results.
  3. Run the manual pre-merge command set: `npm test` plus
     `npx vitest run lib/creative-decision-os-v2.test.ts
     lib/creative-decision-os-v2-preview.test.tsx
     components/creatives/CreativeDecisionSupportSurface.test.tsx
     components/creatives/CreativesTableSection.test.tsx
     'app/(dashboard)/creatives/page.test.tsx'
     app/api/creatives/decision-os-v2/preview/route.test.ts` and
     verify they pass.
  4. Explicitly acknowledge in writing the documented exception with
     the narrow-scope guardrails:
     - PR #78 stacked dependency Draft branch only.
     - Not main.
     - Not undrafting.
     - Not product-ready.
     - PR #81 stays Draft after the merge.
     - Future main-merge still requires M5, M6, and M3 extension.
  5. If accepted, merge PR #81 into the PR #78 stacked dependency
     Draft branch and continue limited read-only preview as
     supervised evidence gathering.

  If declined, PR #81 stays Draft-only on its own branch and the
  team should consider whether to wait for the GitHub UI banner to
  clear on a future cache cycle or pursue the product-ready work
  track in parallel.

  In parallel, the product-ready work track remains valid: schedule
  a third *full* supervised operator session, add a network-level
  no-write enforcement test, wire the contract parity / forbidden-
  term gate into CI.

  Do not request merge to main. Do not enable queue/apply. Do not
  push to main. Do not claim product-ready.

## Confirmations

- This review changed no product code, resolver logic, gold labels,
  fixtures, v1 behavior, UI behavior, queue/apply behavior, Command
  Center wiring, DB write paths, or Meta/platform write paths.
- This review did not merge, did not push to main, did not enable
  queue/apply, did not wire Command Center, and did not introduce
  any write behavior.
- This review does not claim PR #81 is approved, accepted,
  product-ready, or merge-ready to main.
- This review does not unilaterally execute a merge. The merge
  owner must run their own due-diligence gate and acknowledge the
  documented exception.
- Limited read-only preview may continue as supervised evidence
  gathering only.
- All artifacts cited use sanitized row aliases.
- Active runtime validation refers to the self-hosted server and
  self-hosted PostgreSQL database only.
