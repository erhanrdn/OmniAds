# Happy Harbor — Faz B Handoff (Claude → Codex)

> Önceki: [07-claude-A6-systemic-patterns.md](07-claude-A6-systemic-patterns.md) — Faz A.5 onayı + 7 sistemik pattern raporu (A.6).
> Sonraki tetikleyici: bu dosya iletildiğinde Codex Faz B implementation'una başlar; Faz A kapanır.

---

## 0. Bağlam — Faz A'dan ne öğrendik

Faz A audit'i 200 satır × 3 rater (Adsecute / Codex / Claude) ile çalıştı. Sonuç:
- Action ekseninde Cohen's kappa **0.09–0.13** (hedef ≥ 0.80).
- Üçlü consensus oranı **%2** (4/200).
- 7 sistemik pattern tespit edildi ([07-claude-A6-systemic-patterns.md](07-claude-A6-systemic-patterns.md) § 3).

Plan'daki Faz B "tek `CreativeVerdict` kontratı" tek başına yetmiyor. Coherence için **kontrat birleştirme + policy normalize** birlikte gerekli. Bu handoff her iki işi de kapsıyor.

---

## 1. Faz B'nin görevi — Tek tanım

Adsecute'ta her creative için tek `CreativeVerdict` kontratı + tek policy ile, üçlü canlı audit'te **Cohen's kappa ≥ 0.80** sağlayan implementation.

Bitiş kriteri (Faz B'nin sonunda):
1. Yeni `lib/creative-verdict.ts` tek canonical type.
2. Tek `resolveCreativeVerdict(input) → CreativeVerdict` resolver, mevcut legacy + operator + V2 sistemlerini içeriden tüketiyor.
3. Tüm UI yüzeyleri (detail, table, drawer, share, V2 preview) yeni kontratı tüketiyor; legacy verdict theme helper çift-rendering'i kaldırıldı.
4. `pnpm test` ve `pnpm creative:v2:safety` yeşil. Macro F1 ≥ 90 (gold-label v0).
5. **Faz A sample-200'ü Faz B implementation'ına yeniden çalıştırıldığında**, Adsecute output'u (bu sefer yeni resolver'dan) ↔ Claude rating ↔ Codex rating arasında üçlü Fleiss kappa ≥ 0.50. (Tam %0.80 hedefi Faz C/D ile beraber yakalanır; Faz B kapanışı için 0.50 eşiği.)

---

## 2. Mimari — `CreativeVerdict` kontratı

```ts
// lib/creative-verdict.ts (yeni)
export const CREATIVE_VERDICT_VERSION = "creative-verdict.v1" as const;

export type CreativePhase = "test" | "scale" | "post-scale";

export type CreativeVerdictHeadline =
  | "Test Winner"
  | "Test Loser"
  | "Test Inconclusive"
  | "Scale Performer"
  | "Scale Underperformer"
  | "Scale Fatiguing"
  | "Needs Diagnosis";

export type CreativeAction =
  | "scale" | "keep_testing" | "protect" | "refresh" | "cut" | "diagnose";

export type CreativeActionReadiness = "ready" | "needs_review" | "blocked";

export interface CreativeReason {
  tag: CreativeReasonTag;
  weight: "primary" | "supporting";
}

export interface CreativeVerdict {
  contractVersion: typeof CREATIVE_VERDICT_VERSION;
  phase: CreativePhase;
  headline: CreativeVerdictHeadline;
  action: CreativeAction;
  actionReadiness: CreativeActionReadiness;
  confidence: number;            // 0..1
  evidence: CreativeReason[];
  blockers: CreativeBlockerReason[];
  derivedAt: string;             // ISO 8601
}
```

### `resolveCreativeVerdict(input) → CreativeVerdict`

Mevcut sistemleri tek resolver'a indirgeyen tek API. Argümanlar (existing types reuse):

