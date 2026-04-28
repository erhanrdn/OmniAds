# Creative Action Playbook

Media buyer quick reference for Adsecute creative verdicts.

## Decision Tree

Read the VerdictBand from left to right:

1. Phase: `TEST`, `SCALE`, `POST-SCALE`, or `NEEDS ANALYSIS`.
2. Headline: the creative state.
3. Action button: the next buyer move.
4. Readiness: ready, review required, or blocked.

If the action button is disabled or marked review, do not make a platform change before resolving the blockers.

## Test Phase

| Headline | Action | Ready | Needs review | Blocked |
| --- | --- | --- | --- | --- |
| Test Winner | Promote to Scale | Move into the scale lane with the same hook, offer, and first-frame structure. | Check commercial truth, business validation, and deployment lane before moving budget. | Do not scale. Fix blocker first. |
| Test Loser | Cut Now | Pause or remove from test spend. | Confirm attribution, target pack, and buyer context before cutting. | Do not cut from incomplete truth; investigate first. |
| Test Inconclusive | Continue Testing | Keep spend controlled until evidence matures. | Continue test only after validation gaps are understood. | Stop decisioning; missing truth or source context is blocking the read. |
| Needs Diagnosis | Investigate | Rare; use only for manual triage, not a budget move. | Collect missing context before choosing scale/test/cut. | Configure missing inputs, source truth, or business validation. |

## Scale Phase

| Headline | Action | Ready | Needs review | Blocked |
| --- | --- | --- | --- | --- |
| Scale Performer | Keep Active | Leave active; avoid unnecessary edits or resets. | Check inactive delivery, deployment lane, or validation before changing. | Do not touch until blockers are resolved. |
| Scale Underperformer | Cut Now | Reduce or pause spend according to buyer policy. | Review commercial truth, recent attribution, and business exception notes. | Investigate first; do not cut from degraded truth. |
| Scale Fatiguing | Refresh Creative | Refresh angle, format, hook, or first-frame without discarding the proven concept. | Confirm fatigue is not caused by tracking, delivery, or stock issues. | Resolve data/source blockers before refresh execution. |
| Needs Diagnosis | Investigate | Treat as an input-quality problem, not a performance action. | Review commercial truth and deployment compatibility. | Fix blocker before budget or creative edits. |

## Post-Scale Phase

| Headline | Action | Ready | Needs review | Blocked |
| --- | --- | --- | --- | --- |
| Scale Fatiguing | Refresh Creative | Ship a refresh while preserving winning learnings. | Validate recent-vs-long-window decay and commercial truth. | Do not refresh until source truth is usable. |
| Scale Underperformer | Cut Now | Retire or reduce spend when break-even miss is clear. | Confirm business exceptions before cutting. | Investigate source/business blockers first. |
| Scale Performer | Keep Active | Keep stable revenue contributor live. | Check why readiness is not ready before making changes. | Resolve blocker first. |
| Needs Diagnosis | Investigate | Triage data, business validation, and deployment compatibility. | Same as ready; no budget move yet. | Configure missing inputs before action. |

## Phase Transitions

A creative moves out of test when one of these signals is present:

- Campaign family or lane explicitly indicates scale.
- Naming convention indicates scale (`SCALE_`, `S_`, `CBO_`, `ABO_`).
- Spend and maturity cross the resolver threshold: high spend relative to median, active delivery, and enough purchases.
- Fatigue can move a scale or scale-like creative into post-scale.

## When To Trust The Verdict

- High confidence, no blockers: use the action as the buyer default.
- Medium confidence with `needs_review`: validate business context before platform changes.
- Low confidence or `blocked`: treat as diagnostic work, not a budget decision.
- `Break-even: median proxy`: the action is still useful, but a configured target pack would make it more commercially trustworthy.

## When To Override

Override is allowed when a human buyer has material context Adsecute does not have:

- Brand, awareness, or launch campaign goals intentionally tolerate weaker direct ROAS.
- Recent ROAS is distorted by tracking downtime, catalog issues, stockouts, or landing-page outages.
- A creative is part of a planned holdout, geo test, or seasonal sequence.

When overriding, record the reason in notes so the next audit can distinguish policy drift from intentional buyer judgment.

## No-Write Rule

VerdictBand captures buyer intent. Platform mutations require an explicit execution workflow. Do not treat a visible action button as permission to bypass review, commercial truth, or account-specific governance.
