# Phase 02 Operating Modes

## Route

`GET /api/business-operating-mode?businessId=<id>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

This route is deterministic and combines:

- selected-range Meta campaign totals
- selected-range Meta location breakdowns
- business commercial truth snapshot

## Payload

- `currentMode`
- `recommendedMode`
- `confidence`
- `why`
- `guardrails`
- `changeTriggers`
- `activeCommercialInputs`
- `platformInputs`
- `missingInputs`

## Mode Precedence

1. `Recovery`
   - critical site / checkout / conversion / feed blocker
   - blocked stock pressure
   - manual do-not-scale reason
2. `Peak / Promo`
   - active medium/high promo without a critical blocker
3. `Margin Protect`
   - selected-range performance misses break-even or target protection thresholds
   - or major GEO economics/serviceability constraints limit scale
4. `Exploit`
   - selected-range performance materially beats target
   - and signal volume is strong enough to scale safely
5. `Stabilize`
   - near-target or mixed state where controlled moves are safer
6. `Explore`
   - low signal or incomplete commercial setup

## Confidence Logic

- Missing target pack lowers confidence.
- Missing Meta campaign truth lowers confidence.
- Missing location truth lowers confidence.
- Missing constraints lower confidence.
- Low-signal ranges lower confidence.

The route still returns a payload when confidence is low.

## Surface Integration

- Meta account overview
  - `Operating Mode` card above `Recommendations`
  - optional and non-blocking
- Creative detail
  - read-only `Commercial Context` card
  - does not rename `Decision Signals` or `AI Commentary`

## Non-Goals In Phase 02

- no Meta write-back
- no ad set operating system
- no Creative OS rewrite
- no heavy external commerce integrations
