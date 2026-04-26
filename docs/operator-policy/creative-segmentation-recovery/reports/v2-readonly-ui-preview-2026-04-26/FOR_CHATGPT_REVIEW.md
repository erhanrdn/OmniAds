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

This is stacked on PR #78 resolver branch and depends on PR #79 contract
v0.1.1. It does not replace v1 Creative Decision OS, does not feed Command
Center, does not create work items, and does not enable any platform write
behavior.

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
| Scale-worthy | 1 |
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
- Investigate
- See blocker
- Compare evidence

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
- `node --import tsx scripts/creative-decision-os-v2-gold-eval.ts`
- `git diff --check`
- Hidden/bidi/control scan:

```bash
git ls-files -mo --exclude-standard -z |
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
| `npm test` | passed, 305 files, 2186 tests |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed |
| Focused Creative/v2 preview tests | passed, 6 files, 33 tests |
| v2 gold eval | macro F1 97.96, severe 0, high 0, medium 2, low 0 |
| `git diff --check` | passed |
| Hidden/bidi/control scan | passed |
| Strict non-ASCII scan on added/removed diff lines | passed |
| Restricted filename scan | passed |
| Secret/raw-ID scan | passed |
| Line-length/readability check | passed |

# GitHub active file warning status

After pushing the PR #81 update, active GitHub PR file blobs were fetched through
the GitHub PR files API and raw blob URLs.

Active PR #81 file scan:

| File class | Result |
| --- | --- |
| Hidden/bidi/control codepoints | none found |
| Local `FOR_CHATGPT_REVIEW.md` line count | 446 |
| Local `authenticated-preview-screen-notes.md` line count | 92 |
| Local `lib/creative-decision-os-v2-preview.ts` line count | 650 |
| Local `lib/creative-decision-os-v2-preview.test.tsx` line count | 155 |
| Local `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` line count | 509 |

`app/(dashboard)/creatives/page.tsx` has existing non-ASCII UI text outside this
patch's added lines. The strict non-ASCII scan on added/removed diff lines
passed, so this update did not introduce new non-ASCII text.

Active PR #79 file blobs were also checked after the v0.1.1 contract parity
fix. Hidden/bidi/control codepoints were not found in active PR #79 files.

If GitHub still shows a hidden/bidirectional Unicode warning in the PR
conversation after these active blob checks, it is not explained by the current
active file contents scanned here.

# Preview validation

Authenticated local/dev preview validation completed.

Artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-readonly-ui-preview-2026-04-26/authenticated-preview-screen-notes.md`

Validation environment:

- Local DB-configured dev server.
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` were configured for the shell.
- Environment values, connection details, browser state, and session values are
  omitted from committed artifacts.
- Authenticated demo workspace session.

The authenticated demo workspace initially had no latest v1 Creative Decision
OS snapshot, so the v2 preview endpoint correctly returned no payload. The
existing v1 Creative Decision OS analysis endpoint was run once for that
authenticated demo workspace to create the prerequisite v1 snapshot.

This did not add a v2 write path. The v2 preview endpoint remained read-only,
and the v2 preview detail/open interaction captured zero app write requests.

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
  "writesDuringDetailClick": 0
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

Screenshots were not committed because the validation artifact is a sanitized
screen-note report with DOM assertions and no raw private visual data.

# Known risks

- The preview endpoint currently derives v2 rows from the latest v1 Creative
  Decision OS snapshot, so the preview appears only after v1 analysis exists for
  the selected scope.
- This branch is stacked on PR #78 and should be reviewed against that branch for an isolated UI diff.

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
