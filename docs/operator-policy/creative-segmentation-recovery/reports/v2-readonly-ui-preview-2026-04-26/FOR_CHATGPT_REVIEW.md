CHATGPT_REVIEW_READY: YES
ROLE: CODEX_WIP_IMPLEMENTATION
BRANCH: wip/creative-v2-readonly-ui-preview-2026-04-26
HEAD_COMMIT: SEE_DRAFT_PR_BODY_CURRENT_HEAD
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/FOR_CHATGPT_REVIEW.md
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Executive summary

Implemented a read-only Creative Decision OS v2 preview surface behind an
off-by-default query-param gate.

UI iteration after the completed supervised operator session is now included.
The update targets only the observed buyer UX issues: strict scale semantics,
honest Diagnose interaction affordance, and separation between Diagnose and
buyer confirmation.

This is stacked on PR #78 resolver branch and depends on PR #79 contract
v0.1.1. It does not replace v1 Creative Decision OS, does not feed Command
Center, does not create work items, and does not enable any platform write
behavior.

Infrastructure update applied: the active runtime is the self-hosted server and
self-hosted PostgreSQL database. Deprecated provider-specific deploy/check
references are not treated as active blockers for this limited read-only
preview. Generic DB connection requirements still apply.

# Active GitHub evidence correction after ChatGPT review

ChatGPT reviewed the prior closure packet and found active GitHub evidence that
contradicted the closure claims. The prior packet said hidden/bidi and
line-length/readability concerns were closed, but the GitHub files view was
reported to still warn on `app/(dashboard)/creatives/page.test.tsx`, and active
raw files were reported as too dense or collapsed.

Correction in this update:

- `app/(dashboard)/creatives/page.test.tsx` was reformatted.
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` was
  reformatted.
- `lib/creative-decision-os-v2-preview.test.tsx` now includes a hygiene test
  that fails if active preview TS/TSX/JS/JSX files collapse into one or two
  huge generated-looking lines.
- The related files requested by ChatGPT were inspected for readability.
- No behavior changed beyond formatting/readability test coverage.

Readable source metrics after correction:

| File | Lines | Max line |
| --- | ---: | ---: |
| `app/(dashboard)/creatives/page.test.tsx` | 294 | 108 |
| `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` | 595 | 118 |
| `app/(dashboard)/creatives/page.tsx` | 1268 | 196 |
| `app/api/creatives/decision-os-v2/preview/route.ts` | 119 | 105 |
| `app/api/creatives/decision-os-v2/preview/route.test.ts` | 67 | 109 |
| `lib/creative-decision-os-v2-preview.ts` | 651 | 133 |
| `lib/creative-decision-os-v2-preview.test.tsx` | 366 | 137 |
| `src/services/data-service-ai.ts` | 437 | 114 |

Hidden/bidi closure status:

- The previous false-positive exception is withdrawn until active GitHub files
  are rechecked after this formatting correction is pushed.
- If the GitHub warning is gone, M1/M2 can close normally.
- If the GitHub warning remains, the exact active file and line context must be
  documented, or the inability to reproduce it must be recorded without
  claiming closure.

PR #81 remains Draft. Product-ready: NO. Merge-ready: NO. It is not ready for
human merge consideration into PR #78 until active warnings and file hygiene
evidence are actually closed.

# UI iteration after completed operator session

Date: 2026-04-27

Claude UI iteration buyer review visibility:

- Branch:
  `review/creative-v2-ui-iteration-buyer-review-2026-04-27`
- Head commit:
  `b9f58468d1978a3b8ea3742899641db353d3dcd1`
- Draft PR creation status: not created by Codex because local `gh` is not
  authenticated. Codex did not ask for a GitHub token or secret.
- Review result accepted by ChatGPT: buyer confidence improved to 80/100,
  verdict `SECOND_OPERATOR_SESSION_REQUIRED`, product-ready NO, merge-ready NO.

Post-iteration delta validation report:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-second-operator-preview-session-2026-04-27/FOR_CHATGPT_REVIEW.md`
- Scope: delta validation only, not a full repeated operator session.
- Supervisor used the existing authenticated self-hosted OmniAds domain. Domain
  intentionally not recorded.

