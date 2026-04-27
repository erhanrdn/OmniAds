CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_JUDGE
BRANCH: review/creative-v2-formatting-bidi-correction-buyer-review-2026-04-27
HEAD_COMMIT: SEE_PUSHED_BRANCH_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-formatting-bidi-correction-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-formatting-bidi-correction-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
TARGET_PR: #81
TARGET_BRANCH: wip/creative-v2-readonly-ui-preview-2026-04-26
TARGET_HEAD_COMMIT: 0f90b2d4037e56ee0a4765cad07134b0bc977210
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
RESOLVER_LOGIC_CHANGED: NO
GOLD_LABELS_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 Active-File Formatting and Hidden/Bidi Correction Buyer Review

This review is read-only. It does not change product code, resolver logic,
gold labels, fixtures, v1 behavior, UI behavior, queue/apply behavior,
Command Center wiring, DB write paths, or Meta/platform write paths. PR #81
is not being merged. Main is not being pushed. Queue/apply must remain
disabled and Command Center must remain disconnected. Product-ready
remains NO.

## Scope

Senior Meta media buyer judgment review of Codex's narrow active-file
formatting + hidden/bidi correction packet on PR #81.

Source artifacts read on `origin/wip/creative-v2-readonly-ui-preview-2026-04-26`
across HEAD `0f90b2d4037e56ee0a4765cad07134b0bc977210`:

- commit `cb9eb9b chore: fix creative v2 active file hygiene`
- commit `256d337 docs: record creative v2 github warning evidence`
- commit `0f90b2d docs: clarify creative v2 warning capture head`
- updated `MERGE_READINESS_BLOCKER_AUDIT.md`
- updated `MERGE_READINESS_FINAL_CLOSURE.md`
- updated `FOR_CHATGPT_REVIEW.md`
- prior buyer reviews on
  `review/creative-v2-completed-operator-session-buyer-review-2026-04-27`,
  `review/creative-v2-ui-iteration-buyer-review-2026-04-27`,
  `review/creative-v2-second-session-buyer-review-2026-04-27`,
  `review/creative-v2-lane-polish-merge-audit-buyer-review-2026-04-27`, and
  `review/creative-v2-merge-readiness-closure-buyer-review-2026-04-27`

## Infrastructure framing

- Active site runtime: self-hosted server.
- Active database runtime: self-hosted PostgreSQL.
- Vercel queued/skipped checks and Neon-specific wording are deprecated
  infrastructure and not active blockers in this judgment.
- GitHub/Codex review warnings, hidden/bidi UI warnings, unsafe copy,
  queue/apply risk, write-safety risk, formatting/readability issues, and
  buyer UX issues remain active blockers if present.

## What Codex actually changed (independently verified)

Code (`cb9eb9b`):

- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` — extracted
  shared className constants (`compactPillClasses`, `mutedTinyPillClasses`,
  `inactiveTinyPillClasses`, `countBadgeClasses`,
  `whiteCountBadgeClasses`) and broke long inline class strings across
  multiple lines. Functional behavior unchanged.
- `app/(dashboard)/creatives/page.test.tsx` — split previously dense
  single-line vi.mock factories across multiple readable lines.
- `lib/creative-decision-os-v2-preview.test.tsx` — added a new file-hygiene
  test that fails if any active TS/TSX preview file is compressed
  (large file with too few lines) or contains a line longer than 220
  characters.

Documentation (`256d337`, `0f90b2d`):

- Withdrew the prior `closed_by_documented_false_positive_exception` for
  M1/M2.
- Recorded post-push public GitHub evidence at PR #81 head
  `cb9eb9b...` showing the GitHub files-view hidden/bidi warning banner
  is *still visible* on four active file sections after formatting:
  - `app/(dashboard)/creatives/page.test.tsx`
  - `app/(dashboard)/creatives/page.tsx`
  - `app/api/creatives/decision-os-v2/preview/route.test.ts`
  - `app/api/creatives/decision-os-v2/preview/route.ts`
- Recorded that targeted public raw scans on those four files plus
  `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` (no
  banner) found zero hidden/bidi/control codepoints.
- Re-tagged M1/M2 status to
  `open_active_github_files_view_warning_remains_after_formatting`.
- Re-tagged the PR #81 verdict back to "not ready for human merge
  consideration into the PR #78 branch while the active GitHub warning
  remains open".

## Independent verification cross-checks

Active raw file metrics at `origin/wip/creative-v2-readonly-ui-preview-2026-04-26`:

| File | Line count | Max line length |
| --- | ---: | ---: |
| `app/(dashboard)/creatives/page.test.tsx` | 292 | 108 |
| `app/(dashboard)/creatives/page.tsx` | 1266 | 196 |
| `app/api/creatives/decision-os-v2/preview/route.test.ts` | 65 | 109 |
| `app/api/creatives/decision-os-v2/preview/route.ts` | 117 | 105 |
| `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` | 593 | 118 |

These match Codex's reported numbers within normal line-counting
differences. All active files are multi-line and not generated-looking.
None has a single absurdly long line.

Component write-safety re-grep at the new HEAD: the only `<button>` with
`onClick` in `CreativeDecisionOsV2PreviewSurface.tsx` is still the row
card button wired to `onOpenRow(row.rowId)`. No DB / Meta / Command
Center / fetch / SQL references were introduced by the formatting pass.
Read-only invariant holds.

The new file-hygiene test
(`keeps active preview code files from collapsing into generated-looking
single-line output`) acts as a forward-looking guard against another
collapse regression.

## Buyer judgment on the 7 questions

### 1. Are active TS/TSX/test files now normally formatted and readable?

Yes, independently verified. All five active files are multi-line, with
max line lengths in a normal Tailwind/Next.js range (105-196). The
component file in particular went from 525 lines (lane polish) to 593
lines after the formatting pass, with shared className constants
extracted — this is a healthy readability refactor, not an obfuscation.

### 2. Is `app/(dashboard)/creatives/page.test.tsx` no longer a single-line raw file?

Yes. 292 lines, max line length 108. Independently verified. The
specific dense single-line vi.mock factories that previously triggered
review-friction have been split across multiple lines.

### 3. Is `CreativeDecisionOsV2PreviewSurface.tsx` readable multi-line TSX?

Yes. 593 lines, max line length 118. The diff shows long inline
className strings broken across multiple lines via `cn(...)` and a few
shared className constants. Functional behavior is unchanged. The
read-only invariant test still passes against the post-formatting file.

### 4. Is GitHub hidden/bidi warning gone from active PR #81 files view?

No. Codex's own post-push public GitHub files-HTML capture (at PR #81
head `cb9eb9b`) confirms the warning banner is still visible on four
active file sections, even after the formatting correction. As a senior
buyer reading this honestly: the banner persisted across the formatting
correction. That fact alone weakens any "false-positive heuristic" narrative
that depends on the banner clearing once active files are properly
multi-line.

### 5. If not gone, is the exact active file/line/codepoint documented?

Files: documented. Codepoints: documented as **zero** in the active
public raw blob scans for those files. Line context: not captured in
this packet at the post-formatting line numbers. The earlier cleanup
audit captured pre-formatting line ranges (e.g., 318-327, 369-379,
469-478, 542-551), but those line numbers are no longer valid after the
formatting pass changed the file shapes. A tight closure would re-capture
the exact line ranges GitHub is flagging on the post-formatting files.

This is a calibrated honesty gap, not a dishonesty: Codex documents the
banner persists, identifies the four flagged files, and does not claim
closure. They simply do not yet have post-formatting per-line evidence
on what GitHub is flagging. As a senior buyer I want that evidence
before any merge consideration.

### 6. Are reports now honest and not overclaiming false-positive closure?

Yes. This is the most important correction in the packet.

The prior closure tag
`closed_by_documented_false_positive_exception` has been withdrawn.
The new tag is
`open_active_github_files_view_warning_remains_after_formatting`.
The merge-readiness blocker table now reads:

- M1 GitHub UI hidden/bidi warning: open; public GitHub files HTML
  still shows warning banners after formatting.
- M2 Historical PR #79/#81 warning closure: open; active PR #81
  warning remains after formatting.

The Explicit Non-Ignoring Statement now ends with: "PR #81 is not
product-ready, not merge-ready, and not ready for human merge
consideration into the PR #78 branch while the active GitHub warning
remains open." This is exactly the right tone. No overclaim.

### 7. Is PR #81 ready for human merge consideration into PR #78 branch, or still blocked?

Still blocked.

I previously gave a conditional yes for human merge consideration into
the PR #78 stacked dependency branch, predicated explicitly on
merge-owner acceptance of the documented hidden/bidi false-positive
exception. Codex has now *withdrawn* that exception with documented
evidence that the banner persists across the formatting correction.
With the exception withdrawn, the conditional yes is also withdrawn.

A senior buyer should not ask a merge owner to accept a publicly visible
banner labeled "This file contains hidden or bidirectional Unicode text"
on four active diff sections without one of:

- The banner clearing on a subsequent files-view check (cache/heuristic
  refresh), or
- A post-formatting per-line investigation that explains exactly which
  characters or sequence GitHub is flagging and why, or
- An owner-level adjudication that documents the persistent banner as
  an accepted GitHub UI artifact with concrete evidence of its trigger.

Until one of those conditions is met, this is a real merge-readiness
blocker for human consideration into the PR #78 branch.

The product-side and safety-side findings are otherwise unchanged: lane
separation is empirically endorsed, queue/apply is disabled, Command
Center is disconnected, v1 remains default, v2 is off by default, no
DB/Meta writes added, forbidden-term and read-only invariant tests
still pass.

## Verdict

- **Verdict:** **MERGE_READINESS_STILL_BLOCKED**.
- **Product-ready:** NO.
- **Merge-ready to main:** NO.
- **Merge-ready for human consideration into the PR #78 stacked
  dependency branch:** NO. Conditional yes from prior review is
  withdrawn alongside the false-positive exception that supported it.
- **Queue/apply safe:** NO. Queue/apply must remain disabled and
  Command Center must remain disconnected.
- **Buyer confidence score:** 83/100 (down from 86).

  Score rationale:
  - +30 safety (no unsafe copy, no write paths, v1 default preserved,
    inactive rows clean, off-by-default gate, component read-only
    invariant test, no new affordances introduced by the formatting
    pass).
  - +20 first-glance clarity (Scale-ready rename + strict-state copy +
    lane separation, empirically endorsed by supervisor).
  - +12 Cut/Refresh clarity.
  - +10 surface contract discipline (forbidden-term scans, contract
    parity, sanitization, deterministic ordering test, lane-marker
    rendering test, manual hard pre-merge gate, new file-hygiene
    compression-prevention test).
  - +5 Scale clarity.
  - +3 Diagnose action clarity.
  - +5 audit honesty (false-positive exception withdrawn with
    documented evidence; explicit non-silent-ignoring; manual vs
    automated gate distinction; supervisor-assisted vs mechanical DOM
    distinction).
  - +3 supervisor lane-separation endorsement.
  - +3 active-file readability genuinely fixed (independently
    verified; new test guards against regression).
  - -8 active GitHub UI banner persists after formatting correction
    (M1/M2 reopened; conditional yes for PR #78 branch withdrawn).
  - 0 third *full* supervised operator session re-asking the
    five-second baseline (still pending; required for product-ready).
  - 0 network-level no-write enforcement test (still pending; required
    for product-ready).
  - 0 automated CI wiring of the contract parity / forbidden-term hard
    gate (still pending; required for main-merge readiness).
  - Net: 83. The correction itself is high-quality and honest; the
    actual merge-readiness state has regressed because the exception
    that previously bridged M1/M2 has been withdrawn.

- **Remaining blockers:**

  Pre-merge for human consideration into the PR #78 stacked
  dependency branch:
  1. M1: Active PR #81 GitHub files-view hidden/bidi warning banner
     on `app/(dashboard)/creatives/page.test.tsx`,
     `app/(dashboard)/creatives/page.tsx`,
     `app/api/creatives/decision-os-v2/preview/route.test.ts`, and
     `app/api/creatives/decision-os-v2/preview/route.ts`. Banner
     persists across formatting correction. Either the banner must
     clear on a follow-up files-view recheck, or a post-formatting
     per-line investigation must identify what GitHub is flagging,
     or an owner-level adjudication with concrete evidence of the
     trigger must be recorded.
  2. M2: PR #79 / #81 conversation-page historical hidden/bidi
     warnings under the same evidence requirement.

  Pre-merge to main (additional):
  3. M5: Authenticated GraphQL inspection of unresolved review-thread
     state across PR #78/#79/#80/#81 at merge time.
  4. M6 (CI wiring): Contract parity / forbidden-term scan must fail
     the merge gate automatically in CI, not only as a manual
     pre-merge command set.
  5. M3 extension: Mechanical authenticated DOM scan with
     `data-testid` assertions plus network-level write-request
     capture, in addition to the supervisor-assisted natural-language
     validation.

  Product-ready (unchanged from prior review):
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
    that actually contains direct rows (not only the empty state).
  - P7 (cosmetic): Vertical-balance polish for the
    Confirmation-empty + Buyer-Review-many-cards layout.

- **Recommended next step:**

  Do not merge PR #81 into the PR #78 stacked dependency branch yet.
  Keep PR #81 Draft. Continue limited read-only preview as supervised
  evidence gathering.

  Drive M1/M2 to closure via one of these paths, in order of cheapness:

  1. Recheck the active PR #81 GitHub files-view banner after a brief
     delay (GitHub UI heuristics sometimes update on a cache cycle).
     If the banner is now gone, re-record the exact PR #81 head SHA
     and a screenshot URL or HTML capture at that head, then re-tag
     M1/M2 as `closed_by_post_format_files_view_recheck` and re-run
     this buyer review.
  2. If the banner persists, ask the supervisor (authenticated
     browser session) to capture exact post-formatting line ranges
     GitHub is flagging on each of the four files, plus any specific
     character ranges GitHub highlights. Cross-reference each flagged
     line against the active raw file at the same line; if a specific
     codepoint can be identified, normalize/replace it; if no
     codepoint can be identified, record the screenshot + line ranges
     + raw-file content at those lines as concrete owner-visible
     evidence and request an owner-level adjudication. Re-tag M1/M2
     accordingly.
  3. Do not silently re-introduce the prior false-positive exception
     without one of the two paths above.

  In parallel, the product-ready work track remains valid: schedule a
  third *full* supervised operator session, add a network-level
  no-write enforcement test, wire the contract parity / forbidden-term
  gate into CI.

  Do not request merge to main. Do not enable queue/apply. Do not push
  to main.

## Confirmations

- This review changed no product code, resolver logic, gold labels,
  fixtures, v1 behavior, UI behavior, queue/apply behavior, Command
  Center wiring, DB write paths, or Meta/platform write paths.
- This review did not merge, did not push to main, did not enable
  queue/apply, did not wire Command Center, and did not introduce any
  write behavior.
- This review does not claim PR #81 is approved, accepted,
  product-ready, or merge-ready to main.
- Limited read-only preview may continue as supervised evidence
  gathering only.
- All artifacts cited use sanitized row aliases.
- Active runtime validation refers to the self-hosted server and
  self-hosted PostgreSQL database only.
