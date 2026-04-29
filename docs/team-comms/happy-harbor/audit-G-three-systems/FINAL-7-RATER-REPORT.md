# Faz G — Final 7-Rater Karşılaştırma Raporu

**Veri:** 75 creative (IwaStore 35 + TheSwaf 40), production snapshot 2026-04-28
**Eksen:** Action (scale / test_more / protect / refresh / cut / diagnose)

## 1. Pair-wise Agreement Matrisi (Cohen's Kappa)

Her hücre: agreement % / kappa. Pozitif kappa = random'dan iyi uyum, 0 = random, negatif = sistematik zıtlık.

| | Sys1 Legacy | Sys2 Operator | Sys3 V2 | Claude | Codex A Growth | Codex B Efficiency | Codex C Funnel |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Sys1 Legacy** | — | 30.7% / **0.139** | 2.7% / **−0.061** | 53.3% / **0.192** | 53.3% / **0.218** | 29.3% / 0.146 | 33.3% / 0.115 |
| **Sys2 Operator** | | — | 40.0% / **−0.085** | 32.0% / 0.125 | 14.7% / **−0.034** | 46.7% / **0.266** | 37.3% / 0.025 |
| **Sys3 V2** | | | — | 18.7% / 0.056 | 13.3% / 0.054 | 34.7% / 0.061 | 45.3% / 0.078 |
| **Claude** | | | | — | **57.3% / 0.316** | 34.7% / 0.197 | 38.7% / 0.161 |
| **Codex A Growth** | | | | | — | 26.7% / 0.151 | 30.7% / 0.100 |
| **Codex B Efficiency** | | | | | | — | 36.0% / 0.140 |
| **Codex C Funnel** | | | | | | | — |

