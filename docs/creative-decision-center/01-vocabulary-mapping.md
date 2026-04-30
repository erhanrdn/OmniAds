# Creative Decision Center V2.1 Vocabulary Mapping

## Import Graph Summary

| Imported module | Current importers |
|---|---|
| `lib/creative-decision-os.ts` | Service/API layers, command center, snapshot helpers, V2 preview, historical intelligence, AI legacy generator, source/linkage helpers, Creative page/components/tests/scripts |
| `lib/creative-decision-os-v2.ts` | `lib/creative-decision-os-v2-preview.ts`, `lib/creative-decision-os-v2-evaluation.ts`, `scripts/creative-decision-os-v2-live-audit.ts`, tests |
| `lib/creative-operator-policy.ts` | `lib/creative-decision-os.ts`, `lib/creative-media-buyer-scoring.ts`, tests, audit scripts |
| `lib/creative-operator-surface.ts` | Creative page, page-support, drawer/content/overview/support/detail/top section, segmentation scripts/tests |
| `lib/creative-media-buyer-scoring.ts` | `lib/creative-operator-policy.ts`, tests, `scripts/creative-live-firm-audit.ts` |
| `lib/creative-old-rule-challenger.ts` | segmentation/live audit scripts and tests only |

## Four-Vocabulary Mapping

