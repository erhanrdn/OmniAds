# Creative Segmentation Calibration Lab - Source Health Diagnosis

Last updated: 2026-04-23 by Codex

## Scope

This pass focused on the remaining Phase B blocker after calibration-lab setup and data-gate hardening:

- verify whether candidate-business sampling can be inflated by duplicate provider rows
- instrument the helper so a zero-row sampled business is classified instead of reported only as "zero rows"
- keep all reporting sanitized
- do not start the 10-agent media-buyer panel

## Candidate Dedupe Finding

The duplicate-candidate issue is real as a defensive concern, even though it should not appear on a clean normalized database.

What is already unique:

- `latest` snapshot selection is one row per business via `DISTINCT ON (business_id)`
- assigned-account counts are pre-aggregated per business before the join

What can still duplicate:

- `provider_connections`
- `integration_credentials`

The current candidate query joins those tables directly. If legacy drift or dirty normalized data left duplicate Meta connection rows or duplicate credential rows behind, one business can expand into multiple candidate rows and inflate eligible/sampled counts.

The helper now collapses candidate rows by `business_id` before eligibility counts are computed. The ranking preserves intended eligibility semantics:

- prefer `status = connected`
- prefer non-empty access token
- prefer assigned Meta accounts
- then prefer larger snapshot coverage and newer sync time

Added helper test coverage:

- duplicate provider rows
- duplicate credential rows
- multiplicative duplicate rows still counted as one business

## Zero-Row Source Path Diagnosis

Code-path analysis shows the remaining zero-row condition does not need to be described as a generic Decision OS failure.

### End-to-end path

1. Candidate business is selected from historical `meta_creatives_snapshots`.
2. Current eligibility is determined from Meta connection status, access token presence, and assigned Meta accounts.
3. Calibration fetches the same current creative source used by the Creative table route.
4. `getCreativeDecisionOsForRange` builds Decision OS from that source payload and aligned fixed windows.

### Important behavior

- If current creative source rows exist, Decision OS should also have rows for the same creative ids in this path.
- Commercial Truth, baseline reliability, and operator policy can cap actions, but they should not zero live creative rows.
- The current source stack can collapse provider read failures into `status = no_data`, because account-level read failures are swallowed and surfaced as empty results.

### Classification implemented in the helper

The calibration helper now records sanitized `sourceHealth` per sampled business and classifies zero-row cases into:

- `connection_or_account_mismatch`
- `provider_read_failure`
- `source_mapping_bug`
- `decision_os_mapping_filter_bug`
- `no_current_creative_activity`
- `source_no_data_unknown`
- `source_exception`

For `no_data`, the helper now probes assigned Meta accounts with a sanitized live-insights summary to distinguish:

- true no current creative activity
- provider read failure
- spend-bearing live ad rows that never become creative rows

### Current interpretation rules

- `no_connection` / `no_access_token` / `no_accounts_assigned` from the live creative source are treated as current-source eligibility mismatches, not as provider read failures.
- `tableRows > 0 && decisionOsRows = 0` remains a hard blocker, but code inspection suggests this should be rare and indicates route or identity divergence rather than normal policy filtering.
- `no_data` with spend-bearing live insight rows is treated as a real source mapping bug.
- `no_data` with no spend-bearing live rows and no failed reads is treated as true no current creative activity and may be skipped with explicit sanitized reason.

## Latest Live Gate Result

The helper was rerun live on 2026-04-23 after the candidate-selection fix.

Current artifact result:

- historical snapshot candidates inspected: 8
- unique candidate businesses: 8
- deduped duplicate rows: 0
- currently eligible candidates: 0
- skipped candidates: 8
- skipped by reason:
  - `no_current_meta_connection`: 8
  - `meta_connection_not_connected`: 0
  - `no_access_token`: 0
  - `no_accounts_assigned`: 0
- sampled candidates: 0
- sampled rows exported: 0
- active eligible zero-row candidates: 0
- gate passed: false

## Exact Zero-Row Diagnosis

The previous "eligible zero-row" blocker was a false-positive eligibility problem in the calibration helper.

What the live rerun proved:

- once candidate selection was aligned with the same current Meta integration/account resolution used by the creative source path
- the previously sampled zero-row businesses were no longer eligible candidates
- all eight historical snapshot businesses resolved to `no_current_meta_connection`

That means the remaining blocker is not an active eligible business with zero Decision OS rows.

The real state is:

- no currently Meta-connected businesses are available for calibration in the current source path
- therefore there are no valid sampled businesses to send through the Calibration Lab

## Live Verification Setup Used In This Session

The live rerun in this session used an SSH tunnel from the workstation to the production database path, with local PostgreSQL exposed at `127.0.0.1:15432`.

## meta_creative_daily Confidence Note

`meta_creative_daily` remains a confidence limitation, not the main blocker.

- Current product verification is still API/payload parity against the creative source path.
- Independent warehouse-level creative verification is unavailable while `meta_creative_daily` is empty.
- That means calibration confidence remains "API/payload parity only" until warehouse verification is added or the table is populated and cross-checked.

## Decision

Calibration Lab is still blocked.

The blocker is now precise and rerun-confirmed:

- there are zero currently eligible Meta-connected businesses in the current source path
- the earlier zero-row sampled-business blocker was caused by false-positive eligibility, not by a live Decision OS row-loss bug