Merge-readiness blocker audit:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/MERGE_READINESS_BLOCKER_AUDIT.md`

Corrected merge-readiness closure packet:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/MERGE_READINESS_FINAL_CLOSURE.md`

Reason for change:

- The completed supervised operator session found first-glance clarity around
  85 percent, but the operator expected at least one promising creative while
  the preview showed `Scale-worthy = 0`.
- The Diagnose group showed an `Investigate` affordance that appeared
  interactive but had no observable behavior.
- Diagnose did not feel clearly separated from buyer confirmation or direct
  actionability.

What changed:

- The above-the-fold scale summary now says `Scale-ready` instead of
  `Scale-worthy`.
- The zero or low scale-ready state explains that the count is stricter than a
  buyer's personal sense that a creative may be promising.
- The Diagnose aggregate no longer renders a clickable-looking `Investigate`
  no-op. It renders non-clickable status copy instead.
- `Ready for Buyer Confirmation` is always rendered as a separate lane when the
  preview renders. If empty, it explicitly says there are no direct confirmation
  candidates in this workspace.
- Diagnose copy now frames the lane as investigation before buyer action, not
  as a confirmation or action queue.

Before/after copy:

| Area | Before | After |
| --- | --- | --- |
| Scale summary label | `Scale-worthy` | `Scale-ready` |
| Scale empty/strict-state copy | none | `No scale-ready creative cleared the evidence bar yet. Promising creatives may still appear under Protect, Test More, or Today Priority until recent evidence is strong enough.` |
| Diagnose aggregate affordance | clickable-looking `Investigate` | non-clickable `Needs investigation before buyer action` |
| Diagnose lane explanation | `Collapsed by default and grouped by blocker or problem class.` | `Needs investigation before buyer action. This is not buyer confirmation.` |
| Buyer confirmation empty state | omitted when empty | `No direct confirmation candidates in this workspace.` |

Tests run after the UI iteration:

- `npx vitest run lib/creative-decision-os-v2-preview.test.tsx app/'(dashboard)'/creatives/page.test.tsx app/api/creatives/decision-os-v2/preview/route.test.ts`
  - Result: passed, 3 files, 17 tests.
- `npm test`
  - Result: passed, 305 files, 2193 tests.
- `npm run build`
  - Result: passed.
- `npx tsc --noEmit`
  - Result: passed when rerun sequentially after build. The first attempt was
    invalid because it ran concurrently with build while `.next/types` was
    changing.
- Focused Creative/v2 preview command:
  ```bash
  npx vitest run \
    lib/creative-decision-os-v2.test.ts \
    lib/creative-decision-os-v2-preview.test.tsx \
    components/creatives/CreativeDecisionSupportSurface.test.tsx \
    components/creatives/CreativesTableSection.test.tsx \
    'app/(dashboard)/creatives/page.test.tsx' \
    app/api/creatives/decision-os-v2/preview/route.test.ts
  ```
  - Result: passed, 6 files, 40 tests.

New or updated test coverage:

- v2 preview remains off by default and only enables with the query flag.
- v1 remains visible/default when the v2 preview flag is enabled.
- Forbidden rendered button/text scan remains active.
- Forbidden internal artifact scan remains active.
- `Scale-ready` strict-state copy is rendered and `Scale-worthy` is not.
- Diagnose and `Ready for Buyer Confirmation` render as distinct concepts.
- Empty buyer-confirmation state is explicit.
- The Diagnose aggregate `Investigate` no-op button is not rendered.
- The preview component has no DB, Meta, Command Center, fetch, insert, update,
  delete, or SQL wiring.