| currentTerm | currentLayer | meaning | mapsToV21PrimaryDecision | mapsToProblemClass | mapsToBuyerAction | mapsToActionability | keep/move/deprecate | notes | riskIfLost |
|---|---|---|---|---|---|---|---|---|---|
| `incubating` | V1 lifecycle | Too early | Test More | insufficient_signal | test_more/watch_launch | review_only | move | Needs launch split if launch fields exist | Medium |
| `validating` | V1 lifecycle | Learning/test phase | Test More | insufficient_signal | test_more | review_only | move | Not enough for scale/cut | Medium |
| `scale_ready` | V1 lifecycle/operator segment | Winner ready or near-ready | Scale | performance | scale | review_only | keep via adapter | V2 Scale must remain review-only | High |
| `stable_winner` | V1 lifecycle | Keep winner live | Protect | performance | protect | review_only | keep | Maps to protected state | High |
| `fatigued_winner` | V1 lifecycle/operator segment | Winner needs refresh | Refresh | fatigue | refresh | review_only | keep | Requires composite fatigue proof in V2.1 | High |
| `blocked` | V1 lifecycle/operator segment | Do not act without context | Diagnose | data_quality/campaign_context | diagnose_data | diagnose | move | Split into real problem classes | High |
| `retired` | V1 lifecycle | Inactive/old creative | Diagnose | campaign_context/insufficient_signal | diagnose_data | diagnose | move | May be comeback if history strong | Medium |
| `comeback_candidate` | V1 lifecycle | Historical winner to retest | Refresh | creative | refresh | review_only | move | Row-level refresh/retest, not supply aggregate | Medium |
| `promote_to_scaling` | V1 primaryAction | Scale candidate | Scale | performance | scale | review_only | keep | Do not map to direct apply | High |
| `keep_in_test` | V1 primaryAction | Needs more evidence | Test More | insufficient_signal | test_more/watch_launch | review_only | keep | Launch adapter may produce `watch_launch` | Medium |
| `hold_no_touch` | V1 primaryAction | Protect | Protect | performance | protect | review_only | keep | Stable winner handling | High |
| `refresh_replace` | V1 primaryAction | Refresh variant | Refresh | fatigue/creative | refresh | review_only | keep | Do not collapse with cut | High |
| `block_deploy` | V1 primaryAction | Stop/block | Cut or Diagnose | performance/campaign_context/data_quality | cut/diagnose_data | review_only/diagnose | move | Must not cut if policy/delivery/data issue | High |
| `retest_comeback` | V1 primaryAction | Retest old winner | Refresh | creative | refresh | review_only | move | Could become aggregate brief later | Medium |
| `new_test_concepts` | V1 supplyPlan | Need new concepts | n/a | creative_supply | aggregate only | review_only | move | Candidate for `creative_supply_warning` | Medium |
| `refresh_existing_winner` | V1 supplyPlan | Variation needed | n/a | fatigue/creative_supply | `brief_variation` aggregate | review_only | move | Must not be row-level | High |
| `expand_angle_family` | V1 supplyPlan | More angle variants | n/a | creative_supply | `brief_variation` aggregate | review_only | move | Needs backlog data | Medium |
| `revive_comeback` | V1 supplyPlan | Retest old family | Refresh | creative | refresh/brief_variation aggregate | review_only | move | Split row vs family | Medium |
| `scale` | Operator actionClass | Scale class | Scale | performance | scale | review_only | keep | Preserve safety blockers | High |
| `kill` | Operator actionClass | Kill/cut class | Cut | performance | cut | review_only | move | Buyer label should be Cut, not Kill | Medium |
| `refresh` | Operator actionClass | Refresh creative | Refresh | fatigue/creative | refresh | review_only | keep | High buyer value | High |
| `protect` | Operator actionClass | Protect winner | Protect | performance | protect | review_only | keep | High buyer value | High |
| `test` | Operator actionClass | More testing | Test More | insufficient_signal | test_more/watch_launch | review_only | keep | Launch split in adapter | Medium |
| `variant` | Operator actionClass | New variant/retest | Refresh | creative | refresh | review_only | move | Aggregate variant briefs separate | Medium |
| `monitor` | Operator actionClass | Watch | Test More/Diagnose | insufficient_signal/data_quality | test_more/diagnose_data | review_only/diagnose | move | Too vague for buyerAction | Medium |
| `contextual` | Operator actionClass | Context only | Diagnose | campaign_context/data_quality | diagnose_data | diagnose | move | Must show missing proof | High |
| `unknown` | Operator actionClass | Unknown | Diagnose | data_quality | diagnose_data | diagnose | deprecate | Use explicit missing reason | Low |
| `scale_review` | Operator segment | Review-only relative winner | Scale | performance | scale | review_only | keep | Survives as actionability, not primary action | High |
| `promising_under_sampled` | Operator segment | Positive but low sample | Test More | insufficient_signal | test_more | review_only | keep | Prevents premature scale | High |
| `false_winner_low_evidence` | Operator segment | ROAS-only/weak winner | Diagnose/Test More | insufficient_signal | diagnose_data/test_more | review_only | keep | Important guardrail | High |
| `kill_candidate` | Operator segment | Cut review | Cut | performance | cut | review_only | keep | Needs maturity/data proof | High |
| `spend_waste` | Operator segment | Waste | Cut | performance | cut | review_only | keep | High |
| `protected_winner` | Operator segment | Protect | Protect | performance | protect | review_only | keep | High |
| `hold_monitor` | Operator segment | Watch/diagnose | Test More/Diagnose | insufficient_signal/campaign_context | test_more/diagnose_data | review_only | move | Must split by reasonTags | Medium |
| `needs_new_variant` | Operator segment | Refresh/retest | Refresh | creative/fatigue | refresh | review_only | move | Do not map to row `brief_variation` | High |
| `creative_learning_incomplete` | Operator segment/reason | Low maturity | Test More | insufficient_signal | test_more | review_only | keep | High |
| `investigate` | Operator segment | Context problem | Diagnose | campaign_context/data_quality | diagnose_data | diagnose | move | Needs specific buyerAction if delivery/policy proof exists | High |
| `contextual_only` | Operator segment | Read-only context | Diagnose | data_quality | diagnose_data | diagnose | move | Preserve blockers | High |
| `review_only` | Operator subtone | Human review required | any | any | same action | review_only | keep | Becomes actionability | High |
| `queue_ready` | Operator subtone | Queue safe in V1 policy | any | any | same action | direct/review_only | keep but gated | V2 currently queue/apply false | High |
| `revive` | Operator subtone | Comeback/retest | Refresh | creative | refresh | review_only | move | Secondary label | Low |
| `manual_review` | Operator subtone | Manual review | any | any | same action | review_only/diagnose | keep | High |
| `strong_relative_winner` | Operator/V2 reason | Strong winner | Scale/Protect | performance | scale/protect | review_only | keep | Top reason | High |
| `business_validation_missing` | Operator reason | Business target missing | Scale/Test More | data_quality/performance | diagnose_data/test_more | review_only | keep | Blocks direct scale | High |
| `commercial_truth_missing` | Operator reason | Truth missing | Diagnose | data_quality | diagnose_data | diagnose | keep | High |
| `weak_benchmark` | Operator reason | Thin benchmark | Diagnose/Test More | data_quality | diagnose_data/test_more | review_only | keep | High |
| `fatigue_pressure` | Operator reason | Fatigue pressure | Refresh | fatigue | refresh | review_only | keep | Needs composite proof | High |
| `trend_collapse` | Operator reason | Trend down | Refresh/Cut | fatigue/performance | refresh/cut | review_only | keep | High |
| `catastrophic_cpa` | Operator reason | CPA blowout | Cut | performance | cut | review_only | keep | Needs maturity | High |
| `below_baseline_waste` | Operator reason | Under benchmark | Cut/Test More | performance | cut/test_more | review_only | keep | High |
| `mature_zero_purchase` | Operator reason | Mature no purchases | Cut | performance | cut | review_only | keep | High |
| `campaign_context_blocker` | Operator/V2 reason | Campaign/adset context | Diagnose | campaign_context | diagnose_data | diagnose | keep | Could become fix_delivery only with proof | High |
| `preview_missing` | Operator reason | Preview truth missing | Diagnose | data_quality | diagnose_data | diagnose | keep | Medium |
| `Scale` | V2 primaryDecision | Scale candidate | Scale | performance | scale | review_only | keep | Primary engine term remains | High |
| `Cut` | V2 primaryDecision | Cut candidate | Cut | performance | cut | review_only | keep | Human review default | High |
| `Refresh` | V2 primaryDecision | Refresh candidate | Refresh | fatigue/creative | refresh | review_only | keep | High |
| `Protect` | V2 primaryDecision | Protect winner | Protect | performance | protect | review_only | keep | High |
| `Test More` | V2 primaryDecision | Need more sample | Test More | insufficient_signal/launch_monitoring | test_more/watch_launch | review_only | keep | Adapter decides launch label | High |
| `Diagnose` | V2 primaryDecision | No clean action | Diagnose | data_quality/delivery/policy/campaign_context | diagnose_data/fix_delivery/fix_policy | diagnose | keep | Adapter adds buyer specificity | High |
| `creative` | V2 problemClass | Broad creative issue | n/a | performance/creative/fatigue | by primary | by primary | deprecate broad use | Too broad for V2.1 | Medium |
| `campaign-context` | V2 problemClass | Campaign/adset blocker | n/a | campaign_context/delivery | diagnose_data/fix_delivery | diagnose | split | Need delivery proof | High |
| `data-quality` | V2 problemClass | Data/truth issue | n/a | data_quality/policy | diagnose_data/fix_policy | diagnose | split | Policy needs own class | High |
| `insufficient-signal` | V2 problemClass | Not enough evidence | n/a | insufficient_signal/launch_monitoring | test_more/watch_launch | review_only | split | Launch deserves separate class | Medium |
| `scale_hard` | Old challenger | Aggressive scale | Scale | performance | scale | review_only | deprecate user-facing | Regression only | Medium |
| `pause` | Old challenger | Soft stop | Cut/Refresh | performance/fatigue | cut/refresh | review_only | deprecate user-facing | Regression only | Low |
| `kill` | Old challenger | Hard stop | Cut | performance | cut | review_only | deprecate user-facing | Regression only | Medium |

Blunt call: the surviving buyer vocabulary should be V2 primaryDecision plus deterministic `buyerAction`. Operator segment/reason tags should remain migration inputs and drawer evidence, not another user-facing authority.
