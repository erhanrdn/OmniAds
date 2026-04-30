# 17. Product Acceptance Criteria

Definition of product-ready: a media buyer can open Creative and answer the morning action question in 60 seconds without sorting, reverse-engineering metrics, or trusting hidden UI logic.

## MVP Acceptance

### Today Brief

- User must answer within 60s: What should I act on today, in priority order?
- Required data: `rowDecisions`, `aggregateDecisions`, priority, confidence, `missingData`.
- Exact fields rendered: priority, `buyerLabel`, `oneLine`, reason, `confidenceBand`, affected rows/family, missing-data badge.
- Fallback: if no `decisionCenter`, show "Decision Center unavailable; showing legacy Decision OS" and link drawer.
- Unacceptable behavior: generic metric summary, high confidence with missing data, or row-level `brief_variation`.
- Pass/fail: pass if top 5-7 items cover scale/cut/refresh/fix_delivery/fix_policy/diagnose_data when present and each has reason/confidence.
- Sample copy: "Fix delivery: Active ad has 0 spend and 0 impressions in the last verified 24h. Confidence medium."

### Action Board

- User must answer within 60s: Which creatives are in Scale, Cut, Refresh, Watch, Fix Delivery, Fix Policy, Diagnose?
- Required data: row `buyerAction`, priority, confidence, `oneLine`.
- Exact fields rendered: bucket, count, creative preview/name, `buyerLabel`, top reason, confidence, priority.
- Fallback: bucket disabled with explicit missing fields.
- Unacceptable behavior: UI derives bucket from V1/operator fields when `decisionCenter` exists.
- Pass/fail: pass if every visible card is from `decisionCenter.rowDecisions`.
- Sample copy: "Scale review: 12 purchases, ROAS 1.8x target. Review required."

### Creative Table

- User must answer within 60s: What is the recommendation for each row while scanning metrics?
- Required data: row identity, metrics, row decision.
- Exact fields rendered: Preview, Creative, Family, Status, Spend, CPA/ROAS, Trend, Maturity, Buyer Action, Confidence, Reason.
- Fallback: show `diagnose_data` or "legacy only" badge; never blank decision if data is missing.
- Unacceptable behavior: sorting required to see decisions, or table computes `buyerAction`.
- Pass/fail: pass if `buyerAction`/reason/confidence are visible as columns and sourced from contract.
- Sample copy: "Watch launch - new launch window - medium confidence."

### Minimal Detail Drawer

- User must answer within 60s: Why did the system say this and what is the engine root?
- Required data: full row decision engine output plus adapter output.
- Exact fields rendered: `buyerAction`, `buyerLabel`, `primaryDecision`, `actionability`, `problemClass`, `reasonTags`, `evidenceSummary`, blockers, `missingData`, confidence, maturity, priority, `nextStep`.
- Fallback: if row decision is absent, show old V1/operator fields under "Legacy Decision OS".
- Unacceptable behavior: hides engine `primaryDecision`, rewrites decision due to override, or omits missing data.
- Pass/fail: pass if every action can be traced to engine `primaryDecision` and adapter rule.
- Sample copy: "Engine: Diagnose. Buyer action: Fix Policy. Reason: disapproved_or_limited. Next: revise policy issue before performance read."

## Global Acceptance Invariants

| Criterion | Pass/fail |
|---|---|
| User can identify scale/cut/refresh/fix_delivery/fix_policy actions without sorting/filtering | Pass only if Today Brief and Action Board render above table |
| Every action has visible reason and confidence | Pass only if reason/confidence shown in all four MVP blocks |
| No high-confidence action appears when required data is missing | Pass only with adapter/data readiness tests |
| No row-level `brief_variation` | Pass only if type union and tests forbid it |
| No UI component computes decision meaning | Pass only if UI reads `decisionCenter`; static tests scan for buyerAction computation |
| Drawer explains root decision | Pass only if fields listed above are visible |

## Explicit Non-Goals

| Deferred item | Reason |
|---|---|
| Automated apply/pause/scale | V2 currently forces queue/apply false; safety not ready |
| Asset library | Not required to decide today's actions |
| Approval workflow | Separate collaboration surface |
| Timestamp comments | Requires asset/video workflow |
| PDF/Notion export | Reporting, not decision correctness |
| Client share links | Existing share flow is separate; V2.1 not needed |
| TikTok/Meta merge | Cross-channel identity is unsolved |
| Seasonality | Needs target/config model first |
| Hook library | Production planning, not MVP decision center |
