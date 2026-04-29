# Happy Harbor — Faz A.1-A.3 Denetim (Claude → Codex)

> Codex teslimi: [02-codex-deliverables-A.md](02-codex-deliverables-A.md)
> Denetim tarihi: 2026-04-28
> Denetim sonucu: **YEŞİL — A.4 başlatılabilir.**
> Şart: Aşağıdaki § 4'teki **2 spec gap'i**'i Faz A.5 öncesi çözeceğiz; rating'i geri çevirmiyoruz.

---

## 1. Bağlam

Codex Faz A.1 (business listesi), A.2 (200-row stratified maskeli sample) ve A.3 (Codex bağımsız rating + intra-rater check) görevlerini tamamladı. Ben Claude ekibi olarak teslimi 5 boyutta denetledim:
1. dosya/şema bütünlüğü, 2. maskeleme sıkılığı, 3. stratification dağılımı, 4. rating policy uyumu, 5. process disiplini (intra-rater + verification).

---

## 2. Yeşil bulgular

| # | Kriter | Durum |
|---|---|---|
| 1 | 6 zorunlu deliverable + 2 destek dosyası mevcut | ✓ |
| 2 | `audit-A/_revealed-labels.private.json` `.gitignore`'da, commit'lenmemiş | ✓ |
| 3 | sample-200.json plain Adsecute label içermiyor (grep `scale_review\|stable_winner\|fatigued_winner\|...` = 0 match) | ✓ |
| 4 | Codex generated instruction/reason copy de sample'a alınmamış (briefing tek başına label maskelemeyi istemişti — Codex daha sıkı davranmış, **doğru karar**) | ✓ |
| 5 | sample 200 satır, codex-rating 200 satır, schema tam (`rowId/phase/headline/action/actionReadiness/confidence/primaryReason/blockers`) | ✓ |
| 6 | Spend tier coverage: large 108 / medium 92 — her ikisi de ≥ %20. Small tier cohort'ta yok (9 candidate → 1 token-checkpointed skip → 8 runtime-eligible); not düşülmüş | ✓ |
| 7 | Verdict yüzeyi geniş kapsanmış: 6 action × 7 headline × 3 phase satırlarda mevcut, scope sadece winner/scale değil | ✓ |
| 8 | Intra-rater consistency 20/20 = 100% (kod-bazlı determinist için beklenen, ama belgelenmiş) | ✓ |
| 9 | `npx tsc --noEmit` clean, `npx vitest run` 13 tests pass, `npm run creative:v2:safety` macroF1 97.96 / severe+high mismatch 0 | ✓ |
| 10 | Açık soru #4 (DB access) — production .env.production üzerinden SSH ile çekilip rewrite edilmiş, secret commit'lenmemiş — temiz çözüm | ✓ |

---

## 3. Şimdiden açığa çıkan disagreement sinyalleri (A.5'in habercisi)

A.5 confusion matrix'ini henüz çalıştırmadık ama dağılımlar zaten Adsecute ↔ Codex arasında **ciddi sistemik sapmalar** olduğunu gösteriyor:

| Eksen | Adsecute | Codex |
|---|---|---|
| Primary action: **Diagnose** | 129 (64.5%) | 34 (17%) |
| Primary action: **Test More** | 4 (2%) | 126 (63%) |
| Primary action: **Scale** | 4 (2%) | 10 (5%) |
| Lifecycle: fatigued (Adsecute) vs Phase: post-scale (Codex) | 32 fatigued_winner | 99 post-scale |

Bu **istenen bir bulgu** — Faz A'nın amacı zaten bu farkı görmek. Pattern: Adsecute "missing truth → Diagnose" diyor, Codex "missing truth → keep_testing/Test More + needs_review" diyor. Phase ekseninde Codex'in `recent7/long90 < 0.7 → post-scale` kuralı agresif kalibre edilmiş, Adsecute lifecycle'a göre 3× daha fazla "fatigued" döküyor. **Bunlar A.5 deep-dive'da pattern olarak belgelenecek.**

---

## 4. Tespit ettiğim 2 spec gap (benim hatam, Codex'in değil)

### Gap 1 — Break-even ROAS tanımsızlığı (KRİTİK)

[01-claude-handoff-faz-A.md](01-claude-handoff-faz-A.md) §4 A.3 dedi ki: "Test winner kararının eşiği: relative performance üst yüzdelik + evidence maturity ≥ moderate + **ROAS ≥ break-even × 1.2**".

Ama "break-even" değerini nereden alacağı belirtilmedi. Codex pratik bir varsayımla **break-even = 1.0** kabul edip eşiği `ROAS ≥ 1.2` olarak uyguladı. E-ticaret için tipik break-even 1.5-2.0 arası — Codex'in eşiği gevşek kalmış olabilir, "Test Winner" sayısı şişebilir.

**Çözüm (A.5 öncesi):** Adsecute'un `commercial_truth_target_pack` veya `target_roas` alanını her business için geri okuyup break-even'i oradan al. Eğer target pack yoksa, business median ROAS'ını proxy olarak kullan. Bu spec'i ben yazıp Codex'e §6 açık soru olarak göndereceğim. Şu an Codex'in rating'i revize edilmiyor — sadece A.5 confusion matrix'inde "Codex break-even=1.0 varsayımı" disagreement ekseninin bir kaynağı olarak kayıt altına alınacak.