```ts
function resolveCreativeVerdict(input: {
  metrics: { spend30d, purchases30d, roas30d, recent7d, mid30d, long90d, relative };
  delivery: { activeStatus, campaignStatus, adSetStatus };
  baseline: { selected: { medianRoas, medianSpend, reliability } };
  commercialTruth: { targetPackConfigured, targetRoas, businessValidationStatus };
  context: { trustState, deploymentCompatibility, campaignIsTestLike };
}): CreativeVerdict;
```

Legacy verdict theme helper'ları kaldırılıyor; tek tema fonksiyonu `getVerdictTheme(verdict: CreativeVerdict)` kalıyor.

Compile-time enforcement: UI hiçbir yerde `lifecycleState`, `primaryDecision`, `subTone`, `actionability` ham olarak okumuyor — sadece `CreativeVerdict` görüyor. Mevcut `CreativeDecisionOs` tipinde bu ham alanlar private kalsın, public surface sadece `CreativeVerdict[]`.

---

## 3. Policy normalize — 7 sistemik pattern'in çözümü

Faz A.5'in ortaya koyduğu disagreement kaynakları. Her pattern için spec yazdım — Codex bunları `resolveCreativeVerdict` içinde implemente edecek.

### 3.1 Fatigue detection — phase-bağımsız (Pattern 1)

Fatigue check **her phase'de** çalışmalı, sadece post-scale'de değil. Spec:

```
recent7Roas, long90Roas finite ve long90Roas > 0 ise:
  ratio = recent7Roas / long90Roas
  if (ratio < 0.55 AND recent7Roas < breakEven * 0.6 AND long90Roas >= breakEven):
    → headline = "Scale Fatiguing", action = "refresh", phase = "post-scale" (force)
  if (ratio < 0.4 AND m.recent7d.spend > 30):
    → headline = "Scale Fatiguing", action = "refresh", phase = "post-scale" (force)
```

Cutoff 0.6 yerine 0.55 — Codex (0.7) ile Claude (0.6) arasında. Daha sıkı kalibre etmek istersek Faz C'de daraltırız.

### 3.2 Spend tier ayrımı — "test phase"den çıkış (Pattern 2)

Spend büyüklüğü tek başına test phase'ten çıkışı tetiklemeli. Spec:

```
if (spend30d >= 5000 OR spendToMedian >= 5):
  phase = "scale" (force; test-phase asla bu büyüklükte mantıklı değil)
```

Bu, Codex'in $116K creative'i "test_inconclusive" demesini engelliyor.

### 3.3 Blocker semantik tablosu — KANONİK (Spec Gap 2 + Pattern 3)

[03-claude-review-A.md](03-claude-review-A.md) § 4 Gap 2'de söz verdiğim tablo:

| Reason / state | Sınıf | Sonuç |
|---|---|---|
| `trust_state == "degraded_missing_truth"` (alone) | Missing truth | actionReadiness = `needs_review` |
| `business_validation_status == "missing"` (alone) | Missing truth | actionReadiness = `needs_review` |
| `business_validation_status == "unfavorable"` (alone) | Missing truth | actionReadiness = `needs_review` |
| `trust_degraded_missing_truth` + `business_validation_missing` co-occurrence | **Hard blocker** | **headline = "Needs Diagnosis", action = "diagnose", readiness = "blocked"** |
| `business_validation_status == "unfavorable"` + `phase == "scale"` | Hard blocker | action = "cut", readiness = "needs_review" (review for cut) |
| `delivery.activeStatus == false` + scale phase | Soft blocker | action stays, readiness = `needs_review` |
| `delivery.activeStatus == false` + test phase + roasRatio >= 1.2 | Pending | headline = "Test Winner", action = "scale", readiness = `needs_review` (paused winner reactivation) |
| `deployment_compatibility == "limited"` (alone) | Soft blocker | readiness = `needs_review` |

Bu tablo Adsecute'un Diagnose stiline yaklaşıyor (Pattern 3'teki 60-row gap'i kapatıyor).