- Deterministic ordering coverage now verifies that review-only Scale and
  high-spend Cut rank above direct Protect/Test More rows.

Authenticated preview validation after the UI iteration:

- Local dev server started on `http://localhost:3000`.
- The server loaded `.env.local`; environment values were not printed.
- Runtime target remains local app plus self-hosted PostgreSQL DB connection.
- Automated authenticated DOM validation could not be completed by Codex in
  this pass because the local automation session did not have existing
  authenticated browser state, `/api/auth/demo-login` redirected to login
  without returning a local auth credential, and macOS Computer Use access
  returned an Apple Events permission error.
- No screenshots, raw account names, creative names, auth credentials, tokens,
  DB URLs, or server details were committed.
- Because authenticated DOM validation was blocked after the UI iteration,
  self-hosted runtime validation must be repeated with the supervisor's
  already-authenticated local browser session before any merge-readiness claim.

Remaining risks:

- Product-ready remains NO.
- Merge-ready remains NO.
- The completed operator session can continue as limited read-only preview
  evidence, but the post-iteration authenticated runtime check is still open.
- The authenticated workspace did not contain a direct-actionability row during
  the completed operator session. The new deterministic test is supporting
  evidence, not a replacement for production buyer evidence.
- The UI now clarifies scale semantics, but a senior buyer review should still
  confirm whether `Scale-ready` removes the operator's previous confusion.

Merge-readiness blockers still open:

- GitHub hidden/bidi warning banners must be zero or explicitly closed with
  evidence.
- Historical hidden/bidi warnings on PR #79 and PR #81 must be documented or
  closed.
- Self-hosted runtime validation must be repeated after this UI iteration.
- The vitest clean-checkout repeatability issue must be fixed.
- Open Codex/GitHub review threads on PR #78, #79, #80, and #81 must be zero or
  explicitly resolved.
- Forbidden-term scan must remain a hard merge gate.
- Claude/senior buyer review after this Codex update is still required.

Confirmations:

- PR #81 remains Draft.
- Product-ready: NO.
- Merge-ready: NO.
- No merge was requested.
- No push to main was performed.
- v1 remains default.
- Queue/apply remains disabled.
- Command Center remains disconnected.
- No DB writes from v2 preview interactions were added.
- No Meta/platform writes were added.
- Deprecated Vercel/Neon checks are not treated as active blockers.
- Active runtime validation refers only to local/self-hosted app plus
  self-hosted PostgreSQL DB.

# Lane separation polish after second delta validation

Date: 2026-04-27

What changed:

- Added subtle lane markers and left-border accents to visually separate:
  - Today Priority
  - Ready for Buyer Confirmation
  - Buyer Review
  - Diagnose First
  - Inactive Review
- Added a `Review lanes` divider before the stacked review sections.
- Added non-action lane labels:
  - `Highest urgency`
  - `Confirmation lane`
  - `Decision review`
  - `Investigation lane`
  - `Muted lane`

Why it changed:

- The post-iteration delta validation found that Ready for Buyer Confirmation
  was understandable and separate from Diagnose, but stacked sections still felt
  visually similar.
- This is a small read-only visual polish to reduce confusion between
  confirmation and investigation.

Behavioral confirmations:

- No resolver logic changed.
- No thresholds changed.
- No decision labels changed.
- No v1 behavior changed.
- No queue/apply behavior was added.
- No Command Center wiring was added.
- No DB write path was added.
- No Meta/platform write path was added.
- No unsafe action copy was added.

Authenticated DOM validation after lane polish:

- Completed through short supervisor-assisted natural-language runtime
  validation.
- Supervisor used the existing authenticated self-hosted OmniAds site. Domain
  intentionally not recorded.
- Lane separation is much better.
- Ready for Buyer Confirmation and Diagnose are distinct.
- No Apply / Queue / Push / Auto / Scale now / Cut now / Approve button was
  seen.
- No unsafe action language, internal artifact language, or write behavior was
  reported.
