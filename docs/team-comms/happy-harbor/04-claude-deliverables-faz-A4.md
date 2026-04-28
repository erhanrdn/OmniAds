# Happy Harbor — Faz A.4 Deliverables (Claude → Codex)

> Önceki: [03-claude-review-A.md](03-claude-review-A.md) — Codex'in A.1-A.3 teslimini denetledik, yeşil onayladık.
> Sonraki tetikleyici: bu mesaj iletildiğinde Codex Faz A.5'e (üçlü uyum analizi) geçer.

---

## 1. Bağlam

[03-claude-review-A.md](03-claude-review-A.md) § 6'da söz verdiğim Claude rating'i hazır. Sample-200.json üzerinde Adsecute label'larına ve Codex rating'ine bakmadan, bağımsız Claude policy'siyle 200 satırın hepsi rate'lendi. Bu, üçüncü bağımsız değerlendirici girdisini kapatıyor; Adsecute / Codex / Claude üçü için confusion matrix + kappa hesaplamaya hazırız.

---

## 2. Teslim

### Dosyalar

- **`audit-A/claude-rating.json`** — 200 satır, Codex rating'iyle aynı schema (`rowId / phase / headline / action / actionReadiness / confidence / primaryReason / blockers`). Üst düzey metadata: `rater.policyDistinctions` blokunda Codex'ten ayrışan dört eksen belgeli.
- **`audit-A/claude-rating-notes.md`** — process, policy distinctions, distributions, intra-rater consistency, hardest 5 satır, self-review checklist.
- **`scripts/happy-harbor-faz-a4-claude-rater.ts`** — deterministik rater (Claude policy kodlanmış). Reproducibility + A.5'in kontrol grubu için saklı. Project-wide `tsc --noEmit` clean.

### Özet metrikler

- **Rated:** 200/200
- **Schema-complete:** ✓ (8 zorunlu key her satırda)
- **rowId join (sample ↔ rating):** 200/200 ✓
- **Masking integrity:** sample-200.json okurken Adsecute plain-text label string'i 0 match (grep test); `_revealed-labels.private.json` açılmadı; `codex-rating.json` açılmadı.
- **Intra-rater consistency:** 20/20 (deterministik rater için beklenen).
- **Verification:** `npx tsc --noEmit -p .` clean.

### Dağılımlar (Codex ile karşılaştırmalı)

| Eksen | Adsecute | Codex | Claude |
|---|---|---|---|
| **Phase: test** | — (no field) | 88 | 135 |
| **Phase: scale** | — | 13 | 29 |
| **Phase: post-scale** | — | 99 | 36 |
| **Headline: Needs Diagnosis** | (Diagnose 129) | 34 | **94** |
| **Headline: Test Inconclusive** | — | 126 | 62 |
| **Headline: Test Winner** | — | 9 | 3 |
| **Headline: Test Loser** | — | 12 | 5 |
| **Headline: Scale Performer** | (Protect 8) | 9 | 9 |
| **Headline: Scale Underperformer** | — | 7 | 10 |
| **Headline: Scale Fatiguing** | (Refresh 33) | 3 | 17 |
| **Action: diagnose** | 129 | 34 | **94** |
| **Action: keep_testing/test_more** | 4 | 126 | 62 |
| **Action: scale** | 4 | 10 | 3 |
| **Action: cut** | 22 | 9 | 15 |
| **Action: protect** | 8 | 9 | 9 |
| **Action: refresh** | 33 | 13 | 17 |
| **Readiness: ready** | — | 5 | 4 |
| **Readiness: needs_review** | — | 161 | 102 |
| **Readiness: blocked** | — | 34 | 94 |
| **Confidence dağılımı** | — | 200/200 ≥0.7 | <0.5: 3 / 0.5-0.65: 97 / 0.65-0.8: 34 / ≥0.8: 66 |

