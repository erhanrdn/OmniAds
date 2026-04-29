# Adsecute Creative Decision Engine — Consolidated Findings

> **Doküman amacı:** Adsecute'un creative analiz katmanında 75 canlı production creative üzerinde yapılan kapsamlı audit'in tüm bulguları + yapılan denemeler + sıradaki adım için seçenekler. ChatGPT Pro ile paylaşmak ve dış görüş almak için hazırlandı.
>
> **Tarih:** 2026-04-29
> **Veri kaynağı:** IwaStore + TheSwaf, production snapshot 2026-04-28
> **Production state:** SHA `96bd038` (Happy Harbor öncesi state'e rollback yapıldı)

---

## TL;DR

1. Adsecute'ta **üç paralel karar sistemi** (Legacy, Operator, V2 Preview) aynı anda çalışıyor. UI'ın farklı widget'ları farklı sistemleri okuyor — kullanıcı aynı creative için birden fazla yerde **birbiriyle çelişen kararlar** görebiliyor.
2. Bu üç sistem **kendi içinde Fleiss kappa = −0.114** (random'dan KÖTÜ uyum). 75 creative'de hiçbir vakada üçü aynı action'da buluşmuyor (triple agreement = %0).
3. Bağımsız 4 değerlendirici (Claude multi-signal rater + Codex'in 3 farklı persona agent'ı) eklendiğinde **7-rater unanimous agreement = 0/75**, **6+ rater agreement = 3/75 (%4)**. Bu domain'de "tek doğru karar" yok — disposition farklılığı sonucu büyük ölçüde belirliyor.
4. En yüksek pair-wise uyum: **Claude ↔ Codex Aggressive Growth = %57.3, Cohen's kappa 0.316**. İki bağımsız rater bile ancak bu kadar uyum üretebiliyor.
5. Önceki sistemde mevcut olan **0-100 composite score sistemi kodda hâlâ yaşıyor** (`buildScore()` her snapshot'ta çalışıyor, DB'ye `weighted_score` kolonuna yazılıyor) ama action kararı bundan türetilmiyor — pasif durumda.
6. Score-driven decision engine simülasyonu (kod değişikliği yok, sadece veri yorumu) ile Claude rating uyumu **%34.7 → %49.3**'e çıktı. %90 hedefine ulaşmak için **kullanıcının el-rate kalibrasyonu** ve threshold tuning gerekli.
7. Bu doküman dört yol önerir: (A) Voltran v2 specialized routing — orta vade, (B) Voltran v4 score-driven — score sistemi reactivate, (C) Persona-locked engine — kullanıcı disposition seçer, (D) LLM-per-creative.

---

## 1. Bağlam

### 1.1 "Happy Harbor" sekansı

Adsecute'ta bir media buyer creative detayını açtığında "winner" görüp "scale" önerisi alamadığını şikayet etti. Bu yüzeysel görünüm sonrasında, kodda iki paralel decision engine olduğu (legacy + operator) ve bunun UI'da çelişkiler ürettiği tespit edildi.

5 fazlık bir refactor sekansı (Happy Harbor) yürütüldü:
- Faz A: 200-row stratified audit (8 farklı business)
- Faz B: Tek `CreativeVerdict` kontratı + policy normalize
- Faz C: Phase calibration + naming convention
- Faz D: VerdictBand UI sadeleştirme + rename
- Faz E: Gold v1 + agreement audit ops + PR-blocking safety gate

Sekans kapanışında ilk metric (sample-200 üzerinde) Cohen's kappa **0.10 → 0.91** iyileşme gösterdi. Production'a deploy edildi.

### 1.2 Production'da regression

Kullanıcı production'a baktığında karar kalitesinin **önceki haline göre düştüğünü** tespit etti — özellikle creative'lerin %57'si "diagnose" olarak işaretleniyordu. Sebep: Faz A'da Claude rating'imde koyduğum bir policy kuralı (`trust_degraded + business_validation_missing → hard blocker → diagnose`) Faz B'de production resolver'a entegre edildi. Sample-200'de mantıklı görünen bu kural, küçük businesslarda (target pack ayarı yok) **blanket diagnose pattern** üretti.

### 1.3 Rollback

Production `c079f9f` öncesi commit `96bd038`'e rollback edildi. Git history korundu, git main HEAD ileride kalıyor. Şu an production eski state'inde — kullanıcının "daha iyiydi" dediği hâl. Ama eski state'in kendisi de optimum değil (3 paralel sistem var, panelde tutarsızlık).

### 1.4 Bu audit'in amacı

Production'da çalışan 3 paralel sistemin gerçek karar verme mantıklarını çıkarmak, kalibre edilmiş bağımsız rater'lar (Claude + Codex 3 persona agent) ile karşılaştırmak, ve **sahaya en yakın disposition'ı + birleştirilebilir bir mimari yapıyı** somut sayılarla göstermek.

---

## 2. Üç Paralel Karar Sistemi

Adsecute production kodunda her creative aynı anda üç farklı decision engine'inden geçiyor.

### 2.1 Sistem 1 — Legacy Decision OS

**Dosya:** [`lib/creative-decision-os.ts`](../../lib/creative-decision-os.ts) (3.821 satır)
**Ana fonksiyon:** `buildCreativeDecisionOs()` → `classifyLifecycle()` + `decidePrimaryAction()`

**Çıktı tipleri:**
- `CreativeDecisionLifecycleState` (8 değer): `incubating | validating | scale_ready | stable_winner | fatigued_winner | blocked | retired | comeback_candidate`
- `CreativeDecisionPrimaryAction` (6 değer): `promote_to_scaling | keep_in_test | hold_no_touch | refresh_replace | block_deploy | retest_comeback`
- `CreativeDecision.action` (6 değer): `scale_hard | scale | watch | test_more | pause | kill`

**Decision tree (kompakt):**

```
classifyLifecycle:
  spend<10 + impressions<500 + purchases=0
    → retired (history >= 2 strong window varsa comeback_candidate)

  Recovery operating mode + severe guardrail
    → blocked (purchases>0 + history strong → fatigued_winner)

  ROAS=worse + CPA=worse + spend>=150 + purchases<=1
    → blocked (history strong → comeback_candidate)

  fatigue.status="fatigued"
    → fatigued_winner

  ROAS=better + ClickToPurchase>=ok + purchases>=3 + spend>=150
    → scale_ready (history strong → stable_winner)

  lowSignal (spend<120 OR purchases<2 OR impressions<5000)
    → creativeAge<=10 ? incubating : validating

  default → validating

decidePrimaryAction(lifecycleState):
  scale_ready        → promote_to_scaling
  stable_winner      → hold_no_touch
  fatigued_winner    → refresh_replace
  blocked / retired  → block_deploy
  comeback_candidate → retest_comeback
  diğer              → keep_in_test
```

### 2.2 Sistem 2 — Operator Surface

**Dosyalar:** [`lib/creative-operator-surface.ts`](../../lib/creative-operator-surface.ts) + [`lib/creative-operator-policy.ts`](../../lib/creative-operator-policy.ts) + [`lib/creative-media-buyer-scoring.ts`](../../lib/creative-media-buyer-scoring.ts) (toplam ~4.300 satır)

Sistem 1'in çıktısını **kademeli** olarak genişletir.

**Üç katman:**

**Katman A — MediaBuyerScorecard:** Her creative 8 eksende sınıflandırılır:

| Axis | Değerler |
|---|---|
| relativePerformance | strong / above_baseline / near_baseline / below_baseline / weak / unknown |
| evidenceMaturity | high / medium / low / insufficient |
| trendState | collapsed / declining / stable / accelerating / unknown |
| efficiencyRisk | catastrophic / high / moderate / none / unknown |
| winnerSignal | scale / scale_review / strong / promising / none |
| loserSignal | cut / refresh / watch / none |
| contextState | clear / campaign_blocked / data_blocked / benchmark_weak / unknown |
| businessValidation | favorable / missing / unfavorable |

Bu 8 axis'ten **`operatorSegment`** (15 değer) çıkar:
`scale_ready, scale_review, promising_under_sampled, false_winner_low_evidence, fatigued_winner, kill_candidate, protected_winner, hold_monitor, needs_new_variant, creative_learning_incomplete, spend_waste, no_touch, investigate, contextual_only, blocked`

**Katman B — Policy state** (`resolveState()`): segment + blockers'tan 6 state'e indirger: `do_now / watch / investigate / do_not_touch / blocked / contextual_only`.

**Katman C — Final operator decision** (`resolveCreativeOperatorDecision()`): segment'i **6 primary action'a** indirger: `scale | test_more | protect | refresh | cut | diagnose`.

**Mapping:**

| Segment | Primary Decision | Sub-tone |
|---|---|---|
| scale_ready | scale | queue_ready / default |
| **scale_review** | **scale** | **review_only** ← burada "winner ama review" çelişkisi |
| promising_under_sampled | test_more | default |
| protected_winner / no_touch | protect | default |
| fatigued_winner / needs_new_variant | refresh | default / revive |
| kill_candidate / spend_waste | cut | manual_review |
| investigate / contextual_only / blocked / false_winner_low_evidence / creative_learning_incomplete | diagnose | manual_review |

### 2.3 Sistem 3 — V2 Preview

**Dosya:** [`lib/creative-decision-os-v2.ts`](../../lib/creative-decision-os-v2.ts) (791 satır)
**Ana fonksiyon:** `resolveCreativeDecisionOsV2()`

Diğer iki sistemden **bağımsız** kendi 13-dallı decision tree'sini çalıştırır. Düz numerical input alır (spend, roas, recent, long90, peerMedian, benchmarkRoas, trustState, blocker flags).

**Çıktı:** `primaryDecision (Scale/Cut/Refresh/Protect/Test More/Diagnose)` + `actionability (direct/review_only/blocked/diagnose)` + `riskLevel (low/medium/high/critical)` + `problemClass (creative/campaign-context/data-quality/insufficient-signal)` + `secondarySuggestion`.

**Decision tree özü:**
```
1. trustState=inactive_or_immaterial → Diagnose
2. inactive + (spend<120 OR no benchmark) → Diagnose
3. inactive + campaignBlocked + roasRatio>=2.4 → Diagnose (secondary: Refresh)
4. inactive + roasRatio<=0.65 + recent<=0.25 + spend>=250 → Cut
5. inactive + (roasRatio>=0.8 OR recent>=1) → Refresh (review)
6. !hasReliableBenchmark → Diagnose
7. spend<75 → Test More OR Diagnose
8. degraded + below_peer + roasRatio<=0.35 → Diagnose OR Test More
9. ... (10+ daha)
```

### 2.4 UI Yüzey × Sistem Eşleşmesi

| UI Yüzey | Beslendiği sistem | Field |
|---|---|---|
| Detail drawer "Verdict" pill | **Sys2 varsa, yoksa Sys1 fallback** | `operatorItem.primaryAction` veya `decision.action + lifecycleState` |
| Detail drawer "Action plan" | Sys2 | `buildCreativeOperatorItem()` |
| Detail drawer lifecycle label | Sys1 | `decision.lifecycleState` |
| Decision OS Overview "Lifecycle Pipeline" | Sys1 | `pattern.lifecycleState` |
| Decision OS Overview "Family rollup" | Sys1 | `family.primaryAction` |
| Decision OS Overview "Operator queues" | Sys2 | `creative.operatorPolicy` |
| Top section filter dropdown ("Lifecycle state", "Primary action") | Sys1 | `creative.lifecycleState`, `creative.primaryAction` |
| Top section quick filter (6 pill: Scale/Test More/Protect/Refresh/Cut/Diagnose) | Sys2 | `buildCreativeQuickFilters()` |
| **"Today Priority / Buyer Command Strip" widget** | **Sys3** | `decisionOsV2Preview.creatives[]` |
| Tablo Verdict kolonu | Sys2 + Sys1 karışık | mixed |
| PublicCreativeSharePage | Sys2 | `analysis.actionLabel` |

Yani aynı creative için Detail drawer Sys2'ye, "Today Priority" widget'ı Sys3'e, lifecycle pipeline Sys1'e bakıyor. Üçü farklı karar verirse kullanıcı çelişen kararlar görüyor.

### 2.5 Aynı creative üzerinde 3 sistem örneği

```
spend=$2,349, purchases=47, roas=3.20
median=3.52 (peer 0.91×)
fatigue.roasDecay=0.10 (status=watch, not fatigued)
winnerMemory=true, creativeAge=31 days
trustState=degraded_missing_truth, businessValidation=missing
targetPackConfigured=false → economics.roasFloor=2.0
activeStatus=false (paused)
```

| Sistem | Lifecycle / Segment | Action | UI label |
|---|---|---|---|
| Sys1 | `fatigued_winner` (winner memory + watch decay) | `refresh_replace` | "Refresh — fatigued winner" |
| Sys2 | mediaBuyer: `fatigued_winner` segment | `refresh` | "Refresh" pill |
| Sys3 | inactive + roasRatio=1.07× + long90 high + recentP low | **`Diagnose`** secondary: Refresh | **"Diagnose" widget** |

Aynı creative — Detail drawer "Refresh", "Today Priority" widget "Diagnose", lifecycle pipeline tile "Fatigued Winner". Kullanıcı: "ne yapacağım?".

---

## 3. 75 Creative Live Audit — Adsecute İçi Uyum

**Veri:** Production snapshot 2026-04-28, IwaStore (35 creative) + TheSwaf (40 creative).

3 sistem her creative için 6-action uzayına (`scale / test_more / protect / refresh / cut / diagnose`) indirgendi.

### 3.1 Adsecute 3 sistem pair-wise uyum

| Pair | Match | Agreement | Cohen κ |
|---|---:|---:|---:|
| Sys1 ↔ Sys2 | 23/75 | 30.7% | 0.139 |
| **Sys1 ↔ Sys3** | **2/75** | **2.7%** | **−0.061** |
| Sys2 ↔ Sys3 | 30/75 | 40.0% | −0.085 |
| **Triple agreement (Sys1=Sys2=Sys3)** | **0/75** | **0%** | — |
| **Fleiss κ (3 sistem)** | — | — | **−0.114** |

**Sistem 1 ↔ Sistem 3 sadece %2.7 — neredeyse zıt yönlerde.** Adsecute'un kendi içinde Fleiss kappa NEGATİF, yani üç sistem random uyumdan KÖTÜ.

### 3.2 Action dağılımı (3 sistem)

| Sistem | scale | test_more | protect | refresh | cut | diagnose |
|---|---:|---:|---:|---:|---:|---:|
| Sys1 Legacy | 0 | 48 | 6 | 10 | 11 | 0 |
| Sys2 Operator | 2 | 20 | 0 | 8 | 5 | **40** |
| Sys3 V2 Preview | 3 | 9 | 4 | 1 | 0 | **58** |

Her sistemin "kör spotu" var:
- Sys1: scale + diagnose hiç üretmiyor (4-action engine)
- Sys2: protect hiç üretmiyor, %53 diagnose
- Sys3: cut hiç üretmiyor, %77 diagnose

---

## 4. Bağımsız Değerlendiriciler

### 4.1 Claude — Multi-signal rater

[`docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/claude-rating.json`](audit-F-iwastore-theswaf/claude-rating.json)

**Sinyal seti:** ROAS (vs break-even + vs peer benchmark) + CTR strength + hook rate (attention) + click-to-purchase ratio + CPA efficiency + compound fatigue (3 windows) + creative quality flags + landing problem detection + naming convention + format pattern + frequency proxy + winner memory.

**Disposition:** "Pragmatic active media buyer" — break-even peer-relative (median × 0.7), funnel signal'a saygı, paused historical winner = protect candidate, real measurement broken için çok dar diagnose tanımı.

### 4.2 Codex — 3 Farklı Persona Agent

[`docs/team-comms/happy-harbor/audit-G-three-systems/codex-agents-notes.md`](audit-G-three-systems/codex-agents-notes.md)

**Agent A — Aggressive Growth / Scaling-First:** Düşük kanıt eşikleri, hızlı scale, geç fatigue çağrısı, tutucu cut.
**Agent B — Conservative / Efficiency-First:** Yüksek kanıt, agresif cut, az scale, erken fatigue.
**Agent C — Funnel / Creative-Quality-First:** ROAS sonuç değil — CTR + hook + click-to-purchase ana sinyal.

Action dağılımları (her agent persona'sını yansıtıyor):

| Agent | scale | test_more | protect | refresh | cut | diagnose |
|---|---:|---:|---:|---:|---:|---:|
| A Growth | **13** | 44 | 7 | 8 | 3 | 0 |
| B Efficiency | 1 | 13 | 3 | 14 | **17** | 27 |
| C Funnel | 4 | 27 | 0 | 5 | 4 | **35** |

---

## 5. Final 7-Rater Karşılaştırma Matrisi

[`docs/team-comms/happy-harbor/audit-G-three-systems/agreement-matrix.json`](audit-G-three-systems/agreement-matrix.json)

### 5.1 Pair-wise (Cohen's kappa)

| | Sys1 | Sys2 | Sys3 | Claude | Cdx A | Cdx B | Cdx C |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Sys1** | — | 30.7% / 0.139 | 2.7% / −0.061 | 53.3% / 0.192 | 53.3% / 0.218 | 29.3% / 0.146 | 33.3% / 0.115 |
| **Sys2** | | — | 40.0% / −0.085 | 32.0% / 0.125 | 14.7% / −0.034 | 46.7% / 0.266 | 37.3% / 0.025 |
| **Sys3** | | | — | 18.7% / 0.056 | 13.3% / 0.054 | 34.7% / 0.061 | 45.3% / 0.078 |
| **Claude** | | | | — | **57.3% / 0.316** | 34.7% / 0.197 | 38.7% / 0.161 |
| **Cdx A** | | | | | — | 26.7% / 0.151 | 30.7% / 0.100 |
| **Cdx B** | | | | | | — | 36.0% / 0.140 |

**Fleiss kappa:**
- 7 rater hepsi: **0.083**
- Adsecute 3 sistem: **−0.114**
- Independent 4 (Claude + 3 Codex): **0.142**

### 5.2 N-way agreement

| Threshold | Count / 75 | % |
|---|---:|---:|
| **7 rater unanimous** | **0** | **0%** |
| ≥6 rater | 3 | 4.0% |
| ≥5 rater | 17 | 22.7% |
| ≥4 rater | 40 | 53.3% |
| ≥3 rater | 70 | 93.3% |

### 5.3 Anahtar bulgular

1. **Hiçbir creative'de 7 rater unanimous değil.** Bu domain'de "tek doğru karar" istatistiksel olarak yok.
2. **Bağımsız rater'lar arasındaki en yüksek pair-wise uyum %57.3** (Claude ↔ Codex Aggressive Growth). Bu **uzman buyer'ların tavanı** olarak görünüyor — disposition farklılığı sonucu büyük ölçüde belirliyor.
3. **Adsecute 3 sistem birbiriyle Fleiss κ = −0.114**: random uyumdan kötü. Bu kullanıcının "panelde bir yerde yanlış başka yerde doğru" şikayetinin doğrudan istatistiksel kaynağı.
4. **Sys2 ↔ Codex Efficiency κ = 0.266**: Sys2'nin dispositional yönü doğru ama eşik kalibrasyonu agresif (%53 diagnose).
5. **Sys3 her bağımsız rater'la düşük uyumda** (κ 0.05-0.08): production yüzeylerinden kaldırılması önerilir.

---

## 6. Mevcut "0-100 Composite Score" Sisteminin Keşfi

Kullanıcı önceki bir sistemde 0-100 puanlama olduğunu hatırlattı. Kodda detaylı arama: **score sistemi tam olarak hâlâ canlı, 4 farklı yerde**.

### 6.1 Composite score — `buildScore()`

[`lib/creative-decision-os.ts:2140`](../../lib/creative-decision-os.ts) — her snapshot'ta her creative için 0-100 score üretiyor:

```
Base: 55
+14  ROAS benchmark > peer
+9   CPA benchmark < peer
+6   CTR benchmark > peer
+8   Click-to-purchase benchmark > peer
+5   purchases >= 4
+4   spend >= 200
−20  fatigue = "fatigued"
−9   fatigue = "watch"
−28  lifecycle = "blocked"
−18  lifecycle = "retired"
−8   lifecycle = "comeback_candidate"
   → clamp(0, 100)
```

Production snapshot'larda her satırda `c.score` field'ı doluyor (örn. WallArtCatalog=61, WoodenWallArtCatalog=66).

### 6.2 Altı sub-score (her biri 0-100)

[`components/creatives/CreativesTableSection.tsx:306-367`](../../components/creatives/CreativesTableSection.tsx) — 6 ayrı 0-100 score:

| Sub-score | Formül (ağırlıklı toplam, scaleMetricToScore ile target'a göre normalize) |
|---|---|
| **Hook** | thumbstop·0.7 + video25·0.3 (video) ya da CTR·0.65 + seeMore·0.35 (image), + AI hook tactic boost +6 |
| **Watch** | thumbstop·0.2 + video50·0.5 + video100·0.3 |
| **Click** | ctrAll·0.45 + linkCtr·0.4 + seeMore·0.15 |
| **CTA** | linkCtr·0.35 + clickToAtc·0.4 + clickToPurchase·0.25 + CTA headline boost +8 |
| **Offer** | ROAS·0.35 + clickToAtc·0.25 + atcToPurchase·0.4 + explicit offer boost +10 |
| **Convert** | ROAS·0.45 + clickToPurchase·0.3 + atcToPurchase·0.25 |

UI'da preset olarak hâlâ kullanılıyor: **"Creative teams"** — *"Creative-friendly score view. Replaces raw buyer metrics with 0-100 reads on hook, CTA, offer, and conversion fit."*

### 6.3 DB persistence

[`lib/meta/creative-score-service.ts`](../../lib/meta/creative-score-service.ts) — `meta_creative_score_snapshots` tablosunda `weighted_score DOUBLE PRECISION` kolonu, ruleVersion = `meta-creative-score-v1`.

### 6.4 AI scoring prompt

[`lib/ai/generate-creative-decisions.ts:244`](../../lib/ai/generate-creative-decisions.ts): "Produce a creative performance score between 0 and 100."

### 6.5 Asıl bulgu — score canlı ama "kapatılmış"

```
Raw metrics → buildScore() → c.score (0-100) → snapshot'a yazılıyor
                                              ↓
                                     (action kararına etki etmiyor)

Raw metrics → classifyLifecycle() → decidePrimaryAction() → c.action → UI render
```

Score hesaplanıyor ama **action kararı bağımsız bir code-path'ten geçiyor**. Score sadece bir info field. Önceki sistemin (kullanıcının hatırladığı) action engine'i muhtemelen score-driven idi (threshold-based: score ≥ 80 → scale, vb.) — şu an pasifleştirilmiş.

---

## 7. Score-Driven Decision Simülasyonu (Voltran v4)

Kod değişikliği yapmadan, mevcut snapshot verisi üzerinde Python simülasyonu yapıldı. 3 modifikasyon eklendi:

1. **Mature evidence multiplier:** `score × (0.5 + 0.5 × min(1, spend/200) × min(1, purchases/4))` — yetersiz veri olan vakalarda score yarıya kadar iner
2. **Peer-relative break-even hassaslaştırma:** `+18 if peer_ratio >= 1.5 / +10 if >= 1.1 / 0 if >= 0.85 / −12 if >= 0.6 / −25 if < 0.6`
3. **Sub-score override + paused state ayrımı:** creative quality dead → cut; landing problem → keep_testing; paused historical winner → protect; fatigue → refresh

**Threshold-to-action:**
```
score >= 80 → scale
>= 70 → protect
>= 50 → test_more
>= 35 → refresh (if spend mature)
< 35  → cut
```

### 7.1 Sonuç — Claude rating ile uyum

| Yaklaşım | Match | Agreement |
|---|---:|---:|
| Eski simple threshold (score'a direkt) | 26/75 | 34.7% |
| **Voltran v4 (score + 3 modifikasyon)** | **37/75** | **49.3%** |
| Hedef | — | %90 |

**+14 puan iyileşme, ama hâlâ %50'nin altında.** Score sistemi yön verir ama tek başına hedefe taşımıyor.

### 7.2 Niye %49 tavanı?

1. **Threshold'lar boşlukta tahmin** — eşikler senin sezgine göre kalibre edilmedi (el-rate yok)
2. **Peer-relative hard cut override eksik** — peer < 0.65 + spend mature vakalarda score 50-65 arası kalıyor, Claude direkt cut diyor
3. **Sub-score signal'lar zayıf entegre** — snapshot'ta hookScore/clickScore field'ları doğrudan yok (formüller var, satır bazında uygulanmadı)

### 7.3 %49.3'ten %90'a giden yol

**Tek hızlandırıcı: kullanıcının el-rate kalibrasyonu (30-100 satır ground truth).** Onsuz threshold tuning kör atış. El-rate ile:
- Threshold'lar grid search ile fit edilir
- Peer-relative hard cut sınırı kalibre edilir
- Maturity multiplier ağırlığı tune edilir
- Sub-score override eşikleri ayarlanır
- Beklenen uyum: %75-90

---

## 8. Hedef Analizi — %90 Mümkün Mü?

### 8.1 Veri ne diyor?

| Pair | Agreement | Cohen κ |
|---|---:|---:|
| En yüksek (Claude ↔ Codex Growth) | 57.3% | 0.316 |
| Sys2 ↔ Codex Efficiency | 46.7% | 0.266 |
| **Bağımsız 4 rater Fleiss** | — | **0.142** |

Bağımsız uzman media buyer'lar arasında **%14 systematic uyum üst sınırı** görünüyor. Bu domain'de farklı disposition'lar farklı doğru karar üretiyor — "kanonik tek doğru" yok.

### 8.2 %90 Üç farklı disposition'da mümkün

%90 hedefini tutturmak için **disposition tek olmalı**. Ya kullanıcı bir disposition seçer (Aggressive Growth / Conservative Efficiency / Funnel-First / Balanced), ya kullanıcının kendi davranışından sistem öğrenir (calibration loop), ya da tek bir LLM agent kullanıcı promp'una göre karar verir.

3 yol:
- **Yol 1 — Persona-locked deterministic:** Disposition seçer + deterministic engine. ~1 hafta. %85-90 mümkün.
- **Yol 2 — Calibration loop:** El-rate + ML weight learning + override feedback. ~3-4 hafta. %85-90, sürekli bakım.
- **Yol 3 — LLM per-creative:** Claude Opus / GPT-4 her satıra. ~2 hafta. ~$50-100/gün maliyet.

---

## 9. Önerilen Yollar (4 Seçenek)

### Opsiyon X — Conservative hot-fix (~1 sprint, düşük risk)

1. Sistem 3'ü (V2 Preview) UI'dan tamamen kaldır → "Today Priority" widget Sistem 2'nin operator queue'sundan beslenir
2. Sistem 2'nin diagnose semantiğini gevşet: `target_pack_missing` artık hard blocker değil, sadece `needs_review`
3. Sistem 1 + 2 fallback yapısı korunur
4. Beklenen: panel-içi çelişki ~%80 azalır, action dağılımı dengelenir, Sys2 ↔ bağımsız rater κ 0.13 → 0.30+

**Avantaj:** En düşük risk, mevcut altyapı korunur. **Dezavantaj:** %90 hedefine ulaşmaz, ~%55-65 civarı.

### Opsiyon Y — Voltran v2 specialized routing (~2 hafta, orta risk)

3 sistemi öldürmek yerine birleştir:
```
1. Sys3 = "Diagnose data-quality" + Sys2 = "blocked"
   → DIAGNOSE
2. Inactive → Sys3'ün paused logic
3. Sys1 lifecycle ∈ (scale_ready, stable_winner) + Sys2 = scale_ready
   → SCALE (consensus)
4. Sys1 = fatigued OR Sys2 = fatigued
   → REFRESH (consensus)
5. Sys1 = kill OR Sys2 = kill_candidate
   → CUT (consensus)
6. Sys2 = protected_winner + Sys1 = stable_winner
   → PROTECT
7. Default → Sys1.primaryAction → 6-action map
```

**Avantaj:** Hiçbir sistemden bilgi atılmaz; uzmanlık alanları lider. **Dezavantaj:** İlk simülasyonda Sys2 dominant kaldı (Voltran v1 ↔ Sys2 = %97). Specialized routing daha akıllı ama tahmin %60-70 — %90 değil.

### Opsiyon Z — Voltran v4 score-driven (~1-2 hafta, orta risk, yüksek potansiyel)

Mevcut `buildScore()` + sub-score altyapısını reactivate et + 3 modifikasyon (maturity multiplier, peer-relative, sub-score override) + threshold-based action engine.

**Avantaj:**
- Yorumlanabilir (kullanıcı "neden cut?" diye sorduğunda → "score 38, hookScore 22 → creative kalite problemi")
- Mevcut altyapı kullanılır (kod silmeye gerek yok, score zaten her snapshot'ta hesaplanıyor)
- Tek decision path → 3-sistem çelişkisi yok
- Sub-score'lar zengin teşhis verir
- Kalibre edilebilir (kullanıcı el-rate ile threshold tune edilir)

**Dezavantaj:** El-rate olmadan tahmin atışı. Mevcut simülasyonda %49.3. %90 için 30-50 satır el-rate gerek.

### Opsiyon Q — Persona selector (~1 ay, yüksek değer)

UI'a "Disposition" seçici eklenir (Aggressive Growth / Conservative Efficiency / Funnel-First / Balanced). Default = "Balanced" (Voltran v4 base). Her disposition kendi eşik setiyle 6-action karar verir.

**Avantaj:** Bağımsız 4 rater Fleiss 0.142 verisi destekliyor — disposition farklılığı gerçek. Tek "doğru" karar dayatmak yerine kullanıcıya yetki verir. Aynı creative farklı disposition'larda farklı action gösterir → bu **bug değil, feature**.

**Dezavantaj:** UX değişikliği, kullanıcının disposition'ını anlaması gerek. Default kalibrasyonu yine el-rate ister.

### Önerim

**X + Z kombinasyon:**

1. Önce X ile production'ı stabilize et (~1 sprint): Sys3 UI'dan kaldır, Sys2 diagnose gevşet → kullanıcı acil olarak ferahlasın
2. Paralelinde Z için 30 creative el-rate al (~2 saat tek session) + Voltran v4 kalibre et
3. Voltran v4 production-ready olunca Sys1+Sys2 yerine geçir
4. Q (persona selector) bir sonraki major release'de opsiyonel feature

Bu 1-2 ay'lık bir refactor — Happy Harbor'dan ders alarak küçük adımlarla.

---

## 10. Açık Sorular & Sıradaki Adım

### 10.1 ChatGPT Pro / dış görüş için sorular

1. **Veri-bazlı:** %14 Fleiss κ tavanı veriyor → bu domain'de mi değil, ölçüm yöntemimde mi sorun var? Kappa metric'i 6-class confusion için doğru mu, weighted κ daha mı uygun?
2. **Mimari:** 3 paralel sistem yerine score-driven tek path daha mı doğru, yoksa specialized routing (Voltran v2) farklı sistemleri farklı uzmanlık alanlarında lider yapmak daha mı akıllı? Hangi yaklaşım veriyle daha uyumlu?
3. **Ürün:** Persona selector (Q) gerçek bir UX kazanımı mı, yoksa kullanıcıyı kararı kendisinin vermeye zorlamak mı? Endüstri standartları nedir (Northbeam, Triple Whale, Adsmurai, Madgicx vb. bu sorunu nasıl çözmüş)?
4. **Calibration:** El-rate dataset boyutu için optimal nokta? 30 yeterli mi, 100 mü, 200 mü? Active learning yaklaşımı (kullanıcının zorlandığı vakaları sonradan ekleyerek genişletme) bu domaine uyar mı?
5. **Score formülü:** Mevcut `buildScore()` formülünün ağırlıkları (ROAS +14, CPA +9, CTR +6, click-to-purchase +8) deneyimsel mi, yoksa veri-driven mi belirlendi? Yeniden kalibre edilmesi gerek mi?

### 10.2 Repo / kod referansları (ChatGPT Pro için)

- **Üç decision system:** [`lib/creative-decision-os.ts`](../../lib/creative-decision-os.ts), [`lib/creative-operator-surface.ts`](../../lib/creative-operator-surface.ts) + [`lib/creative-operator-policy.ts`](../../lib/creative-operator-policy.ts) + [`lib/creative-media-buyer-scoring.ts`](../../lib/creative-media-buyer-scoring.ts), [`lib/creative-decision-os-v2.ts`](../../lib/creative-decision-os-v2.ts)
- **Score sistemi:** [`lib/creative-decision-os.ts:2140 buildScore`](../../lib/creative-decision-os.ts), [`lib/meta/creative-score-service.ts`](../../lib/meta/creative-score-service.ts), [`components/creatives/CreativesTableSection.tsx:306-367`](../../components/creatives/CreativesTableSection.tsx)
- **UI yüzeyleri:** [`components/creatives/CreativeDetailExperience.tsx`](../../components/creatives/CreativeDetailExperience.tsx), [`components/creatives/CreativesTopSection.tsx`](../../components/creatives/CreativesTopSection.tsx), [`components/creatives/CreativeDecisionOsOverview.tsx`](../../components/creatives/CreativeDecisionOsOverview.tsx), [`components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`](../../components/creatives/CreativeDecisionOsV2PreviewSurface.tsx)
- **Audit verileri:**
  - [audit-F-iwastore-theswaf/](audit-F-iwastore-theswaf/) — Claude multi-signal rating + raw metrics
  - [audit-G-three-systems/](audit-G-three-systems/) — 3 sistem extraction + Codex 3 agent + final 7-rater matrix + score-vs-claude analizi + Voltran v4 simülasyon
  - [audit-G-three-systems/FINAL-7-RATER-REPORT.md](audit-G-three-systems/FINAL-7-RATER-REPORT.md)
- **Happy Harbor ekip iletişim arşivi:** [docs/team-comms/happy-harbor/](.) (00-charter.md → 24-codex-rollback-confirmation.md, 25 numaralı dosya)
- **Production rollback:** Rollback hedefi `96bd038` (Happy Harbor öncesi). Detay: [24-codex-rollback-confirmation.md](24-codex-rollback-confirmation.md)

### 10.3 Bekleyen kararlar

- **Bu yolu hangi sırayla yürüteceğiz?** (X → Z → Q sıralaması mı, yoksa farklı önceliklendirme mi?)
- **Kullanıcı el-rate'i ne zaman?** (Z opsiyonu için 30 creative üzerinde ~30-60 dakika)
- **Persona selector (Q) ürün vizyonuna uyuyor mu?** (Adsecute "tek karar otoritesi" mi olmak istiyor, yoksa "buyer'ın yargısını destekleyen sistem" mi?)

---

**Bu doküman dinamik — yeni audit/karar geldikçe güncellenir. ChatGPT Pro feedback'i bu dokümanın sonuna eklenebilir.**