- Non-blocking visual note: when Ready for Buyer Confirmation is empty and
  Buyer Review contains many cards, the vertical balance can still look awkward.

Checks after lane polish:

| Check | Result |
| --- | --- |
| `npm test` | passed, 305 files, 2193 tests |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed |
| Focused Creative/v2 preview tests | passed, 6 files, 40 tests |
| Clean-checkout focused v2 preview tests | passed, 3 files, 16 tests |
| v2 gold eval | not rerun in this formatting correction; resolver logic unchanged from prior pass |
| JSON parse checks for report JSON files | passed, 8 files |
| `git diff --check` | passed |
| Hidden/bidi/control scan | passed |
| Strict non-ASCII scan | passed |
| Restricted filename scan | passed |
| Secret/raw-ID scan | passed |
| Line-length/readability scan | passed |

Merge-readiness blocker table:

| Blocker | Status |
| --- | --- |
| PR #81 Draft only | still required |
| Product-ready | NO |
| Merge-ready | NO |
| Hidden/bidi active warning | open pending post-format GitHub files-view verification |
| Historical PR #79/#81 hidden warning closure | open pending post-format GitHub files-view verification |
| Review threads | closed by public API evidence |
| Full authenticated DOM validation after lane polish | closed |
| Direct-actionability workspace evidence | product-ready tracking |
| Clean-checkout repeatability | passed for focused v2 preview tests |
| Active source file readability | corrected by formatting update; must be confirmed after push |

No blocker is being silently ignored.

Final recommendation:

- Keep PR #81 Draft unless the owner explicitly changes it.
- Product-ready: NO.
- Merge-ready to main: NO.
- Ready for human merge consideration into the PR #78 branch: NO until the
  active GitHub warning/readability evidence is closed after this formatting
  correction.

# Dependencies

- Resolver dependency: `wip/creative-decision-os-v2-baseline-first-2026-04-26`
- Surface contract dependency:
  `review/creative-v2-operator-surface-contract-2026-04-26`
- Surface contract commit:
  `d0c326d3051510df74a7ef063bbd3e93d127a8f2`
- Contract version: `v0.1.1`
- Contract JSON path:
  `docs/operator-policy/creative-segmentation-recovery/reports/v2-operator-surface-contract-2026-04-26/surface-contract-v0.1.1.json`
- Intended PR base: `wip/creative-decision-os-v2-baseline-first-2026-04-26`

The contract JSON forbidden button language includes the required parity terms:

- `Auto-*`
- `Push live`
- `Push to review queue`

# Files changed

- `app/(dashboard)/creatives/page.tsx`
- `app/(dashboard)/creatives/page.test.tsx`
- `app/api/creatives/decision-os-v2/preview/route.ts`
- `app/api/creatives/decision-os-v2/preview/route.test.ts`
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`
- `lib/creative-decision-os-v2-preview.ts`
- `lib/creative-decision-os-v2-preview.test.tsx`
- `src/services/data-service-ai.ts`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/authenticated-preview-screen-notes.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/PR_REVIEW_CLEANUP_AUDIT.md`

# Feature gate

The preview is off by default.

Enable with either query parameter:

- `?creativeDecisionOsV2Preview=1`
- `?v2Preview=1`

When the flag is absent, the Creative page does not request the v2 preview endpoint and does not render the v2 surface.

# API/data path

Added read-only endpoint:

- `GET /api/creatives/decision-os-v2/preview`

Response field:

- `decisionOsV2Preview`

Client state:

- `creativeDecisionOsV2Preview`

The endpoint reads the latest v1 Creative Decision OS snapshot, transforms rows
through the PR #78 v2 resolver, and returns a separate preview payload. It does
not write to DB and does not save a new snapshot.

# UI components

Added separate component:

- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`

The existing `CreativeDecisionSupportSurface` and v1 `creativeDecisionOs` object are not replaced.

# v1/default behavior

- v1 remains the default Creative page behavior.
- v1 `creativeDecisionOs` is still passed to the existing top section, table, detail experience, and drawer.
- v2 preview renders only when the query-param gate is enabled.
- No Command Center, work-item, queue, apply, or Meta write path was added.

# Surface model implemented

Implemented v0.1.1 buckets:

- Today Priority / Buyer Command Strip
- Ready for Buyer Confirmation
- Buyer Review split by decision
- Diagnose First collapsed by default
- Inactive Review collapsed by default

Direct actionability is treated only as a confidence/safety signal, not buyer urgency.

# Bucket distribution from live-audit fixture

Source fixture:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`

Rows: 303

Decision distribution:

| Decision | Count |
| --- | ---: |
| Scale | 1 |
| Cut | 15 |
| Refresh | 37 |
| Protect | 17 |
| Test More | 40 |
| Diagnose | 193 |

Actionability distribution:

| Actionability | Count |
| --- | ---: |
| direct | 2 |
| review_only | 108 |
| blocked | 0 |
| diagnose | 193 |

Preview bucket counts:

| Bucket | Count |
| --- | ---: |
| Today Priority / Buyer Command Strip | 32 |
| Ready for Buyer Confirmation | 2 |
| Buyer Review | 108 |
| Diagnose First | 193 |
| Inactive Review | 70 |

Above-the-fold model:

| Question | Count |
| --- | ---: |
| Bleeding spend | 15 |
| Scale-ready | 1 |
| Fatiguing on budget | 13 |
| Leave alone | 17 |
| Needs diagnosis | 193 |

# Top 20 highest-spend placement

| Row | Spend | v2 decision | Actionability | Buckets |
| --- | ---: | --- | --- | --- |
| company-05...creative-46 | 124046.89 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-47 | 61027.88 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-48 | 57588.45 | Cut | review_only | Today Priority, Buyer Review, Inactive Review |
| company-05...creative-49 | 33858.47 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-50 | 33045.48 | Diagnose | diagnose | Diagnose First, Inactive Review |
| company-05...creative-51 | 29265.56 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-52 | 28450.98 | Diagnose | diagnose | Today Priority, Diagnose First, Inactive Review |
| company-05...creative-53 | 26077.54 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-54 | 25506.30 | Cut | review_only | Today Priority, Buyer Review, Inactive Review |
| company-05...creative-55 | 23522.86 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-56 | 16255.87 | Refresh | review_only | Buyer Review, Inactive Review |
| company-05...creative-01 | 13373.07 | Protect | review_only | Buyer Review |
| company-05...creative-57 | 12644.77 | Cut | review_only | Today Priority, Buyer Review, Inactive Review |
| company-05...creative-02 | 10118.73 | Scale | review_only | Today Priority, Buyer Review |
| company-05...creative-03 | 10022.46 | Cut | review_only | Today Priority, Buyer Review |
| company-05...creative-04 | 8765.22 | Protect | review_only | Buyer Review |
| company-08...creative-01 | 8295.35 | Refresh | review_only | Today Priority, Buyer Review |
| company-05...creative-05 | 6991.75 | Test More | review_only | Buyer Review |
| company-05...creative-06 | 6686.77 | Cut | review_only | Today Priority, Buyer Review |
| company-05...creative-07 | 6314.72 | Cut | review_only | Today Priority, Buyer Review |

# Top 20 highest-risk placement

