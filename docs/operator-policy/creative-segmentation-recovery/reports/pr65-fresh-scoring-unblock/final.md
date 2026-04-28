# PR #65 Fresh Scoring Unblock

Date: 2026-04-25

Superseded on 2026-04-26 by `docs/operator-policy/creative-segmentation-recovery/reports/pr65-scoring-runtime-recovery/final.md`: current-output artifact generation is now unblocked through server-side Docker execution. Acceptance scoring remains invalid because fresh expected labels were not regenerated.

Branch: `feature/adsecute-creative-claude-fix-plan-implementation`

PR: `https://github.com/erhanrdn/OmniAds/pull/65`

## Executive Result

Fresh PR #65 acceptance scoring is still blocked by runtime/DB access, not by a new Creative policy defect.

The audit/scoring helper was hardened so it can write an explicit current-output artifact instead of failing silently, but the latest run could not regenerate valid current-code scores because the local SSH DB tunnel dropped during discovery/evaluation.

Current artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`
- `valid_for_acceptance: false`
- `validForClaudeReview: false`

No stale expected labels were used as acceptance truth.

## Timeout Diagnosis

Observed failure stages:

1. Initial rerun before this pass timed out on Meta campaign/ad set context reads.
2. The audit helper was also doing a duplicate `getMetaDecisionSourceSnapshot()` read after `getCreativeDecisionOsForRange()` had already built Decision OS delivery context.
3. After removing that duplicate audit read, the core Decision OS source path still performed broad business-level campaign/ad set context reads.
4. After narrowing the source context read to campaign IDs present in the primary Creative decision window, the audit progressed farther.
5. The remaining blocker became SSH/DB transport instability over `127.0.0.1:15432`:
   - `Connection terminated due to connection timeout`
   - `ECONNREFUSED 127.0.0.1:15432`
   - SSH tunnel session reported the app server was temporarily not responding.

The timeout happens after some runtime candidate screening and before a complete current-output artifact can be generated for the full connected cohort.

## Fixes Made

Source/read reliability only:

- `scripts/creative-live-firm-audit.ts`
  - derives active sample context from `CreativeDecisionOsCreative.deliveryContext`
  - stops re-fetching campaign/ad set source snapshots after Decision OS already resolved delivery context
  - writes `pr65-current-output-fresh.json`
  - records per-business source-read failures instead of killing the full artifact
  - writes a blocked artifact if discovery fails before rows can be generated
  - waits for local snapshot refresh tasks before restoring the audit fetch guard

- `lib/creative-decision-os-source.ts`
  - fetches primary Creative rows first
  - passes referenced campaign IDs to the Decision OS context snapshot read

- `lib/meta/operator-decision-source.ts`
- `lib/meta/campaigns-source.ts`
- `lib/meta/adsets-source.ts`
- `lib/meta/serving.ts`
- `lib/meta/warehouse.ts`
  - support campaign-ID-scoped campaign/ad set context reads

No Creative segment thresholds, taxonomy, Scale/Scale Review gates, benchmark semantics, or queue/push/apply safety changed.

## Artifact Status

`pr65-current-output-fresh.json` is intentionally blocked:

- no current rows are included
- no expected labels are included
- no acceptance score is computed
- blockers are recorded using sanitized runtime labels only

Runtime blockers recorded:

- `discovery:db_tunnel_connection_refused`
- `prior_live_run:db_tunnel_connection_timeout`
- `prior_live_run:database_query_timeout_meta_campaign_adset_context`

## Scoring Status

Fresh equal-segment scoring did not run.

Current scores are not valid for acceptance:

- macro score: not regenerated
- raw accuracy: not regenerated
- represented segment scores: not regenerated
- IwaStore / TheSwaf scores: not regenerated

Claude should not review PR #65 yet because the current-output artifact is blocked.

## Next Action

Resolve the DB tunnel/runtime access issue, then rerun:

```bash
DB_QUERY_TIMEOUT_MS=60000 CREATIVE_LIVE_FIRM_AUDIT_SCREEN_TIMEOUT_MS=60000 node --import tsx scripts/creative-live-firm-audit.ts
```

If the full cohort still runs too slowly over SSH, run the same helper in a stable runtime close to the production DB or add a supervisor-approved chunked audit invocation that marks excluded chunks as unscored.

PR #65 should remain open and unmerged until a fresh current-code artifact is valid and an independent re-score is possible.
