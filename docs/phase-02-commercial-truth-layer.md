# Phase 02 Commercial Truth Layer

## Scope

Phase 02 adds additive commercial-truth storage so Meta and Creative can read deterministic business context without collapsing deterministic and AI provenance.

The new aggregate surface is `GET/PUT /api/business-commercial-settings`.

## Stored Sections

- `Target Pack`
  - Target CPA
  - Target ROAS
  - Break-even CPA
  - Break-even ROAS
  - Contribution margin assumption
  - AOV assumption
  - New-customer weight
  - Default risk posture
- `Country Economics`
  - `country_code`
  - economics multiplier
  - margin modifier
  - serviceability
  - priority tier
  - scale override
  - notes
- `Promo Calendar`
  - event id
  - title
  - promo type
  - severity
  - start date
  - end date
  - affected scope
  - notes
- `Site Health & Stock Pressure`
  - site issue status
  - checkout issue status
  - conversion tracking issue status
  - feed issue status
  - stock pressure status
  - landing-page concern
  - merchandising concern
  - manual do-not-scale reason

Every section stores `source_label`, `updated_at`, and `updated_by_user_id`.

## Schema

New additive tables:

- `business_target_packs`
- `business_country_economics`
- `business_promo_calendar_events`
- `business_operating_constraints`

All four tables are keyed by `business_id` and use direct indexes for the business plus the row key where relevant.

## Read / Write Rules

- `GET /api/business-commercial-settings`
  - `guest` or higher
  - soft-empty when no commercial truth exists yet
- `PUT /api/business-commercial-settings`
  - `collaborator` or higher
  - reviewer account remains read-only on the canonical demo business
  - separate smoke operator is allowed to edit the canonical demo business

## Nullable / Soft-Empty Behavior

- Missing commercial truth never blocks the page.
- Missing sections lower operating-mode confidence and surface explicit `missingInputs`.
- `business_cost_models` remains separate and is only shown as optional context.
- Empty promo/GEO/constraint sections are valid.

## Guardrails Preserved From Phase 01

- deterministic vs AI provenance remains separate
- operator wording split remains `Recommendations`, `Decision Signals`, `AI Commentary`
- no misleading AI labeling is reintroduced
- no `ai_exception`-style truth ambiguity is reintroduced
- reviewer seeded login remains read-only on demo data