| Row | Current -> v2 | Spend | Risk | Actionability | Buckets |
| --- | --- | ---: | --- | --- | --- |
| company-05...creative-02 | Protect -> Scale | 10118.73 | high | review_only | Today Priority, Buyer Review |
| company-08...creative-01 | Cut -> Refresh | 8295.35 | high | review_only | Today Priority, Buyer Review |
| company-08...creative-02 | Cut -> Refresh | 4365.02 | high | review_only | Today Priority, Buyer Review |
| company-06...creative-01 | Cut -> Refresh | 1701.51 | high | review_only | Today Priority, Buyer Review |
| company-01...creative-02 | Test More -> Refresh | 833.63 | high | review_only | Today Priority, Buyer Review |
| company-05...creative-48 | Refresh -> Cut | 57588.45 | high | review_only | Today Priority, Buyer Review, Inactive Review |
| company-05...creative-54 | Diagnose -> Cut | 25506.30 | high | review_only | Today Priority, Buyer Review, Inactive Review |
| company-07...creative-01 | Cut -> Refresh | 2251.40 | medium | review_only | Today Priority, Buyer Review |
| company-08...creative-03 | Cut -> Refresh | 1327.85 | medium | review_only | Today Priority, Buyer Review |
| company-08...creative-06 | Diagnose -> Refresh | 602.20 | medium | review_only | Today Priority, Buyer Review |
| company-07...creative-07 | Refresh -> Diagnose | 277.11 | high | diagnose | Today Priority, Diagnose First |
| company-05...creative-05 | Diagnose -> Test More | 6991.75 | medium | review_only | Buyer Review |
| company-05...creative-08 | Cut -> Diagnose | 5601.19 | medium | diagnose | Diagnose First |
| company-05...creative-10 | Refresh -> Diagnose | 4489.74 | medium | diagnose | Diagnose First |
| company-05...creative-12 | Cut -> Test More | 4336.30 | medium | review_only | Buyer Review |
| company-04...creative-02 | Diagnose -> Refresh | 151.25 | high | review_only | Today Priority, Buyer Review |
| company-05...creative-14 | Cut -> Test More | 3637.07 | medium | review_only | Buyer Review |
| company-03...creative-05 | Diagnose -> Refresh | 132.06 | high | review_only | Today Priority, Buyer Review |
| company-05...creative-18 | Cut -> Diagnose | 2400.62 | medium | diagnose | Diagnose First |
| company-05...creative-20 | Cut -> Diagnose | 1368.36 | medium | diagnose | Diagnose First |

# Button and text policy

Rendered preview uses only non-writing button/link labels:

- Open detail
- View diagnosis
- See blocker
- Compare evidence

The Diagnose aggregate now renders non-clickable status copy instead of a
clickable-looking `Investigate` no-op.

No platform-write button language is rendered by the v2 preview.

# Forbidden scan results

Product preview output scan:

- Forbidden button/text scan: passed in `lib/creative-decision-os-v2-preview.test.tsx`
- Forbidden internal-artifact scan: passed in `lib/creative-decision-os-v2-preview.test.tsx`
- Contract parity scan: passed. The rendered-output scan includes
  `Auto-*`, `Push live`, `Push to review queue`, `Apply`, `Queue`,
  `Scale now`, `Cut now`, `Approve`, and `Product-ready`.

Forbidden rendered terms scanned:

- Apply
- Apply now
- Auto apply
- Auto-*
- Queue
- Queue now
- Push live
- Push to review queue
- Scale now
- Cut now
- Launch
- Budget increase
- Approve
- Accepted
- Direct scale
- Product-ready
- gold
- fixture
- PR
- ChatGPT
- Claude
- Codex
- WIP
- internal evaluation

# Tests and checks

Commands run:

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- Focused Creative/v2 preview tests:

```bash
npx vitest run \
  lib/creative-decision-os-v2.test.ts \
  lib/creative-decision-os-v2-preview.test.tsx \
  components/creatives/CreativeDecisionSupportSurface.test.tsx \
  components/creatives/CreativesTableSection.test.tsx \
  'app/(dashboard)/creatives/page.test.tsx' \
  app/api/creatives/decision-os-v2/preview/route.test.ts
```
- v2 gold eval was not rerun in this formatting correction because no resolver
  logic changed; the prior pass remains historical evidence.
- `git diff --check`
- GitHub connector review-thread/comment/review inspection for PR #78, #79,
  #80, and #81
