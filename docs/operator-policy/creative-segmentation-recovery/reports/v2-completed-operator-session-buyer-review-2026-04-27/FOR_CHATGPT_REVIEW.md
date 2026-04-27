CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_JUDGE
BRANCH: review/creative-v2-completed-operator-session-buyer-review-2026-04-27
HEAD_COMMIT: SEE_DRAFT_PR_BODY_CURRENT_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-completed-operator-session-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-completed-operator-session-buyer-review-2026-04-27/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative v2 Completed Operator Session Buyer Review

This review is read-only. It does not change product code, resolver logic, gold
labels, fixtures, v1 behavior, UI behavior, queue/apply behavior, Command
Center wiring, DB write paths, or Meta/platform write paths. PR #81 is not
being merged. Main is not being pushed. No queue/apply/scale/cut/approve write
behavior is being requested or enabled.

## Scope

Senior Meta media buyer / operator judgment review of the actual completed
supervised limited read-only operator preview session for PR #81.

Source artifacts read on
`origin/wip/creative-v2-readonly-ui-preview-2026-04-26`:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-limited-operator-preview-session-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-limited-operator-preview-session-2026-04-26/SESSION_OBSERVATIONS.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-limited-operator-preview-session-2026-04-26/OPERATOR_SESSION_CHECKLIST.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/PR_REVIEW_CLEANUP_AUDIT.md`

Existing PR #80 review files were skimmed for continuity but are not relied on
as authoritative state because the supervised session has now been actually
conducted by Codex and recorded.

## Infrastructure framing

- Active site runtime: self-hosted server.
- Active database runtime: self-hosted PostgreSQL.
- Vercel queued/skipped checks and Neon-specific wording are deprecated
  infrastructure and are not active blockers in this judgment.
- GitHub/Codex review warnings, hidden/bidi UI warnings, unsafe copy, queue/
  apply risk, write-safety risk, formatting/readability issues, and buyer UX
  issues remain active blockers if present.

## Session evidence summary as a buyer would read it

- Session actually conducted: YES.
- First-glance clarity: ~85%.
- Operator inspection priority: spend-heavy loss-making rows first.
- Cut candidate clarity: positive.
- Refresh candidate clarity: positive.
- Inactive rows: separated clearly.
- Unsafe action language visible: NO.
- Internal artifact language visible: NO.
- Direct-actionability row present in workspace: NO.
- Scale-worthy summary: shows 0 while operator believes a scale candidate
  exists.
- Diagnose Investigate control: visible but did not produce an observable
  action.
- Direct-actionability vs Diagnose meaning: not clearly distinguished in the
  operator's mental model.
- DB writes / Meta writes / queue / apply / Command Center wiring:
  none introduced by this preview.
- v1 default page: still default; v2 only behind off-by-default query param.

## Buyer judgment on the 14 questions

### 1. Did the operator know what to do within 5 seconds?

Mostly yes. ~85% first-glance clarity is acceptable for limited read-only
preview because the operator immediately gravitated to spend-heavy
loss-making rows, which is the correct senior-buyer instinct. It is not yet
acceptable for product-ready, because a senior buyer panel should be closer to
~95% first-glance clarity with an unambiguous "today's work" frame.

### 2. Is 85% first-glance clarity enough to continue limited read-only preview?

Yes. 85% is a green light for *continued* limited preview. It is a yellow
light for product-ready and a red flag for unsupervised use. The remaining
~15% friction is concentrated in a small number of well-identified UX
issues, not in safety or content correctness.

### 3. Does Today Priority surface the right buyer work?

Directionally yes. The operator's first instinct (spend-heavy loss-making
rows) is exactly what Today Priority should expose first, and the audit
shows high-spend Cut and high-risk Cut/Refresh transitions appearing in
Today Priority. This is the right buyer work for limited preview. It is
*not* yet validated as product-ready because the workspace had zero
direct-actionability rows, so the strongest Today Priority claim
(review-only Scale and high-spend Cut ranking above direct Protect/Test More)
is still fixture-backed, not workspace-rendered.

### 4. Are Scale / Cut / Refresh candidates understandable?

- Cut: yes, understandable to the operator.
- Refresh: yes, understandable to the operator.
- Scale: not yet. The operator perceived a scale candidate but the panel
  summary said `Scale-worthy = 0`. As a buyer, that is the worst kind of
  mismatch because Scale decisions move money. It is currently a copy /
  surface-explanation issue rather than a write-safety issue, but it must be
  resolved before any product-ready claim.

### 5. Is the `Scale-worthy = 0` mismatch:

Classification: primarily a **copy / surface issue** with a **resolver-
explanation** secondary component. It is **not blocking for limited
read-only preview**. It **is blocking for product-ready**.

Reasoning:

- The fixture-backed bucket distribution shows exactly 1 Scale row across 303
  rows, so the resolver is not silently throwing away scale candidates;
  what the operator perceives as "scale-worthy" is a buyer instinct that the
  v2 review-only Scale definition does not currently match.
- This is a buyer-language gap: the panel says "Scale-worthy", the buyer
  reads "creatives I would pour budget into", and those two definitions are
  not currently aligned in the surface copy.
- If left unfixed, this is the single most likely cause of the panel being
  ignored or distrusted in real money decisions.

### 6. Is Diagnose useful or too dominant?

Useful in concept, currently too dominant in volume. The fixture shows 193 of
303 rows in Diagnose First. Even with Diagnose collapsed by default, that is
a lot of mass behind one drawer and the operator interpreted Diagnose as
possibly serving the buyer-confirmation purpose. Limited preview can
continue, but Diagnose must be tightened or relabeled before product-ready
so that buyers do not treat it as the de-facto action area.

### 7. Is the `Investigate` issue blocking for limited preview, or only blocking for product-ready?

Blocking for product-ready. Not blocking for limited read-only preview.

Reasoning:

- A control that looks interactive but does not produce an observable action
  is a buyer-trust failure. In a real money panel that is a serious problem
  because buyers must learn that buttons mean what they say.
- It is acceptable in a supervised limited read-only preview because no money
  moves and the operator was supervised. The supervisor explicitly recorded
  it as a usability issue and not unsafe write behavior.
- Two clean fixes are acceptable: (a) make `Investigate` open useful read-
  only context, or (b) remove the affordance for now and re-introduce it
  only when wired to read-only context.

### 8. Are inactive rows separated correctly?

Yes. Operator confirmed inactive/passive rows are separated clearly, and
Inactive Review is collapsed by default. This is one of the cleanest parts
of the surface and should not be re-litigated.

### 9. Is button/copy language safe?

Yes. The supervisor saw no Apply, Queue, Push, Auto, Scale now, Cut now, or
Approve language. Forbidden-term scans pass on rendered output and on the
contract parity tests. Allowed read-only labels (Open detail, View
diagnosis, Investigate, See blocker, Compare evidence) are the right
vocabulary for a limited read-only buyer preview.

### 10. Are there any hidden write-safety concerns?

None visible from the session evidence. DB writes, Meta writes, Command
Center writes, and queue/apply writes were all reported as zero in prior
technical validation, no live-write affordance was observed, and no
forbidden write language was rendered. The supervisor could not directly
observe DB or Meta network calls, but that is acceptable for a supervised
limited preview given the rendered language and the absence of any
write-style control.

The one residual concern a senior buyer should keep flagging: the
`Investigate` control that does not do anything. Today it is harmless, but
the *next* iteration of that control must not silently turn into a write
path. That should be enforced by tests and contract scans, not by hope.

### 11. Does the absence of a direct-actionability row block continued limited preview?

No, it does not block continued limited preview. The fixture-backed sort
tests are sufficient evidence at this stage. The operator's first-glance
behavior (spend-heavy loss-making rows surfaced and inspected first) is
consistent with the fixture-backed ordering claim.

It does, however, remain a **product-ready blocker**. Before the panel can
be called product-ready, either:

- a workspace must render at least one direct-actionability row and visually
  confirm review-only Scale and high-spend Cut rank above direct Protect/
  Test More, **or**
- equivalent stronger evidence must be produced (for example, a deterministic
  end-to-end test that constructs a workspace with a direct-actionability row
  and asserts ordering).

### 12. Should ChatGPT move to:

Verdict: **UI iteration, while keeping limited read-only preview live.**

Concretely:

- Keep PR #81 Draft and read-only.
- Keep the v2 preview off by default behind the query-param gate.
- Open a small UI iteration cycle targeting (a) Scale-worthy copy/semantics,
  (b) Diagnose `Investigate` behavior, and (c) Diagnose vs buyer-
  confirmation section meaning.
- After UI iteration, run a *second* supervised operator session to confirm
  the same operator now reads Scale-worthy, Diagnose, and buyer-
  confirmation correctly.
- Do not pause the preview. Pause is reserved for safety problems, and no
  safety problem was observed.

### 13. What exactly must be fixed before merge-readiness

Pre-merge blockers (must be fixed or explicitly closed with evidence):

- M1. PR #81 GitHub files-view hidden/bidirectional Unicode warning banners.
  Active raw blob, `.diff`, and `.patch` scans are clean, but the GitHub
  files UI still shows the warning on multiple diff sections. This must be
  driven to zero visible warnings on the active GitHub files view, or
  explicitly closed with documented evidence that the warning is a stale
  GitHub UI artifact and cannot be reproduced from active content.
- M2. PR #79 and PR #81 conversation-page historical hidden/bidi warnings
  must be explicitly closed with documented evidence (commit SHA, scan
  result) so a reviewer can confirm they are stale.
- M3. Self-hosted runtime validation must be re-confirmed after any UI
  iteration, against the self-hosted server and self-hosted PostgreSQL DB
  only. Vercel/Neon queued/skipped checks must not be cited as either green
  or red.
- M4. The `npm test`/`vitest` pathing failure documented in the cleanup
  audit ("vitest: command not found", resolved via an untracked symlink)
  must be made repeatable from a clean checkout, so future reviewers can
  rerun the same gate without bespoke local symlinks.
- M5. All open Codex/GitHub PR review threads on #78, #79, #80, #81 must be
  zero or explicitly resolved with evidence at the time of merge. Currently
  reported as zero through the connector, but this must be re-checked at
  merge time.
- M6. The contract parity scan (`Auto-*`, `Push live`, `Push to review
  queue`, plus the standard forbidden set) must be the gate, not just a
  current-pass observation. If it is not already, it must be wired so a
  failing rendered-output scan blocks merge.
- M7. The `Investigate` control must either do something observable read-
  only or be removed from the rendered surface before merge. Shipping a
  no-op interactive control to main is not acceptable even behind a flag.

These are *merge-readiness* gates only. None of them are needed to *continue*
the limited read-only preview.

### 14. What exactly must be fixed before product-ready

Product-ready blockers (in addition to all merge blockers above):

- P1. `Scale-worthy` summary semantics must be aligned to senior-buyer
  language. Either the copy is rewritten so a buyer immediately understands
  why a perceived scale candidate is not counted, or the resolver
  Scale definition is documented in-surface in a way the operator can
  reconcile in <5 seconds. A second supervised operator session must
  confirm the operator now reads Scale-worthy as expected.
- P2. Diagnose must be visibly distinguished from buyer-confirmation /
  direct-actionability. A buyer must not interpret Diagnose as the place
  where confirmations happen. This may be a label change, a section
  reorder, or a separate "Ready for Buyer Confirmation" lane that is
  always visible (even when empty, with explicit empty-state copy).
- P3. The `Investigate` affordance must be product-grade: clicking it
  produces a meaningful read-only context view, with tests asserting that
  no DB or Meta write occurs from that path.
- P4. Direct-actionability evidence must be either workspace-rendered
  (preferred) or replaced with deterministic end-to-end tests that prove
  review-only Scale and high-spend Cut rank above direct Protect/Test More
  in a constructed workspace. Fixture-backed sorting tests alone are not
  sufficient for product-ready.
- P5. A second supervised operator session, after UI iteration, must
  produce a first-glance clarity score materially above 85% and must
  record zero blocking buyer hesitations on Scale, Diagnose, and buyer-
  confirmation meaning.
- P6. Diagnose volume must be reviewed. 193 of 303 rows in Diagnose First
  is a large mass even when collapsed. Either the resolver narrows what
  qualifies as Diagnose, or the surface explicitly presents Diagnose as
  a triage backlog rather than the primary buyer panel.
- P7. Write-safety must be enforced by automated tests on the v2 preview
  endpoint and detail/open interactions, not only by manual observation:
  zero DB writes and zero Meta/platform writes from any rendered control.

## Verdict

- **Verdict:** UI_ITERATION_REQUIRED_BEFORE_CONTINUING is too strong; the
  evidence supports CONTINUE_LIMITED_READONLY_PREVIEW with a parallel UI
  iteration track. The official verdict is therefore:

  **CONTINUE_LIMITED_READONLY_PREVIEW** (with UI iteration opened in
  parallel as defined in question 12).

- **Product-ready:** NO.
- **Merge-ready:** NO.
- **Queue/apply safe:** NO. Queue/apply must remain disabled. Nothing in
  this session evidence supports turning queue/apply on. The current
  surface is read-only-safe; that is not the same as queue/apply-safe.
- **Buyer confidence score:** 72/100.

  Score rationale:
  - +30 safety (no unsafe copy, no write paths, v1 default preserved,
    inactive rows clean, off-by-default gate).
  - +20 first-glance clarity (~85%, operator gravitated to correct rows).
  - +12 Cut/Refresh clarity (positive operator read).
  - +10 surface contract discipline (forbidden-term scans, contract
    parity, sanitization).
  - 0 Scale clarity (mismatch on `Scale-worthy = 0`).
  - 0 Diagnose action clarity (`Investigate` no-op).
  - 0 direct-actionability workspace evidence (still fixture-backed only).
  - Net: 72.

- **Top blocking UX issues (UX, not merge):**
  1. `Scale-worthy = 0` mismatch with operator's perceived scale candidate.
  2. Diagnose `Investigate` control appears interactive but does nothing
     observable.
  3. Diagnose vs buyer-confirmation / direct-actionability meaning is not
     clearly distinguished in the operator's mental model.

- **Non-blocking tracking items:**
  1. Direct-actionability row absent in the demo workspace; ordering
     evidence remains fixture-backed.
  2. Diagnose volume (193/303 rows) is large even when collapsed.
  3. Repository still contains legacy provider wording in non-product docs;
     not active blockers but should be cleaned up in a separate cycle.
  4. Local `vitest` invocation required an untracked symlink workaround;
     gate must be made repeatable from a clean checkout.

- **Recommended next step:**

  Open a small UI iteration cycle targeting Scale-worthy copy, Diagnose
  `Investigate` behavior, and Diagnose vs buyer-confirmation separation.
  Do not pause the preview. Do not request merge. After the iteration,
  conduct a second supervised operator session against the self-hosted
  runtime and self-hosted PostgreSQL DB. Re-run this buyer judgment review
  against the new session evidence before any merge or product-ready
  claim.

- **Pre-merge blockers:** M1-M7 above.
- **Product-ready blockers:** P1-P7 above (in addition to all M-blockers).

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