### Gap 2 — "Blocker" vs. "Missing truth" semantik sınırı belirsiz

Briefing dedi: "Source/context blockers change readiness to `blocked` and action to `diagnose`. Missing commercial truth or non-favorable validation changes readiness to `needs_review`."

Codex'in en zorlandığı 5 satırda (hepsi `business_validation_missing + trust_degraded_missing_truth` blocker pattern'i ile) Codex satırları "keep_testing + needs_review + Test Inconclusive" yorumladı. Burada `business_validation_missing` "missing truth" mı yoksa "blocker" mı? Briefing'de bu sınır netleştirilmemiş.

**Çözüm (A.5 öncesi):** Açık liste yazılacak: hangi reason tag'leri "missing truth" (→ needs_review), hangileri "blocker" (→ diagnose/blocked). [lib/creative-operator-surface.ts](../../../lib/creative-operator-surface.ts) içindeki `CreativeOperatorReasonTag` enum'undan başlayıp tek tek sınıflandıracağım — sonra Codex'e gönderip rating revizyonu **gerekmeden** A.5'te policy farkı olarak yorumlayacağız.

---

## 5. Sarı bulgular (gözlem, eylem değil)

### S1 — Confidence dağılımı düz: 200/200 ≥ 0.7

Bu deterministik kural-bazlı bir rater'ın doğal sonucu. İnsan rater olsa "bu satırda emin değilim, 0.5" derdi. A.5 deep-dive'da düşük-confidence Codex satırları en değerli sinyal olacaktı — bu satırlar yok. Çare: A.5 deep-dive'da disagreement satırlarını severity ile sırala, Codex confidence'ını skip et.

### S2 — Baseline reliability skew: strong 194 / medium 6, weak/unavailable yok

Cohort gerçekliği bu olabilir, Codex stratification'a yansıtmış olabilir. Bu eksenin distinguishing power'ı düşük olacak — A.5 raporunda not düşülecek.

### S3 — Phase distribution agresif: post-scale 99 / scale 13 / test 88

Codex'in `recent7/long90 < 0.7 → fatiguing` cutoff'ı Adsecute'tan 3× daha fazla "fatigued" üretiyor. **Bu yine bir disagreement bulgusu olabilir** ama daha temiz bir kalibrasyon ile rating tutarlılığı artabilir. A.5 deep-dive'da incelenecek; Faz C `phase` modeli kalibrasyonu için input olarak kullanılacak.

### S4 — Ek destek dosyaları (`scripts/happy-harbor-faz-a.ts` + test) iyi katma değer

Briefing bunları açıkça istememişti, ama Codex deterministik artifact üretmek için yazmış — A.4-A.5'te ben kendi rating'imi yaparken aynı sample-200 input'unu okuyabilir, kappa hesabı için reuse edebilirim. Teşekkürler.

---

## 6. Şu an açıyorum: Claude rating turu (A.4)

Plan'a göre A.4 tetiği: ben kendi bağımsız rating'imi (`audit-A/claude-rating.json`) çıkaracağım. Stratejim:

- 200 satırın hepsini sample-200.json'dan oku, **Codex rating'ini ve `_revealed-labels.private.json`'u açmadan** her satırı tekrardan değerlendir.
- Codex'in policy'sinden kasıtlı **farklı** olmak için: insan media buyer disposition'ıyla karar ver — özellikle (a) break-even'i her business için 30-day median ROAS × 1.0 (yaşayan ekonomi proxy'si) olarak al, (b) `business_validation_missing` + `trust_degraded` co-occurrence'ı **blocker** say (→ diagnose), (c) `recent7/long90 < 0.7` cutoff'unu 0.6'ya sıkıştır (Codex'ten daha tutucu fatigue tanımı).
- Schema Codex'inkiyle birebir aynı kalacak, böylece A.5 confusion matrix temiz join.

Bunu commit ettiğimde kullanıcıya **"Claude ekibi tamamladı"** dedirteceğim; sen A.5'i (üçlü uyum analizi) çalıştıracaksın.

---

## 7. Sonraki tetikleyici

- Şu an: **Faz A.4 (Claude rating turu) başlıyor.** Senden bir aksiyon yok; sıraya geçtin.
- Sıradaki: Claude rating tamamlandığında `04-claude-deliverables-faz-A4.md` + `audit-A/claude-rating.json` commit edilecek; kullanıcı **"Claude ekibi tamamladı"** mesajını sana iletecek.
- O an itibariyle:
  1. Sen `_revealed-labels.private.json`'dan Adsecute label'larını join et.
  2. § 4'teki 2 spec gap için sana yeni bir mini-handoff dosyası (`05-claude-handoff-A5-spec-gaps.md`) gelecek — break-even kaynağı + blocker/missing-truth semantik tablosu.
  3. A.5 metric pipeline'ı çalıştır (pair-wise Cohen's kappa, Fleiss' kappa, severity tier dağılımı, 10 disagreement deep-dive) → `audit-A/agreement-report.md` + `audit-A/agreement-data.json`.

— Claude ekibi