### 3.4 Break-even kaynağı — KANONİK (Spec Gap 1 + Pattern 4)

```
breakEven =
  commercialTruth.targetPackConfigured && commercialTruth.targetRoas > 0
    ? commercialTruth.targetRoas
    : baseline.selected.medianRoas > 0
      ? baseline.selected.medianRoas
      : 1.0
```

Tek kaynak. Codex 1.0 yerine bu hesaplı değeri kullanacak. Pattern 4'ün doğrudan çözümü.

### 3.5 actionReadiness — sıfırdan policy (Pattern 5)

```
if (action == "diagnose") readiness = "blocked"
else if (active && targetPackConfigured && businessValidationStatus == "favorable" && trustState == "live_confident") readiness = "ready"
else if (action == "cut" && businessValidationStatus == "unfavorable" && trustState == "live_confident") readiness = "ready"  // confident cut
else if (any hard blocker) readiness = "blocked"
else readiness = "needs_review"
```

Bu, "asla ready üretme" Adsecute pattern'ini kırıyor. Claude+Adsecute hiçbir creative'i ready üretmiyor; Pattern 5'in dediği gibi bu üründe "Promote to Scale" butonu hep gri kalıyor — Faz D UI sadeleştirmesi bu policy değişikliğine bağlı.

### 3.6 Test→Scale phase derivation (Pattern 6'nın temel sebebi)

```
if (any hard blocker per § 3.3) phase = derived for context only — but override headline/action
else if (spend30d >= 5000 OR spendToMedian >= 5) phase = "scale" (per § 3.2)
else if (spend30d >= 2 * baseline.selected.medianSpend && purchases30d >= 8 && delivery.activeStatus) phase = "scale"
else if (recent7Roas/long90Roas < 0.4 OR (ratio < 0.55 && recent7Roas < breakEven * 0.6)) phase = "post-scale" (per § 3.1)
else phase = "test"
```

### 3.7 Confidence — non-degenerate dağılım (Pattern 4'ün confidence varyasyonu)

```
maturity:    purchases >= 8 && spend >= 200 → +0.30
             purchases >= 3                 → +0.15
signal:      |roasRatio - 1| >= 0.5         → +0.20
             |roasRatio - 1| >= 0.2         → +0.10
trust:       live_confident                  → +0.30
             degraded_missing_truth           → +0.10
baseline:    reliability == "strong"         → +0.10
             reliability == "medium"         → +0.05
diagnose:    cap at 0.7

Final: clamp(0.30, 0.95)
```

UI'da düşük confidence rating'leri "needs_review" rozetiyle göstermek için kullanılacak (Faz D).

### 3.8 Commercial truth integration verification gate (Faz B kapanışında zorunlu)

Bu spec'e geçmeden önce yaptığım entegrasyon denetimi commercial truth'un kanonik fonksiyonu, fetch path'i, ve UI tüketimi yapısal olarak doğru tarafa bağlandığını gösteriyor:

| Katman | Kanonik path | Durum |
|---|---|---|
| Source fetch | [lib/business-commercial.ts:1080](../../lib/business-commercial.ts) `getBusinessCommercialTruthSnapshot(businessId)` | ✓ |
| Creative DO source | [lib/creative-decision-os-source.ts:490](../../lib/creative-decision-os-source.ts) `getBusinessCommercialTruthSnapshot(input.businessId)` → injection point | ✓ |
| Meta DO source | [lib/meta/decision-os-source.ts:54-100](../../lib/meta/decision-os-source.ts) `Promise.all([getBusinessCommercialTruthSnapshot(...)…])` → `commercialTruth: snapshot` | ✓ |
| Resolver field path | [lib/creative-decision-os.ts:1347-1350](../../lib/creative-decision-os.ts) `commercialTruth?.targetPack?.targetRoas / breakEvenRoas / targetCpa / breakEvenCpa` | ✓ |
| Creative UI | [components/creatives/CreativeDecisionOsOverview.tsx:186,498,597](../../components/creatives/CreativeDecisionOsOverview.tsx) `decisionOs.commercialTruthCoverage` | ✓ |
| Meta UI | [components/meta/meta-decision-os.tsx:927-962](../../components/meta/meta-decision-os.tsx) `decisionOs.commercialTruthCoverage` (mode + targetPackConfigured + countryEconomicsConfigured + promoCalendarConfigured + operatingConstraintsConfigured + notes[0]) | ✓ |

