# Google Ads Reviewer Checklist

## Config / Feature Flags

- [ ] Confirm [`lib/google-ads/decision-engine-config.ts`](/Users/harmelek/Adsecute/lib/google-ads/decision-engine-config.ts) exposes `GOOGLE_ADS_DECISION_ENGINE_V2`
- [ ] Confirm [`lib/google-ads/decision-engine-config.ts`](/Users/harmelek/Adsecute/lib/google-ads/decision-engine-config.ts) exposes `GOOGLE_ADS_WRITEBACK_ENABLED`
- [ ] Confirm Decision Engine V2 default posture is enabled
- [ ] Confirm write-back default posture is disabled

## Advisor Route

- [ ] Review [`app/api/google-ads/advisor/route.ts`](/Users/harmelek/Adsecute/app/api/google-ads/advisor/route.ts)
- [ ] Confirm Decision Snapshot V2 metadata is present in advisor payloads
- [ ] Confirm selected range is contextual and not the primary decision brain
- [ ] Confirm operator-first/manual-plan semantics remain honest

## Status Route

- [ ] Review [`app/api/google-ads/status/route.ts`](/Users/harmelek/Adsecute/app/api/google-ads/status/route.ts)
- [ ] Confirm status copy aligns to decision snapshot / multi-window wording
- [ ] Confirm it does not imply canonical 90-day decisioning
- [ ] Confirm write-back posture is not overstated

## Operator-First UI Surface

- [ ] Review [`components/google/google-advisor-panel.tsx`](/Users/harmelek/Adsecute/components/google/google-advisor-panel.tsx)
- [ ] Confirm the page shows `Account Pulse`
- [ ] Confirm the page shows `Decision Snapshot`
- [ ] Confirm the page shows `Opportunity Queue`
- [ ] Confirm queue sections render as `Review`, `Test`, `Watch`, and `Suppressed`
- [ ] Confirm cards show windows, confidence, risk, blast radius, blockers, validation, and rollback
- [ ] Confirm manual-plan/operator-review wording is used when write-back is disabled

## Query Guardrails

- [ ] Review [`lib/google-ads/query-ownership.ts`](/Users/harmelek/Adsecute/lib/google-ads/query-ownership.ts)
- [ ] Review [`lib/google-ads/growth-advisor.ts`](/Users/harmelek/Adsecute/lib/google-ads/growth-advisor.ts)
- [ ] Review [`lib/google-ads/reporting.ts`](/Users/harmelek/Adsecute/lib/google-ads/reporting.ts)
- [ ] Confirm branded queries do not become negative-keyword actions
- [ ] Confirm SKU-specific and product-specific queries are suppressed
- [ ] Confirm low-confidence and ambiguous cases are suppressed
- [ ] Confirm only exact-negative-safe waste survives in V1
- [ ] Confirm suppression reasons are explicit in payloads

## Snapshot Semantics

- [ ] Review [`lib/google-ads/decision-snapshot.ts`](/Users/harmelek/Adsecute/lib/google-ads/decision-snapshot.ts)
- [ ] Review [`lib/google-ads/serving.ts`](/Users/harmelek/Adsecute/lib/google-ads/serving.ts)
- [ ] Confirm approved windows are explicit:
- [ ] `1d`, `3d`, `7d`, `28d`, `56d`, `84d`
- [ ] Confirm selected range stays contextual
- [ ] Confirm legacy compatibility is explicit rather than hidden

## Release Checklist Alignment

- [ ] Review [`docs/google-ads-release-checklist.md`](/Users/harmelek/Adsecute/docs/google-ads-release-checklist.md)
- [ ] Confirm rollout guidance matches current code posture
- [ ] Confirm rollback guidance is realistic
- [ ] Confirm known limitations are honest
- [ ] Confirm unsupported V1 scope is stated explicitly

## Build / Test Verification

- [ ] Run the targeted Google Ads suite:
- [ ] `npm test -- lib/google-ads/decision-engine-release.test.ts lib/google-ads/query-ownership.test.ts lib/google-ads/reporting.test.ts lib/google-ads/growth-advisor.test.ts lib/google-ads/decision-engine-v2.test.ts lib/google-ads/decision-snapshot.test.ts lib/google-ads/serving.test.ts lib/google-ads/advisor-ux.test.ts components/google/google-advisor-panel.test.tsx components/google-ads/GoogleAdsIntelligenceDashboard.test.tsx app/api/google-ads/advisor/route.test.ts app/api/google-ads/status/route.test.ts`
- [ ] Confirm result: `Test Files 12 passed (12)`, `Tests 98 passed (98)` or re-run equivalent current pass
- [ ] Run `npm run build`
- [ ] Confirm build passes
- [ ] Confirm no lint script exists, rather than silently skipping lint
