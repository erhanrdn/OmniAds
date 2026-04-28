# Diagnose Volume / Framing Audit

CHATGPT_REVIEW_READY: YES
SANITIZED: YES

# Source

Existing sanitized live audit:

`docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`

No self-hosted DB query was rerun in this hardening pass.

# Summary

The live audit has 303 preview rows. Diagnose remains the dominant decision
class:

| Decision | Rows |
| --- | ---: |
| Scale | 1 |
| Cut | 15 |
| Refresh | 37 |
| Protect | 17 |
| Test More | 40 |
| Diagnose | 193 |

# Diagnose Classes

The v2 preview surface groups Diagnose rows into these classes:

| Rank | Class | Rows | Buyer framing |
| ---: | --- | ---: | --- |
| 1 | insufficient-signal | 96 | Needs more reliable evidence before buyer action |
| 2 | data-quality | 51 | Source/trust quality must be checked first |
| 3 | inactive_creative | 45 | Inactive/context status must be reviewed before action |
| 4 | campaign-context | 1 | Campaign/ad set context blocks direct buyer action |

Only four Diagnose classes are present, so there is no fifth class to report.

# Grouping Recommendation

For WIP preview, UI framing is enough:

- Keep Diagnose collapsed by default.
- Keep Diagnose visually separate from Ready for Buyer Confirmation.
- Show class counts before row detail.
- Keep row-level detail read-only.
- Do not mix Diagnose rows into confirmation/action lanes.
- In future product work, add filters for Diagnose class and spend band.

# Resolver Policy Check

No class shows an aggregate buyer defect that justifies silent resolver tuning:

- `insufficient-signal` maps to Test More only when positive probe evidence is
  reliable enough; the current class name indicates that evidence is not enough.
- `data-quality` should remain Diagnose until trust/source quality is resolved.
- `inactive_creative` should remain separated unless refresh/cut evidence is
  strong enough for review-only placement.
- `campaign-context` should remain Diagnose until campaign/ad set context is
  reviewed.

No resolver threshold changed in this pass.

# Product-Ready Blocker Status

Accepted for the 2026-04-28 read-only default-visible promotion. Diagnose
volume remains large, but the surface keeps Diagnose collapsed, visually
separate from Ready for Buyer Confirmation, grouped by problem class, and
read-only. Future product work can add class/spend filters or resolver tuning,
but Diagnose volume is no longer a blocker for showing the current buyer surface
on the normal Creative page.
