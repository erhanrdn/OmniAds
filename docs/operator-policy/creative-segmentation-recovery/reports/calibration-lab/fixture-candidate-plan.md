# Creative Calibration Fixture Candidate Plan

Last updated: 2026-04-23 by Codex

## Intent

This plan converts the validated panel findings into deterministic fixture candidates. These fixtures are for implementation hardening and regression coverage. They are not policy by themselves.

## Direct Fixture Candidates From The Panel

| Scenario | Direct panel example | Observed now | Proposed fixture intent | Notes |
| --- | --- | --- | --- | --- |
| Campaign context missing should route to `Campaign Check` | `company-01-creative-01` | yes | strong account baseline + weak campaign baseline + missing context => `Campaign Check` | direct fixture |
| Campaign baseline unavailable should block scale optimism | `company-01-creative-09` | yes | account upside alone must not bypass missing campaign context | direct fixture |
| Under-sampled positive should stay `Test More` | `company-01-creative-12` | yes | promising recent signal + weak peer floor => `Test More` | direct fixture |
| One-purchase false winner should stay `Not Enough Data` | `company-01-creative-06` | yes | tiny spend + one purchase + no peer baseline => `Not Enough Data` | direct fixture |
| Strong baseline false winner should still stay `Not Enough Data` | `company-02-creative-04` | yes | one-purchase / empty recent window should not upgrade to `Watch` | direct fixture |
| Singleton campaign baseline should stay `Not Enough Data` | `company-03-creative-05` | yes | singleton campaign baseline + empty recent window => `Not Enough Data` | direct fixture |
| Fatigued winner should route to `Refresh` | `company-02-creative-01` | yes | strong winner decay => `Refresh` | direct fixture |
| Additional fatigued winner should route to `Refresh` | `company-02-creative-11` | yes | fatigue beats scale optimism | direct fixture |
| Medium-baseline fatigued winner should still route to `Refresh` | `company-03-creative-02` | yes | fatigue still matters with medium reliability | direct fixture |
| Stable winner should route to `Protect` | `company-02-creative-02` | yes | live-confident stable winner => `Protect` | direct fixture |
| Medium-baseline stable winner should still route to `Protect` | `company-03-creative-04` | yes | protection survives medium baseline | direct fixture |
| Partial commercial truth should still allow `Watch` | `company-03-creative-01` | yes | relative strength present but absolute proof incomplete => `Watch` | direct fixture |

## Required Scenario Set

| Required scenario | Direct current example | Status | Fixture plan |
| --- | --- | --- | --- |
| account-relative strong creative + missing Commercial Truth => `Scale Review`, review-only | no clean direct example | needs derived fixture | create a synthetic or future live fixture with explicit relative strength plus missing truth; ensure diagnosis can surface while push/apply stays blocked |
| campaign-relative strong creative in explicit campaign benchmark => `Scale Review` | no clean direct example | needs future fixture | require a row with strong campaign baseline and enough evidence; current sample lacks a scale-ready creative |
| low spend + weak purchase evidence => `Not Enough Data` / `Test More`, not Scale | `company-01-creative-06` | covered | direct fixture from current sample |
| low spend + meaningful purchase evidence => not automatically ROAS-only noise | no direct example | needs derived fixture | add a counterexample so evidence floor is not reduced to “low spend always bad” |
| account average ROAS low, creative materially higher, enough evidence => `Scale Review` | no direct example | needs future fixture | current near-miss rows still fail campaign-context prerequisites |
| old rule says winner, Decision OS says Watch, panel agrees winner => fixture candidate | none observed | needs future fixture | no old-rule outperformer in this panel |
| old rule says winner, Decision OS says Watch, agents disagree due to low evidence => old rule rejected | `company-03-creative-01` partly adjacent | covered conceptually | preserve as “old rule not superior; Watch remains correct” |
| Commercial Truth missing must not suppress relative strength | `company-02-creative-01`, `company-02-creative-02`, `company-02-creative-11` | covered | direct fixtures should assert diagnosis still survives missing truth |
| Commercial Truth missing must still block push/apply and absolute-profit claims | `company-02-*`, `company-01-*` | covered | direct fixtures should assert action safety remains blocked |
| Campaign context weakens creative blame | `company-01-creative-01`, `company-01-creative-09` | covered | direct fixtures |
| protected winner remains `Protect` | `company-02-creative-02`, `company-03-creative-04` | covered | direct fixtures |
| fatigue signal produces `Refresh` or `Watch`, not `Cut` unless evidence supports it | `company-02-creative-01`, `company-02-creative-11`, `company-03-creative-02` | covered | direct fixtures |
| `Campaign Check` when campaign/ad set context is the blocker | `company-01-creative-01`, `company-01-creative-09` | covered | direct fixtures |
| `Not Enough Data` only when evidence is actually thin | `company-01-creative-06`, `company-02-creative-04`, `company-03-creative-05` | covered | direct fixtures plus a counterexample fixture where low spend still has meaningful support |

## Proposed Fixture Groups

**Group A — Immediate direct fixtures**

- `company-01-creative-01`
- `company-01-creative-06`
- `company-01-creative-09`
- `company-01-creative-12`
- `company-02-creative-01`
- `company-02-creative-02`
- `company-02-creative-04`
- `company-02-creative-11`
- `company-03-creative-01`
- `company-03-creative-02`
- `company-03-creative-04`
- `company-03-creative-05`

**Group B — Derived fixtures still needed**

- scale-ready relative winner with missing commercial truth but explicit review-only behavior
- scale-ready campaign-relative winner with campaign benchmark present
- low-spend but meaningful purchase-evidence counterexample
- old-rule “winner” case where old rule is truly better than current OS, if one appears later

## Implementation Guidance

- Keep deterministic fixtures aligned to current Decision OS behavior where the full panel agreed.
- Add explicit negative assertions:
  - no push/apply unlock from missing commercial truth
  - no `Scale Review` from account upside alone
  - no `Cut` from fatigue alone
- Pair every new positive fixture with at least one adjacent negative fixture to reduce overfitting.
