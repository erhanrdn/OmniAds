# Open Questions

- What is the canonical row identity: `creative_id`, `ad_id`, asset, or family?
- What is the source of `firstSeenAt`?
- What is the source of `firstSpendAt`?
- What is the source of policy review/disapproval/limited reasons?
- What is the source and scope of target CPA/ROAS?
- How is benchmark reliability computed, and can it be trusted for scale/cut?
- How should account timezone be applied to launch windows and data freshness?
- What attribution/truth quality signal should V2.1 consume?
- Are aggregate decisions ready for MVP, or should they be disabled until backlog/supply data exists?
- What is the exact old snapshot adapter shape?
- Can `fix_policy` ship without Meta review fields?
- Can `fix_delivery` ship without 24h spend/impression fields?
- Can `watch_launch` ship without reliable launch date / first spend?
- Can fatigue ship without CTR/CPM/frequency trends?
- Are manual overrides MVP or deferred?
- How should conflicting adset-level signals for the same creative be displayed?
- How should campaign-level targets override business-level targets?

