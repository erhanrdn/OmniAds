# ChatGPT Pro Review PR #84 Round 4

Date: 2026-04-29
Reviewed commit: `2ee4c6c` ("Close canonical resolver round 4 gates")

## Verdict

**approve allowlist activation**

All six Round 3 stop conditions are closed. Approver pre-approves Steps 1–5 of `30-canonical-promotion-runbook.md` (merge without auto-deploy, nightly snapshot confirmation, IwaStore + TheSwaf allowlist, manual deploy, seven-day allowlist observation). Steps 6–9 (25% / 50% / 100%) require fresh review after Step 5 metrics are clean.

## Round 3 stop-condition table

| # | Stop condition | Verdict | Reasoning |
|--:|---|---|---|
| 1 | H4 observability metrics live | closed | `computeOverrideRate`, distribution, histogram, fallback, queue, LLM, summary, and event recorder exist; `{value, denominator, threshold, status}` shape with denominator `<30` returning `insufficient_data`. |
| 2 | Server-side sticky business flag + kill switch <60s | closed | Kill switch resolves before blocklist/allowlist/sticky/rollout; env kill switch path; cohort assignment persists; runbook rollback starts with kill switch. |
| 3 | Manual SHA/tag deploy promotion | closed | Step 4 requires manual workflow dispatch with explicit `sha`, `require_current_main_head=true`, `run_migrations=true`, `break_glass=false`; Step 1 explicitly blocks auto-deploy-on-merge. |
| 4 | Low-AOV spend-floor severe-override tests | closed | Default `minSpendForDecision=180`; `creative-calibration-store.test.ts` covers both spend=900 (no queue) and spend=1000 (queue) at `minSpendForDecision=180`. |
| 5 | Override-event caller plumbing | closed | Integration test passes `minSpendForDecision` from resolver thresholds into `recordCreativeDecisionOverrideEvent`, produces scale→cut critical severity, validates weekly batch under business-relative floor. |
| 6 | Calibration approval template requires customer/account owner | closed | `_TEMPLATE.md` Section 7 includes Engineering, Product/media-buyer, and Customer/account owner signature rows. |

## MIN items

| Item | Verdict |
|---|---|
| MIN-1 strong-upstream zero-purchase test | present |
| MIN-2 just-below-impression-floor test | present |
| MIN-3 confidence calibration status for 20–49 | present (`thin_calibration`) |
| MIN-4 docs guard breadth + manual promotion | present |

## New issues found in Round 4

No production-blocking issue.

Two minor non-blockers:

1. Feature-flag tests do not directly assert “allowlist beats an existing sticky legacy assignment.” Code path is unambiguous; not required before allowlist activation.
2. Runbook Step 4 SHA placeholder says `7f133ba descendant`. Operator should use the actual `2ee4c6c` descendant or merge commit SHA.

## Action required from Codex

None required before allowlist activation.

Optional cleanup after activation:

- Add direct feature-flag test: existing sticky legacy + admin allowlist ⇒ `canonical-v1`.
- Update Step 4 placeholder from `7f133ba descendant` to `2ee4c6c descendant or merge commit SHA`.

## Pre-approved runbook steps

- Step 1 — merge without auto-deploy
- Step 2 — nightly snapshot confirmation
- Step 3 — IwaStore + TheSwaf allowlist activation
- Step 4 — manual deploy (workflow_dispatch with explicit SHA)
- Step 5 — seven-day allowlist observation (no percentage rollout)

## Requires fresh review / explicit go–no-go after data

- Step 6 — 25% cohort
- Step 7 — 7-day 25% observation
- Step 8 — 50% cohort
- Step 9 — 100% cohort

## Scope boundary

Allowlist activation is approved. 25% cohort is not approved in this round. Do not start H3 calibration implementation.