**Fleiss kappa (multi-rater):**
- All 7 raters: **0.083** (random'dan biraz iyi)
- Adsecute 3 sistem (sys1+2+3): **−0.114** (NEGATİF — kendi içinde sistematik zıtlık)
- Independent 4 (Claude + 3 Codex agent): **0.142** (bağımsız rater'lar arası daha yüksek uyum)

## 2. N-way agreement (kaç rater aynı action'da buluşuyor)

| Threshold | Count | % of n=75 |
|---|---:|---:|
| **7 rater unanimous** | **0** | **0%** |
| ≥6 rater | 3 | 4.0% |
| ≥5 rater | 17 | 22.7% |
| ≥4 rater | 40 | 53.3% |
| ≥3 rater | 70 | 93.3% |
| ≥2 rater | 75 | 100% |

**Hiçbir creative'de 7 rater aynı action'da buluşmuyor.** Ancak %93'ünde en az 3 rater bir noktada birleşiyor → bir tür "soft consensus" mevcut.

## 3. Action Distribution (rater başı)

| Rater | scale | test_more | protect | refresh | cut | diagnose | Eksik aksiyon |
|---|---:|---:|---:|---:|---:|---:|---|
| **Sys1 Legacy** | 0 | 48 | 6 | 10 | 11 | 0 | scale + diagnose hiç yok (4-action engine) |
| **Sys2 Operator** | 2 | 20 | 0 | 8 | 5 | **40** | protect hiç yok |
| **Sys3 V2** | 3 | 9 | 4 | 1 | 0 | **58** | cut hiç yok |
| **Claude (multi)** | 2 | 45 | 4 | 6 | 12 | 6 | dengeli |
| **Codex A Growth** | **13** | 44 | 7 | 8 | 3 | 0 | diagnose hiç yok |
| **Codex B Efficiency** | 1 | 13 | 3 | 14 | **17** | 27 | dengeli |
| **Codex C Funnel** | 4 | 27 | 0 | 5 | 4 | **35** | protect hiç yok |

Her rater'ın "kör spotu" var:
- Sys1: 4-action engine, scale/diagnose üretemiyor
- Sys2: protect hiç çağrılmıyor (yine de %53 diagnose)
- Sys3: hiç cut etmiyor — diagnose ile rotalıyor
- Codex A: diagnose hiç değil — büyüme odaklı her şeyi action'a yönlendiriyor
- Codex C: protect hiç değil — funnel breakdown şüpheli olduğunda diagnose'a yönlendirilir

## 4. En çarpıcı uyum kalıpları

| Bulgu | Sayı |
|---|---|
| **Adsecute kendi içinde Fleiss = −0.114** (random'dan KÖTÜ) | 3 sistem sistematik zıtlık üretiyor |
| **Sys1 Legacy ↔ Sys3 V2: %2.7, kappa −0.061** | Aynı creative'i Legacy 1 sınıfa, V2 başka sınıfa koyuyor — neredeyse hiç buluşmuyorlar |
| **Sys2 Operator ↔ Sys3 V2: kappa −0.085** | İkisi de "diagnose ağırlıklı" ama farklı creative'leri diagnose ediyorlar |
| **Sys2 ↔ Codex A: kappa −0.034** | Aggressive Growth ↔ Operator (Adsecute) sistematik zıt |
| **En yüksek uyum: Claude ↔ Codex A: %57.3, kappa 0.316** | Claude'un policy'si Aggressive Growth disposition'ına en yakın |
| **Sys2 ↔ Codex B: %46.7, kappa 0.266** | Operator ile Conservative Efficiency yakın — ikisi de cut + diagnose ağırlıklı |
| **Sys1 ↔ Codex A: %53.3, kappa 0.218** | Legacy 4-action engine + Growth disposition orta uyumlu |

## 5. Yorum — "Hangi sistem doğru?"

Doğru tek cevap yok, ama veri şunu söylüyor:

**(a) Adsecute'un kendi 3 sistemi sahaya en uzak olanlar.** Fleiss kappa −0.114 → birbirleriyle anlamsız zıt. Bu kullanıcının görselindeki "panelde bir yerde yanlış başka yerde doğru" tecrübesinin doğrudan kaynağı. Üç sistem aynı veriden üç farklı disposition türetip aynı ekranda yan yana render ediyor.

**(b) Claude + Codex Aggressive Growth en yakın çift** (%57.3 / kappa 0.316). Bu, "agresif growth disposition" (yüksek kanıt eşiklerine girmeden mature winner'ları scale et, fatigue belirgin değilse refresh erteleme) bağımsız iki rater'da paralel çıkan en güçlü disposition.

**(c) Adsecute Sys2 + Codex Conservative Efficiency yakınlığı** (kappa 0.266). Sistem 2 (Operator) zaten "cut + diagnose ağırlıklı"; Conservative Efficiency disposition'ıyla doğal uyum. Yani Sistem 2 sahaya yakın disposition'lardan birini taşıyor — sadece **diagnose'u aşırı agresif çağırıyor** (%53 oranı). Eğer hot-fix ile Sistem 2'nin diagnose eşiği gevşetilirse production karar kalitesi muhtemelen ciddi düzelir.

**(d) Sistem 3 (V2 Preview) en uçta**: hiç cut etmiyor (%0), %77 diagnose'a yolluyor. Hem Adsecute içinde (kappa −0.085 vs Sys2) hem de bağımsız rater'lara karşı (Claude ile kappa 0.056) düşük uyumda. **Bu sistem üretim yüzeyinden kaldırılırsa kullanıcının deneyimlediği çelişkinin büyük kısmı çözülür.**

**(e) Bağımsız rater'lar arası dahi uyum düşük** (Fleiss 0.142). Yani bu domain'de "tek doğru karar" yok — buyer disposition'ı sonucu büyük ölçüde belirliyor. Ürün stratejisi açısından: tek bir "kanonik" karar dayatmak yerine, kullanıcıya disposition seçmesi (Aggressive / Conservative / Funnel-first) sunmak daha gerçekçi olabilir.

## 6. Karar için iki seçenek

**Opsiyon X — Sistem 3'ü kapat, Sistem 2'yi gevşet:**
1. V2 Preview surface'ini ([CreativeDecisionOsV2PreviewSurface.tsx](../../components/creatives/CreativeDecisionOsV2PreviewSurface.tsx)) UI'dan tamamen kaldır
2. Sistem 2'nin diagnose eşiğini gevşet (özellikle `target_pack_missing` ve `trust_degraded` co-occurrence'da artık diagnose değil `needs_review` olsun)
3. Detail drawer Sistem 1 + Sistem 2 fallback yapısı (mevcut) korunur
4. Beklenen sonuç: kullanıcının panelde gördüğü çelişki ~%80 azalır, kararlar pratik kalır

**Opsiyon Y — Tek persona-aware karar üreticisi:**
1. UI'da kullanıcıya "Disposition" seçici ekle (Aggressive Growth / Conservative Efficiency / Funnel-First / Balanced)
2. Her disposition kendi eşik setiyle 6-action karar verir
3. Aynı creative farklı disposition'larda farklı action gösterir — bu kullanıcı tarafından beklenen durum
4. 3 mevcut sistem (Legacy, Operator, V2) kaldırılır; tek persona-aware engine

Opsiyon X hızlı ve düşük risk (~1 sprint), Opsiyon Y daha radikal ürün re-tasarımı (~1 ay).

---

**Detaylı veri:** [agreement-matrix.json](agreement-matrix.json), [codex-agents-notes.md](codex-agents-notes.md), [three-systems.json](three-systems.json), [merged-4-rater.json](merged-4-rater.json), [audit-F-iwastore-theswaf/](../audit-F-iwastore-theswaf/).
