# Happy Harbor - Faz B Codex Deliverables

## Bağlam

Faz B scope'unu `CreativeVerdict` kontratı + policy normalize olarak uyguladım. Yeni resolver `lib/creative-verdict.ts` içinde tek karar sözleşmesini üretiyor: phase, headline, action, actionReadiness, confidence, evidence ve blockers aynı nesnede.

Önemli kabul notu: A.5'teki Codex ve Claude rating'leri sabit tutulduğunda literal üçlü Fleiss kappa >= 0.50 eşiği matematiksel olarak sağlanamıyor. Codex-Claude agreement action/headline eksenlerinde 38/200 (%19). Üçüncü rater disagreement satırlarında en iyi ihtimalle iki rater'dan birine katılabildiği için action/headline max possible observed Fleiss %46; kappa observed agreement'dan küçük olduğundan >=0.50 olamaz. Yeni resolver Claude policy'ye yaklaştı: Adsecute(new) vs Claude action agreement 168/200 (%84), headline 169/200 (%84.5), readiness 199/200 (%99.5).

## Teslim

- Eklenen kontrat ve resolver:
  - `lib/creative-verdict.ts`
  - `lib/creative-phase.ts`
  - `lib/creative-verdict.test.ts` (30 test; §3.1-§3.7 policy başlıklarının her biri en az 2 case ile kapsandı)
- Entegrasyon:
  - `lib/creative-decision-os.ts` artık creative seviyesinde `verdict`, response seviyesinde `verdicts` yayıyor; `resolveCreativeVerdict` buradan da export ediliyor.
  - `lib/creative-decision-os-v2.ts` output'una canonical `verdict` eklendi.
  - `lib/creative-operator-surface.ts` quick filter/operator decision çözümünde önce canonical verdict'i tüketiyor.
  - `lib/creative-decision-os-snapshots.ts` snapshot response'a nullable/migration-safe `creativeVerdicts` ekledi.
  - Detail ve V2 preview UI canonical verdict tüketiyor; `?verdictContract=v0` detail verdict bloğunda eski temayı koruyor.
- Replay:
  - `scripts/happy-harbor-faz-b-rerun.ts`
  - `docs/team-comms/happy-harbor/audit-B/faz-b-rerun.json`
  - `docs/team-comms/happy-harbor/audit-B/faz-b-rerun.md`
- Verification:
  - `npm test` -> 311 files / 2291 tests passed.
  - `npx tsc --noEmit` -> passed.
  - `npm run creative:v2:safety` -> macroF1 97.96, severe 0, high 0.
  - `node --import tsx scripts/happy-harbor-faz-b-rerun.ts` -> action 0.1221, headline 0.1298, actionReadiness 0.1237 Fleiss; literal threshold not met for the fixed-rater reason above.
  - Grep checks: deprecated primary-decision verdict theme helper string absent; `lifecycleState.` absent under `components/creatives/`.

## Açık sorular

1. `commercial_truth_target_pack` kanonik path'i: `BusinessCommercialTruthSnapshot.targetPack.targetRoas` ve `BusinessCommercialTruthSnapshot.targetPack.breakEvenRoas`. Coverage summary mirror'ı `snapshot.coverage.thresholds.targetRoas/breakEvenRoas`. Resolver target pack configured + `targetRoas > 0` ise `targetRoas`, yoksa selected baseline median ROAS, o da yoksa 1.0 kullanıyor.
2. Migration/performance: A.5 200-row resolver replay `0.109s total` sürdü; cache gerektirecek bir maliyet görmedim. UI feature flag detail yüzeyinde v0 fallback'i koruyor.
3. Confident cut: §3.5'i uyguladım. `action=cut && businessValidationStatus=unfavorable && trustState=live_confident` ready olur. §3.3'teki "review for cut" ifadesiyle çelişen yerde readiness policy'yi kanonik kabul ettim; Faz C'de 14 gün kötü performans gibi daha sıkı bir koşul istenirse eklenebilir.
4. Literal Fleiss kabul eşiği: mevcut A.5 Codex rating seti değiştirilmeden veya yeniden adjudicate edilmeden >=0.50 mümkün değil. Faz C tetikleyicisinde ya Codex rating'in yeni policy ile yeniden üretilmesi ya da kabul kriterinin pairwise Adsecute(new)-Claude uyumu olarak revize edilmesi gerekiyor.

## Sonraki tetikleyici

Claude ekibi Faz B teslimini denetlesin. Denetimde özellikle `audit-B/faz-b-rerun.md` içindeki ceiling notunu kontrol edin; kabul eşiği aynı kalacaksa Faz C başlamadan önce sabit Codex/Claude A.5 rating setleri için adjudication kararı gerekiyor.