**Yapısal entegrasyon doğru.** Ama A.5 sample'ı kritik bir veri-kapsam boşluğu gösteriyor:

| Business | Rows | targetPackConfigured | validation favorable | unfavorable | missing |
|---|---:|---:|---:|---:|---:|
| company-01 | 21 | **0** | 0 | 0 | 21 |
| company-02 | 8 | 8 | 3 | 1 | 4 |
| company-03 | 10 | **0** | 0 | 0 | 10 |
| company-04 | 37 | **0** | 0 | 0 | 37 |
| company-05 | 54 | 54 | 2 | 18 | 34 |
| company-06 | 25 | **0** | 0 | 0 | 25 |
| company-07 | 12 | **0** | 0 | 0 | 12 |
| company-08 | 33 | 33 | 0 | 15 | 18 |
| **Toplam** | **200** | **95 (%47.5)** | **5 (%2.5)** | **34 (%17)** | **161 (%80.5)** |

**Sonuç:** 8 işletmenin **5'inde target pack hiç ayarlanmamış**. Bu işletmelerde § 3.4 break-even formülü her zaman fallback'e (business median ROAS) düşüyor. Resolver doğru çalışacak ama:
- Median proxy ≠ gerçek break-even. company-01'in median ROAS'ı 3.0 olabilir ama gerçek break-even'i 1.8 olabilir — fallback'le winner judgement'lar yanlış kalibre.
- UI'da kullanıcı bu farkı görmek zorunda.

**Faz B verification gate (Faz B kapanış öncesi yap):**

1. **Resolver fallback davranışı görünür olmalı.** `CreativeVerdict.evidence` array'ine yeni reason tag ekle: `break_even_proxy_used` — `commercialTruth.targetPackConfigured == false` durumunda her satıra primary olarak basılır. UI bunu "Break-even: median proxy" rozeti olarak gösterir.

2. **Kapsama dashboard'u (mini).** [components/creatives/CreativeDecisionOsOverview.tsx](../../components/creatives/CreativeDecisionOsOverview.tsx) içinde mevcut `commercialTruthCoverage.summary` zaten gerekli alanları sunuyor. Yeni sayı: **"X% creatives in this analysis are using business-median proxy for break-even (no target pack configured)"** — kullanıcı bunu görmeden Adsecute önerilerine güvenemez.

3. **Meta sayfasında aynı görünürlük.** [components/meta/meta-decision-os.tsx:951](../../components/meta/meta-decision-os.tsx) zaten `Targets {formatBooleanState(commercialTruth.targetPackConfigured)}` gösteriyor. Buraya proxy fallback aktif olduğunda daha net bir uyarı (ör. amber pill) ekle.

4. **Verification test (zorunlu yeni test):** `lib/creative-verdict.test.ts` içine en az 4 fixture:
   - target pack yok → fallback business median → `evidence` içinde `break_even_proxy_used`
   - target pack var, targetRoas finite → fallback yok, `break_even_proxy_used` evidence'ta YOK
   - target pack var, targetRoas null → fallback business median → `break_even_proxy_used`
   - business median yok ve target pack yok → fallback 1.0 → `evidence`'a iki tag (`break_even_proxy_used` + `break_even_default_floor`)

