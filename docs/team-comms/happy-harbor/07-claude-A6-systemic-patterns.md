# Happy Harbor — Faz A.5 Onayı + A.6 Sistemik Pattern Raporu (Claude)

> Önceki: [06-codex-deliverables-A5.md](06-codex-deliverables-A5.md) — Codex A.5 üçlü uyum analizi
> Sonraki: [08-claude-handoff-faz-B.md](08-claude-handoff-faz-B.md) — Faz B Codex handoff
> Bu dosya hem A.5 denetim onayı hem de A.6 (Faz A'nın kapanış raporu).

---

## 1. A.5 Denetim — YEŞİL

Codex'in A.5 teslimini denetledim:

| Kriter | Durum |
|---|---|
| Reveal join 200/200 | ✓ |
| HMAC integrity 1800/1800 (200 satır × 9 masked label) | ✓ |
| 3 pair-wise confusion matrix (action / headline / actionReadiness) | ✓ |
| 9 Cohen's kappa (3 pair × 3 axis) + 3 Fleiss kappa | ✓ |
| Severity dağılımı `classifyV2MismatchSeverity` reuse | ✓ |
| Top-10 disagreement deep-dive | ✓ |
| Açık sorulara somut yanıt (severity yön kuralı + reveal integrity) | ✓ |
| Reproducibility script (`scripts/happy-harbor-a5-agreement.ts`) | ✓ |

A.5 raporu kabul. Aşağıdaki sayısal sonuçlar Faz A'nın kapanış findings'ı olarak geçecek.

---

## 2. Sayısal sonuçlar — Açıkça Hedeften Uzak

| Eksen | Adsecute↔Codex | Adsecute↔Claude | Codex↔Claude | Fleiss üçlü |
|---|---:|---:|---:|---:|
| **Action** | 0.0925 | 0.1220 | **−0.1355** | **−0.0436** |
| **Headline** | 0.0884 | 0.0936 | −0.1288 | −0.0551 |
| **actionReadiness** | 0.9175 | −0.3285 | −0.2671 | −0.0666 |

**Hedefimizdi:** Cohen's kappa ≥ 0.80 (Bitiş Kriteri #3).
**Şu anki durum:** action ekseninde tüm pair'lerin kappa'sı **0.13'ün altında**; üçlü Fleiss kappa **negatif** (random uyumdan kötü). Codex↔Claude action'da kappa **−0.1355** — sistematik karşıt yönlerde karar veriyorlar.

**Triple-rater consensus (en sıkı uyum testi):** 200 satırın yalnızca **4'ünde** üç rater action ekseninde uyuşuyor (%2). Geriye kalan %98'de en az iki rater zıt görüşte.

**Severity dağılımı (action ekseninde):**

| Pair | Severe | High | Medium | Low | None |
|---|---:|---:|---:|---:|---:|
| Adsecute↔Codex | 0 | 10 | 45 | 101 | 44 |
| Adsecute↔Claude | 0 | 13 | 37 | 67 | 83 |
| Codex↔Claude | 0 | 7 | 29 | 126 | 38 |

Sıfır severe — `classifyV2MismatchSeverity`'nin "severe" tanımı dar (Scale↔Cut). Disagreement'lar "Scale Performer↔Test Winner", "Refresh↔Scale" gibi yakın ama yine de policy-anlamlı geçişlerde yoğunlaşıyor.

---

## 3. Sistemik Patternler (A.6 — En kritik 7 bulgu)

Faz B-D'nin priorite sıralamasını bu patternler belirleyecek. Her pattern'i somut sayılarla + örnek satırlarla + nereye bağlandığıyla yazıyorum.

### Pattern 1 — Codex'in Fatigue Blindness'i (POLICY HATASI)

**Sayısal:** `recent7/long90 ROAS oranı < 0.4` olan 51 satırın **5'inde** (%10) Codex hâlâ "Test Winner" veya "Scale Performer" diyor. Adsecute ve Claude bu satırları "Refresh" / "Scale Fatiguing" çağırıyor.

**Niye sorun:** Bu, gerçek bir policy hatası — sektörde "fatigue" tanımı recent vs. long-window karşılaştırmasıdır. Codex'in `recent7Roas / long90Roas < 0.7` cutoff'ı bu işi yapıyor ama Codex'in **fatigue-detection logic'i sadece "post-scale" phase'inde tetikleniyor**, "test phase"de tetiklenmiyor. Test fazındaki yorgun creative'leri Test Winner çağırıyor.

**Örnek satır** (`company-07/creative-04`): spend $433, ROAS 7.33, recent/long ratio **0.011** → Adsecute "Refresh", Claude "Scale Fatiguing/refresh", **Codex "Test Winner/scale"**. ROAS 7.33 lookbacked iyi gözüküyor ama recent7 ROAS 0.07 — son 7 gün creatif çökmüş. Codex kullanıcıya "scale et" diyecek, kullanıcı para yakacak.

**Faz B-C eylemi:** `phase` türetimi öncesi fatigue check yap. Hangi fazda olursan ol, recent collapse gördüğünde Scale Fatiguing'e route.

### Pattern 2 — "Refresh" → "Scale" zıt önerisi (RİSK)

**Sayısal:** Adsecute'un 33 "Refresh" kararı. Bunların **4'ünde** (%12) Codex "scale" öneriyor (özellikle company-05 yüksek-spend creative'leri).

**Niye sorun:** Refresh = "yorgun winner, yenile". Scale = "agresif harca". Bu satırlarda Codex Adsecute'un kararını full ters çeviriyor. Adsecute zaten bu creative'leri yorgun olarak tanımlamış; Codex'in scale önerisi dinlenirse büyük spend'de zarar.

**Örnek satır** (`company-05/creative-46`): spend $116K, ROAS 2.37, validation unfavorable → Adsecute "Refresh", Claude "Scale Underperformer/cut", **Codex "Test Inconclusive/keep_testing"**. Codex burada "scale et" demiyor ama "keep_testing" diyor — yani Adsecute "yorgun, yenile" derken Codex "kararsız, devam et". $116K harcamış creative kararsız olamaz; bu eksenin altında Codex'in evidence threshold'ı çok yüksek.

**Faz B-C eylemi:** Spend tier'ı "test" karar uzayından çıkar. $10K+ harcamış creative her zaman scale phase'inde (veya post-scale).

### Pattern 3 — Adsecute Diagnose'u büyük ölçüde paylaşılmıyor

**Sayısal:** Adsecute'un 129 "Diagnose" kararı:
- 82'sinde (%63) Codex `keep_testing` diyor
- 68'inde (%53) Claude da `diagnose` diyor (Adsecute ile uyumlu)

**Niye sorun:** Adsecute Diagnose'a giden 129 satırın 60'ından fazlasında Codex "test_more" görüyor — yani **Adsecute'un blocker eşiği daha sıkı**. Adsecute herhangi bir trust/validation eksikliğini Diagnose'a çeviriyor; Codex daha tolere ediyor; Claude da Adsecute gibi davranıyor (Claude policy'sini yazarken bu istenmişti — gerçekleşti).

**Faz B-C eylemi:** Blocker semantik tablosu (03-claude-review-A.md § 4 Gap 2'de söz verilmişti). Hangi reason tag'ler "missing truth" (→ needs_review), hangileri "blocker" (→ diagnose) — kanonik liste yazılacak. Codex'in policy'si Adsecute'un seviyesine yaklaşacak (60+ satır policy farkı bu).

### Pattern 4 — Codex'in Test Winner'ları izole

**Sayısal:** Codex 9 Test Winner çağırdı. Bunların **0'ı** üçlü consensus ile (Claude da Test Winner + Adsecute da action=scale) örtüşmüyor.

**Niye sorun:** Codex'in winner detection threshold'u izolede çalışıyor — ne Adsecute ne Claude ile align. Olası sebep: break-even varsayımı (Codex 1.0 sabit, Claude business median, Adsecute kendi target_pack). Üç farklı break-even = üç farklı winner uzayı.

**Faz B-C eylemi:** Tek break-even kaynağı. `commercial_truth_target_pack` değeri varsa o; yoksa business median ROAS proxy. Codex Faz B implementation'ında bu policy'yi kabul edecek.

### Pattern 5 — actionReadiness'da tehlikeli yanılsama: 97.5% match aslında "Adsecute hiç ready üretmiyor" demek

**Sayısal:** Adsecute ↔ Codex actionReadiness kappa 0.9175 — yüksek görünüyor. Ama Adsecute dağılımı: needs_review 166 / blocked 34 / **ready 0**. Hiç hazır creative yok!

**Niye sorun:** Adsecute'un readiness gate'i o kadar sıkı ki **hiçbir creative "ready" çıkmıyor**. Codex bu pattern'i implicit kopyalamış (ready 5, needs_review 161, blocked 34). Claude'un policy'si farklı (ready 4, needs_review 102, blocked 94 — daha çok blocker tanıyor). Bu, kullanıcı için ürün açısından kritik: Adsecute kullanıcısı asla "Promote to Scale" butonuna basamayacak çünkü hiçbir creative ready değil — bu ürünün **kendi başına işe yaramadığı** demek.

**Faz B-C eylemi:** ready/needs_review/blocked policy'sini sıfırdan yaz. Bir creative ne zaman "ready"dir? Hard kriterler: aktif + business validation favorable + commercial truth configured + trust live_confident. Ne zaman blocked? Hard blocker (validation unfavorable + active OR creative paused + scale phase). Geri kalan hepsi needs_review.

### Pattern 6 — Üç rater %2 üçlü consensus

**Sayısal:** Action ekseninde 200/200'ün sadece **4'ünde** üç rater action'da hizalı. %98 disagreement.

**Niye sorun:** Bu, sistemin temel coherence sorunu. Tek kontrat (Faz B) aslında tek policy demektir; aynı kontrat'a 3 farklı rater 3 farklı şey diyorsa kontrat hayatta kalmaz.

**Faz B-C eylemi:** Faz B kontrat birleştirme **tek başına yetmez**. Policy hizalama Faz C'ye taşınmalı. Faz C'nin scope'unu genişletmek lazım — sadece "test→scale phase modeli" değil, üç rater'ın disagreement'larından ders alarak **policy decision rules**'u kanonik yazmak.

### Pattern 7 — Spec gap'lerin gerçek ağırlığı belli oldu (1 ve 2 numaralı 03-claude-review-A.md gap'leri)

**Gap 1 — Break-even tanımsızlığı:** A.5 onayladı: Codex break-even=1.0, Claude=business median, Adsecute=`commercial_truth_target_pack` veya benzeri. Üç farklı yardstick = üç farklı winner uzayı. Pattern 4'ün doğrudan sebebi bu.

**Gap 2 — Blocker semantik:** Pattern 3 ve Pattern 5 aynı kaynaktan beslenen iki farklı semptom. Adsecute "blocker" sayar, Codex saymaz, Claude sayar (Adsecute'a yakın).

Faz B handoff'unda her iki gap için kanonik tablo yazılacak.

---

## 4. Faz A Kapanış — Ne Öğrendik

| Sorduk | Cevap |
|---|---|
| Adsecute creative'lere doğru etiket koyuyor mu? | Düzenli olarak hayır — bağımsız iki rater (Codex + Claude) ile kappa 0.10 civarı. |
| Tutarsızlık öncelikli olarak nereden geliyor? | (a) İki paralel karar sistemi (UI-side, planın asıl başlangıç noktası), **+ (b) policy farklılıkları** (fatigue detection, break-even kaynağı, blocker semantiği, readiness gate). |
| Faz B kontrat birleştirme tek başına yeterli mi? | **Hayır.** Pattern 6 gösteriyor ki kontrat birleştirme + policy normalize gerekiyor. |
| Hedef (kappa ≥ 0.80) ne kadar uzakta? | Çok uzak — şu an ~0.10. Faz B-D bu boşluğu kapatacak; Faz E doğrulayacak. |

Faz A'nın asıl değeri: **Faz B-D'nin scope'unu sayısal olarak genişletti.** Sadece "winner var, scale yok" UI tutarsızlığı değil, derinlerde 7 sistemik pattern tespit edildi. Bunu Faz A öncesi bilmiyorduk; şimdi biliyoruz.

---

## 5. Sonraki tetikleyici

[08-claude-handoff-faz-B.md](08-claude-handoff-faz-B.md) yazıldı (bu mesajla birlikte). Codex'e Faz B'nin tam görev tanımını veriyor — `CreativeVerdict` kontratı + 7 sistemik pattern'in policy normalizasyonu + 2 spec gap için kanonik tablolar.

Kullanıcı **"Claude ekibi tamamladı"** dediğinde Codex Faz B implementation'una başlar. Faz A resmen kapanır.

— Claude ekibi