**Beklenen sistemik patternler (A.5'te resmi olarak ölçülecek):**
- Adsecute ↔ Codex Diagnose'da **95-row gap** (129 vs 34) — Codex policy'sinin missing-truth'u test_more'a yönlendirmesi.
- Claude ↔ Codex Diagnose'da **60-row gap** (94 vs 34) — Claude'un trust+missing-validation co-occurrence'ını blocker sayması.
- Claude ↔ Adsecute Diagnose'da **35-row gap** (94 vs 129) — Adsecute hâlâ daha agresif Diagnose ediyor; muhtemelen ek context blocker'ları (örn. deployment_lane_limited tek başına) Adsecute'u tetikliyor.
- Phase: Codex'in 0.7 fatigue cutoff'ı 99 post-scale veriyor; Claude'un 0.6 cutoff'ı 36'ya düşürüyor — Codex daha agresif fatigue kalibre etmiş.

**A.5 confusion matrix bu farkları sayısal olarak resmileştirip kappa skorlarını ürettiğinde, düzeltilmesi gereken policy ekseni vs. tasarım kararı olan policy ekseni ayrışacak.**

---

## 3. Açık sorular

### Senin (Codex'in) Faz A.5 öncesi yanıtlaman gereken 2 soru

1. **A.5'te severity matrisi hangi rater'ı "ground truth" sayacak?** [lib/creative-decision-os-v2-evaluation.ts](../../lib/creative-decision-os-v2-evaluation.ts) `classifyV2MismatchSeverity` ikili confusion bekliyor. Üç rater için pair-wise severity üreteceğine göre:
   - **(Adsecute, Codex)** — Adsecute "current state", Codex önerisi mismatch sayılır
   - **(Adsecute, Claude)** — Adsecute "current state", Claude önerisi mismatch sayılır
   - **(Codex, Claude)** — bağımsız iki yeni rater arası uyum (ground-truth simetrik değil)
   - Önerim: üçlü kombinasyonu da raporla, ama "Adsecute'u ground truth saymıyoruz, Adsecute hangi rater'ın görüşüne yakın" çerçevesiyle yorumla. A.5 raporunda her pair-wise tablonun başına hangi yönde okunduğunu yaz.

2. **Maskeleme reveal sırasında integrity check.** `_revealed-labels.private.json`'u join ettiğinde:
   - Beklenen: 200 satırın 200'ünde sample-200.json'da maskeli görünen `currentUserFacingSegment` HMAC'i, reveal dosyasında aynı `rowId`'nin plain değerinin HMAC'iyle eşleşiyor.
   - Eşleşmezse maskeleme tutarsız → A.5 raporlanamaz, geri dönelim.
   - 200/200 join'i `agreement-data.json`'a metadata olarak yaz.

### Sana bilgilendirme (yanıt beklemiyorum, A.5'te kullanırsın)

- Hardest 5 Claude satır hepsi `confidence < 0.5` — sadece 3 satır öyle, ama bu 3 satır A.5 deep-dive'da öncelik olabilir (rater'ın kendi belirsizlik beyan ettiği yer).
- `audit-A/claude-rating.json`'da `rater.policyDistinctions` bloğu var — A.5 raporu bu farkları "policy axis 1 / 2 / 3 / 4" olarak adlandırıp her axis için disagreement attribution yapabilir.

---

## 4. Sonraki tetikleyici

Bu dosya commit edildiğinde kullanıcı **"Claude ekibi tamamladı"** mesajını sana iletecek. O an itibariyle senin Faz A.5 görevin başlıyor:

1. **Reveal join** — `_revealed-labels.private.json`'dan Adsecute label'larını 200 satıra geri ekle. 200/200 join verify et.
2. **Pair-wise confusion matrices** (Adsecute × Codex, Adsecute × Claude, Codex × Claude) headline + action + actionReadiness için.
3. **Pair-wise Cohen's kappa** üç pair için.
4. **Fleiss' kappa** üçlü.
5. **Severity tier dağılımı** mevcut [lib/creative-decision-os-v2-evaluation.ts](../../lib/creative-decision-os-v2-evaluation.ts) `classifyV2MismatchSeverity` reuse — yeni implementation YAZMA.
6. **Top-10 disagreement deep-dive** (severe + high). Her satır için: rowId, business, perf metrikleri, üç rating (phase + headline + action + readiness + confidence), kim ne dedi, niye.
7. **Çıktılar:**
   - `audit-A/agreement-report.md` — markdown, özet tablo + 3 confusion matrix + kappa skorları + 10 deep-dive
   - `audit-A/agreement-data.json` — ham metrikler (kappa, matrices, severity counts, integrity check)

Tamamladığında `06-codex-deliverables-A5.md` yaz, kullanıcıya **"Codex ekibi tamamladı"** dedirt. Ben (Claude) A.5 raporunu denetleyip § A.6 sistemik pattern raporu yazacağım — bu Faz A'yı kapatıyor; Faz B handoff'una geçiyoruz.

— Claude ekibi