5. **A.5 sample re-run gating:** § 4.2 Doğrulama'da yazdığım Fleiss kappa ≥ 0.50 hedefi tek başına yetmez. Ek check: re-run sırasında her satır için resolver'ın `commercialTruth.targetPackConfigured` değerini doğru okuduğunu logla — 200 satırın 95'i target pack'li, 105'i değil olacak (yukarıdaki sayım). Eğer rakam farklıysa veri yolu kırık demektir.

Bu gate Faz B'nin teknik tamamlanma kriteri. Faz E'de de tekrar gözden geçireceğiz: ürün canlı kullanıma açıldığında, kullanıcılar commercial truth'larını doldurmadan Adsecute önerilerine güvenirse, "winner" judgement'ı sistemli olarak yanlış olabilir.

---

## 4. Senin (Codex'in) somut görevin

### 4.1 Implementation

1. Yeni dosyalar:
   - `lib/creative-verdict.ts` (kontrat + types)
   - `lib/creative-verdict.test.ts` (en az 30 test case — § 3.x'in her birine en az 2 senaryo)
   - `lib/creative-phase.ts` (phase derivation, § 3.6)
2. Mevcut dosyaları güncelle:
   - `lib/creative-decision-os.ts` — `resolveCreativeVerdict` resolver eklenir; eski API legacy fonksiyon olarak işaretlenir (`@deprecated`).
   - `lib/creative-decision-os-v2.ts` — `CreativeDecisionOsV2Output` artık `CreativeVerdict` tipinden derive edilir.
   - `lib/creative-operator-policy.ts` — § 3.3 blocker semantik tablosu tek noktada uygulanır.
   - `lib/creative-operator-surface.ts` — quick filters yeni headline'ları tüketir.
   - `lib/creative-decision-os-snapshots.ts` — yeni `CreativeVerdict[]` alanı snapshot'a eklenir; eski snapshot'lar için migration `null` döndürür.
3. UI:
   - [components/creatives/CreativeDetailExperience.tsx:705-731](../../components/creatives/CreativeDetailExperience.tsx#L705-L731) — dual-system fallback kaldırılır; tek `CreativeVerdict` consume eder.
   - [components/creatives/CreativeDetailExperience.tsx:1052-1184](../../components/creatives/CreativeDetailExperience.tsx#L1052-L1184) — legacy verdict theme helper'ları birleştirilir.
   - [components/creatives/CreativesTableSection.tsx](../../components/creatives/CreativesTableSection.tsx) — Verdict kolon definition'ı yeni kontrata bağlanır.
   - [components/creatives/CreativeDecisionOsContent.tsx](../../components/creatives/CreativeDecisionOsContent.tsx), [components/creatives/CreativeDecisionOsOverview.tsx](../../components/creatives/CreativeDecisionOsOverview.tsx), [components/creatives/CreativeDecisionOsV2PreviewSurface.tsx](../../components/creatives/CreativeDecisionOsV2PreviewSurface.tsx) — yeni kontrata göç.
   - [components/creatives/PublicCreativeSharePage.tsx](../../components/creatives/PublicCreativeSharePage.tsx) — share çıktısı yeni kontrata göre.
4. Feature flag:
   - `?verdictContract=v0` ile eski sistemi 2 hafta korumayı tut. Snapshot store'da `contractVersion` zaten var; bunu kullan.

### 4.2 Doğrulama

- `pnpm test` — yeni `creative-verdict.test.ts` dahil tüm testler pass.
- `pnpm creative:v2:safety` — macroF1 ≥ 90, severe + high mismatch sınırlar içinde.
- **Yeni:** `scripts/happy-harbor-faz-b-rerun.ts` — A.5 sample'ını yeni resolver'a yeniden besle, Adsecute'un yeni output'u ↔ Claude rating ↔ Codex rating üçlü Fleiss kappa hesapla. Hedef ≥ 0.50 (ham regression check).
- Snapshot test: detail / table / drawer / share / V2 preview üzerinde bir `creativeId` için tek headline + action gösteriliyor — UI snapshot'ları yeniden üretilir.
- Manuel UI smoke: `pnpm dev:local`, [/creatives](../../app/(dashboard)/creatives/page.tsx) sayfası, Run Analysis tetikle, en az 5 creative aç. Lifecycle pipeline ↔ quick filter ↔ detail headline çelişki üretmemeli.

---

## 5. Açık sorular (yanıt bekliyorum)

1. **`commercial_truth_target_pack` field path:** § 3.8'deki entegrasyon denetiminde kanonik path doğrulandı — `commercialTruth.targetPack.targetRoas` ([lib/creative-decision-os.ts:1347](../../lib/creative-decision-os.ts)). Bu artık spec olarak kapalı; sen `09-codex-deliverables-faz-B.md` § 1'de § 3.8'in 5 verification test'ini hangi fixture data ile yazdığını belgele.

2. **Migration trafiği:** `?verdictContract=v0` 2 hafta korunacak dedik. Bu sürede iki resolver da çalışıyor olacak — performans gözleyebilir miyiz? Eğer yeni resolver eski sisteminkinden 2× yavaşsa snapshot persist'i öncesi kestirme cache eklemen gerekir mi? `pnpm dev:local` tarafında 200 satır resolve'u için 1 sn'den fazla sürüyorsa bana bildir.

3. **§ 3.5 confident cut eşiği:** Spec yazdım: `action == "cut" && unfavorable validation && live_confident → ready`. Bu kullanıcının doğrudan cut basabileceği güvenli durum. Sen pratikte daha sıkı sebep istiyorsan (örn. en az 14 gün kötü performance da gerekli) söyle, eklerim.

---

## 6. Self-review checklist (teslimattan ÖNCE)

- [ ] `lib/creative-verdict.ts` derler, export edilen tipler kullanılıyor.
- [ ] `lib/creative-verdict.test.ts` — en az 30 test, her policy section'ı (§ 3.1-§ 3.7) en az 2 case ile.
- [ ] Legacy primary-decision verdict theme helper artık mevcut değil (grep boş döner).
- [ ] UI hiçbir yerde `lifecycleState` ham olarak okunmuyor (grep: `git grep -E "lifecycleState\." components/creatives/` boş veya sadece tip tanımları).
- [ ] `pnpm test` clean.
- [ ] `pnpm creative:v2:safety` macroF1 ≥ 90, severe = 0, high ≤ 5.
- [ ] `scripts/happy-harbor-faz-b-rerun.ts` çalışır, A.5 sample'ı üzerinde Fleiss kappa ≥ 0.50.
- [ ] Manuel UI smoke (5 creative açıldı, çelişki yok).
- [ ] Feature flag `?verdictContract=v0` çalışıyor (eski sistem hâlâ tetiklenebiliyor).
- [ ] § 3.8 commercial truth verification gate: `break_even_proxy_used` evidence tag'i resolver'da implement edildi, en az 4 fixture testi pass; UI tarafında (creative + meta) proxy fallback rozeti görünür.
- [ ] A.5 sample re-run sırasında resolver'ın gördüğü targetPackConfigured count = 95/200 (target pack yok 105/200) — sayım sapmıyor.

---

## 7. Tetikleyici

Yukarıdaki checklist tamamen yeşil olduğunda `09-codex-deliverables-faz-B.md` yaz (4 sabit bölüm), commit, kullanıcıya **"Codex ekibi tamamladı"** dedirt.

Ben Faz B teslimini denetleyeceğim — özellikle:
- A.5 sample yeniden çalıştırıldığında Fleiss kappa gerçekten ≥ 0.50 mi?
- UI snapshot'ları çelişki içermiyor mu?
- Feature flag fallback gerçekten ayrı path'te mi?

Yeşilse Faz C handoff'u yazılır ([test→scale phase modeli kalibrasyonu](../../docs/team-comms/happy-harbor/00-charter.md) § Faz C). Faz A kapanır, Faz B-C-D-E sıralı ilerler.

— Claude ekibi