- GitHub PR files API plus raw blob hidden/bidi/control scan for PR #79 and
  PR #81
- GitHub PR `.diff` and `.patch` hidden/bidi/control scan for PR #79 and
  PR #81
- Infrastructure reference audit for deprecated provider-specific wording and
  generic DB connection requirements
- Hidden/bidi/control scan on tracked text/source files:

```bash
git ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.md' '*.json' '*.css' '*.mjs' '*.cjs' |
  xargs -0 perl -ne 'print "$ARGV:$.:$_" if /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{202A}-\x{202E}\x{2066}-\x{2069}]/'
```

- Strict non-ASCII scan on added/removed diff lines:

```bash
git diff -U0 -- . |
  perl -ne 'print if /^[+-](?![+-])/' |
  perl -ne 'print if /[^\x00-\x7F]/'
```

- Restricted filename scan:

```bash
git ls-files -mo --exclude-standard |
  grep -E '(^|/)\.env($|\.)|\.env($|\.)|summary\.env$|(^|/)(c[o]okies|t[o]kens|s[e]crets)(/|$)' || true
```

- Secret/raw-ID scan:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.next/**' \
  'postg[r]es://|postgresq[l]://|D[A]TABASE_URL=|r[o]ot@|access[_]token|refresh[_]token|client[_]secret|c[o]okie|sessio[n]=' \
  docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26 \
  app/api/creatives/decision-os-v2 \
  components/creatives/CreativeDecisionOsV2PreviewSurface.tsx \
  lib/creative-decision-os-v2-preview.ts \
  lib/creative-decision-os-v2-preview.test.tsx
```

- Line-length/readability check:

```bash
git ls-files -mo --exclude-standard |
  xargs awk 'length($0) > 240 { print FILENAME ":" FNR ":" length($0) }'
```

- Readability test:
  `lib/creative-decision-os-v2-preview.test.tsx` fails if large v2 preview
  source, test, or report files are compressed into suspiciously few lines.

Results:

| Check | Result |
| --- | --- |
| `npm test` | passed, 305 files, 2193 tests |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed |
| Focused Creative/v2 preview tests | passed, 6 files, 40 tests |
| v2 gold eval | not rerun in this formatting correction; resolver logic unchanged from prior pass |
| `git diff --check` | passed |
| Hidden/bidi/control scan | passed |
| Strict non-ASCII scan on added/removed diff lines | passed |
| Restricted filename scan | passed |
| Secret/raw-ID scan | passed |
| Line-length/readability check | passed |

# GitHub active file warning status

The prior version of this section over-claimed closure. It is retained as
historical context only and is superseded by the active GitHub evidence
correction above.

After the earlier PR #81 update, active GitHub PR file blobs were fetched
through the GitHub PR files API and raw blob URLs.

Active PR #81 file scan:

| File class | Result |
| --- | --- |
| Hidden/bidi/control codepoints | none found |
| Local `FOR_CHATGPT_REVIEW.md` line count | 634 |
| Local `authenticated-preview-screen-notes.md` line count | 117 |
| Local `lib/creative-decision-os-v2-preview.ts` line count | 650 |
| Earlier local `lib/creative-decision-os-v2-preview.test.tsx` line count | 297 |
| Earlier local `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` line count | 525 |

`app/(dashboard)/creatives/page.tsx` has existing non-ASCII UI text outside this
patch's added lines. The strict non-ASCII scan on added/removed diff lines
passed, so this update did not introduce new non-ASCII text.

Active PR #79 file blobs were also checked after the v0.1.1 contract parity
fix. Hidden/bidi/control codepoints were not found in active PR #79 files.

ChatGPT later reported that active GitHub evidence still showed a warning and
readability problems. Therefore this earlier scan is not treated as closure.
This update reformats the active source files and requires another post-push
GitHub files-view check before hidden/bidi or readability blockers can close.

# Previous preview validation before UI iteration

Authenticated local/dev preview validation completed again on
2026-04-26T21:11:23Z.

This section records the authenticated validation from the original PR #81
preview implementation. The 2026-04-27 UI iteration attempted a fresh
authenticated browser validation, but local automation did not have an
authenticated browser state and demo login did not return a local auth
credential. That post-iteration runtime check remains open and is documented in
the UI iteration section above.

Artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/authenticated-preview-screen-notes.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/PR_REVIEW_CLEANUP_AUDIT.md`

Validation environment:

- Local DB-configured dev server.
- Standard self-hosted PostgreSQL connection variables were configured for the
  shell and values were not printed.
- Environment values, connection details, browser state, and session values are
  omitted from committed artifacts.
- Authenticated demo workspace session.

The authenticated demo workspace had a latest v1 Creative Decision OS snapshot
available from prior validation, so the v2 preview rendered from that existing
snapshot.

This did not add a v2 write path. The v2 preview endpoint remained read-only,
and the v2 preview detail/open interaction captured zero app write requests.

No-flag result:

```json
{
  "previewCount": 0,
  "v1Visible": true,
  "forbiddenVisible": 0,
  "internalVisible": 0,
  "writeRequests": []
}
```

Sanitized DOM validation result:

```json
{
  "authenticated": true,
  "businessCount": 1,
  "activeBusinessPresent": true,
  "previewCount": 1,
  "v1Visible": true,
  "todayPriorityVisible": 1,
  "todayPriorityMentionsScale": true,
  "todayPriorityMentionsCut": true,
  "todayPriorityMentionsRefresh": true,
  "diagnoseDetailsCount": 1,
  "diagnoseOpenCount": 0,
  "inactiveDetailsCount": 1,
  "inactiveOpenCount": 0,
  "forbiddenVisible": 0,
  "internalVisible": 0,
  "safeActionButtonsVisible": 6,
  "writesDuringDetailClick": 0,
  "previewRowCount": 8,
  "directActionabilityRowCount": 0,
  "todayPriorityRowCount": 3,
  "readyConfirmationRowCount": 0
}
```

Required preview checks:

| Check | Result |
| --- | --- |
| Creative page authenticated | passed |
| `[data-testid="creative-v2-preview-surface"]` rendered | passed |
| v1 remained visible | passed |
| Today Priority rendered | passed |
| Diagnose collapsed/grouped by default | passed |
| Inactive Review collapsed by default | passed |
| Forbidden action language visible | 0 |
| Internal artifact terms visible | 0 |
| Safe detail/open interaction app writes | 0 |
| No-flag v2 preview rendered | 0 |
| With-flag v2 preview rendered | 1 |

Screenshots were not committed because the validation artifact is a sanitized
screen-note report with DOM assertions and no raw private visual data.

The authenticated demo workspace still has no direct-actionability row, so
visual proof of review-only Scale and high-spend Cut ranking above direct
Protect or Test More is not available from this workspace. The fixture-backed
sort test remains the supporting evidence. This is tracked in
`PR_REVIEW_CLEANUP_AUDIT.md` as a non-blocking observation for limited preview.

# Known risks

- The preview endpoint currently derives v2 rows from the latest v1 Creative
  Decision OS snapshot, so the preview appears only after v1 analysis exists for
  the selected scope.
- This branch is stacked on PR #78 and should be reviewed against that branch for an isolated UI diff.
- Active GitHub files-view warning/readability evidence must be rechecked after
  this formatting correction. PR #81 remains not merge-ready until that is
  closed honestly.

# Confirmations

- This is WIP and not merge-requested.
- No push to main was performed.
- No merge was performed.
- No UI/API code replaces v1 Creative Decision OS.
- No Command Center or work-item wiring was added.
- No queue/apply/write behavior was added.
- v2 preview interactions do not write to DB or Meta.
- v2 preview is off by default.
- Committed report content uses sanitized row aliases only.
