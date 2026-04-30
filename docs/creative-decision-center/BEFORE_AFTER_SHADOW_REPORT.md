# Before / After Shadow Report

Status: **NOT RUN** for live production snapshot comparison in this context pack.

Do not present V2.1 as validated until a read-only before/after shadow run compares the same creative set across current production-facing outputs and proposed V2.1 outputs.

## Required Future Inputs

- Current V1 output if production-facing
- Current operator-policy/operator-surface output if user-facing
- Current V2 preview output if available
- Current UI labels/buckets if available
- Proposed V2.1 engine decision
- Proposed deterministic buyer adapter output
- Proposed aggregate decisions
- Safe fallback if data missing

## Required Future Metrics

| metric | value |
|---|---|
| total creatives compared | TODO |
| unchanged decisions | TODO |
| safer/more specific decisions | TODO |
| aggressive changes | TODO |
| fallback_due_to_missing_data count | TODO |
| conflict count | TODO |
| diagnose_data rate | TODO |
| high confidence rate | TODO |
| missing data blockers by action | TODO |
| top 10 disagreement examples | TODO |

## Dangerous Conflicts To Flag

- before says scale/protect, after says cut
- before says cut/kill, after says scale
- after emits `fix_delivery` without status/spend24h proof
- after emits `fix_policy` without review/disapproval proof
- after emits high confidence with missing benchmark/truth
- after emits `brief_variation` row-level
- after emits hard cut for new launch without maturity

## Output Row Shape

| field | description |
|---|---|
| creativeId | anonymized or internal safe id |
| creativeName | omit or anonymize if customer-sensitive |
| familyId | safe/anonymized |
| beforePrimaryDecision | V1/operator root |
| beforeOperatorBucket | current user-facing bucket |
| beforeUserLabel | current UI label |
| v2PrimaryDecision | V2/V2.1 primary |
| afterBuyerAction | adapter output |
| afterProblemClass | V2.1 problem class |
| afterActionability | direct/review/blocked/diagnose |
| afterPriorityBand | critical/high/medium/low |
| afterConfidenceBand | high/medium/low |
| topReasonTag | deterministic top tag |
| missingData | required fields absent |
| decisionChanged | yes/no |
| changeType | same_meaning / safer_more_specific / more_aggressive / less_aggressive / fallback_due_to_missing_data / conflict / unknown |
| riskLevel | low/medium/high |
| notes | evidence and caveats |

