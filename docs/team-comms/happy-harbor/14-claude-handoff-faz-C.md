# Happy Harbor — Faz C Handoff (Claude → Codex)

> Önceki: [13-claude-review-B-pass2.md](13-claude-review-B-pass2.md) — Faz B kapanışı.
> Sonraki tetikleyici: bu dosya iletildiğinde Codex Faz C implementation'ına başlar.

---

## 0. Bağlam — Faz B'den ne kazandık, Faz C'ye ne kaldı

Plan'daki Faz B "tek `CreativeVerdict` kontratı" idi; orijinal Faz C "Test/Scale phase modeli + faz geçiş kuralları". Ama Faz A audit'inin ortaya çıkardığı 7 sistemik pattern Faz B'nin scope'unu policy normalize ile genişletmemize yol açtı — sonuç olarak phase derivation ve fatigue/spend tier kuralları Faz B'de kabaca implemente edildi.

**Faz C'ye gerçekten kalan iş** dolayısıyla daraldı:

1. **Phase calibration** — new resolver phase eksenel %84 (Claude rating'iyle); plan'daki hedef ≥ %92.
2. **Naming convention + campaign family entegrasyonu** — `meta-campaign-family.ts` mevcut, phase derivation'a bağlanmadı.
3. **Snapshot migration UX** — eski snapshot'larda `phase` null; UI'da net "Yeniden analiz çalıştır" bildirimi.
4. **"Promote to Scale" UI flow** — Faz D UI sadeleştirmesinin başlangıcı; verdict band'da `Test Winner + scale + ready` durumunda explicit CTA butonu.

---

## 1. Faz C'nin görevi — Tek tanım

`derivePhase()` fonksiyonu Faz A sample'ında Claude rating phase'iyle ≥ %92 uyumlu. Naming convention + campaign family signal phase'e dahil. Snapshot migration UX kullanıcıya görünür. "Promote to Scale" CTA çalışır durumda.

Bitiş kriteri (Faz C'nin sonunda):
1. `pnpm test` ve `pnpm creative:v2:safety` yeşil. macroF1 ≥ 90.
2. **`scripts/happy-harbor-faz-c-phase-calibration.ts` çıktısı ≥ %92** (Claude rating phase ↔ new resolver phase).
3. Test campaign'lerinde naming convention parser çalışıyor (`TEST_*`, `T-*`, vb.); campaign family signal (CBO/ABO ölçek) phase'e dahil.
4. Eski snapshot UX: `phase: null` durumunda detail / table'da "Yeniden analiz gerekli" badge.
5. "Promote to Scale" CTA: `Test Winner + scale + ready` durumunda görünür ve tıklanabilir; tıklandığında en az logging veya analytics event üretiyor (gerçek mutation Faz D/E'de).

---

## 2. § 2.1 Phase calibration delta (Faz B'den gelen)

`audit-B/faz-b-rerun.json` analizi (200 satır üzerinde):

| Phase | Claude rating | New resolver | Δ |
|---|---:|---:|---:|
| test | 135 | 111 | −24 |
| scale | 29 | 38 | +9 |
| post-scale | 36 | 51 | +15 |

Pair-wise eksen agreement: **168/200 = %84.0**

Confusion (Claude → New resolver), büyük transitions:
- Claude `test` → New `post-scale`: **19 satır** (new resolver fatigue cutoff `recent7/long90 < 0.55` Claude'un 0.6'sından sıkı; daha agresif post-scale tetiklemesi)
- Claude `test` → New `scale`: **8 satır** (§ 3.2 spend tier kuralı `spendToMedian ≥ 5 OR spend30d ≥ 5000` agresif)
- Diğer geçişler: 5 satır toplam (post-scale ↔ test 4, scale ↔ test 1)

**İki yön mümkün:**

**A. Cutoff'ları gevşet** (Claude rating'ine yakınsama):
- Fatigue: 0.55 → 0.6
- Spend tier: spendToMedian ≥ 5 → ≥ 7

Bu Faz A Claude rating'i altın kabul ediyor.

**B. Cutoff'ları olduğu gibi tut** (Faz A audit gerçeklik):
- 0.55 fatigue cutoff sektör pratiğinde daha temkinli (erken refresh sinyali). Plan'da Faz E'de gold v1'de Claude rating'i yeniden üretileceği zaman bu kalibrasyonun üstüne düşülecek.
- Claude rating fatigue cutoff'um 0.6'ydı — kasıtlı policy farkı, mutlak doğru değil.

**Karar:** Faz C'de **B yönünü** seçiyoruz, ama new resolver'a campaign family + naming convention sinyallerini ekleyince fatigue/spend cutoff'ları doğal olarak kalibre olacak — yani %92 hedefini cutoff'u zorlamadan, ek sinyallerle yakalamayı deneyeceğiz.

Eğer naming + family eklendikten sonra hâlâ < %92 ise, fatigue cutoff'u 0.575'e (orta yol) çek. Bunu calibration script'inden geri-besle.

---

## 3. Senin (Codex'in) somut görevi

### 3.1 Naming convention + campaign family entegrasyonu

[lib/meta-campaign-family.ts](../../lib/meta-campaign-family.ts) ve [lib/creative-decision-os.ts](../../lib/creative-decision-os.ts) içindeki mevcut campaign family signal'ı (`MetaCampaignFamily`, `metaCampaignFamilyLabel`) phase derivation'a entegre et.

Spec:

```ts
// lib/creative-phase.ts içinde, mevcut derivePhase'i genişlet:

export function derivePhase(input: {
  metrics: { spend30d, purchases30d, recent7Roas, long90Roas, spendToMedian };
  delivery: { activeStatus };
  context: { campaignIsTestLike };
  campaign?: { metaFamily?: MetaCampaignFamily; namingConvention?: string };  // ← yeni
}): { phase: CreativePhase; phaseSource: PhaseSource } {
  // 1. Explicit campaign family override (highest priority)
  if (input.campaign?.metaFamily === "scale_cbo" || input.campaign?.metaFamily === "scale_abo") {
    return { phase: "scale", phaseSource: "campaign_family_explicit" };
  }
  if (input.campaign?.metaFamily === "test_cbo" || input.campaign?.metaFamily === "test_dct") {
    // Test family — but still allow fatigue override below
    const fatigueOverride = checkFatigue(input);
    if (fatigueOverride) return { phase: "post-scale", phaseSource: "fatigue_override_in_test_family" };
    return { phase: "test", phaseSource: "campaign_family_explicit" };
  }
  // 2. Naming convention parse
  const naming = parseNamingConvention(input.campaign?.namingConvention);
  if (naming === "scale" || naming === "test") {
    // similar override pattern
    ...
  }
  // 3. Spend/purchases threshold (mevcut Faz B logic)
  ...
  // 4. Fatigue cutoff (mevcut Faz B logic)
  ...
}
```

**`PhaseSource` enum** (yeni): `"campaign_family_explicit" | "naming_convention" | "spend_threshold" | "fatigue_override_in_test_family" | "fatigue_override_in_scale" | "default_test"`. Bu UI'da "Why is this in scale phase?" tooltip için kullanılır.

**Naming convention parser:** ilk versiyon basit:
- `^TEST[_-]`, `^T[_-]\d`, `_TEST$` → test
- `^SCALE[_-]`, `^S[_-]\d`, `^CBO[_-]`, `^ABO[_-]` → scale
- Aksi: null (parser sessiz)

### 3.2 Phase calibration script

Yeni: `scripts/happy-harbor-faz-c-phase-calibration.ts`

```ts
// Loads audit-A/sample-200.json + audit-A/claude-rating.json
// Runs derivePhase() with new naming/family signals
// Outputs: agreement %, confusion matrix, list of disagreement rows
// Exit non-zero if agreement < 92%
```

Çıktıyı `audit-C/phase-calibration.{json,md}` altında topla.

### 3.3 Snapshot migration UX

[lib/creative-decision-os-snapshots.ts](../../lib/creative-decision-os-snapshots.ts) `creativeVerdicts` alanını migration-safe yaptı (Faz B). Eski snapshot'larda `phase: null` olabilir.

UI tarafı:
- [components/creatives/CreativeDetailExperience.tsx](../../components/creatives/CreativeDetailExperience.tsx) verdict band'da `phase` null ise:
  - Phase pill yerine "Phase: bilinmiyor" amber pill
  - Tooltip: "Bu snapshot eski sürümle üretildi. 'Re-run analysis' tıklayarak güncel kararları alın."
- [components/creatives/CreativesTableSection.tsx](../../components/creatives/CreativesTableSection.tsx) Verdict kolonu: `phase` null ise satır boşluğu yerine grayed-out "needs analysis" mark.

### 3.4 "Promote to Scale" CTA

Verdict band'da action button. Spec:

```tsx
// CreativeDetailExperience verdict band içinde
if (verdict.action === "scale" && verdict.actionReadiness === "ready") {
  return <PromoteToScaleButton creativeId={...} />;
}
```

Click handler MVP:
- Console + analytics event log: `creative_promote_to_scale_requested`
- Toast: "Scale promotion logged. Live mutation will be available in Faz E."

Gerçek mutation Faz D/E'de yapılacak (Adsecute → Meta API push). Bu sadece intent capture.

### 3.5 Verification

- `pnpm test` clean
- `pnpm creative:v2:safety` macroF1 ≥ 90
- `npx tsx scripts/happy-harbor-faz-c-phase-calibration.ts` exit 0 (agreement ≥ %92)
- Manuel UI smoke: 5 creative, hem `phase` dolu hem `phase: null` cases test edildi

---

## 4. Açık sorular

1. **Campaign family bilgisi resolver input'unda yok şu an.** [lib/creative-decision-os-source.ts](../../lib/creative-decision-os-source.ts) içinde campaign family bilgisi mevcut mu? Eğer source layer'da çekiliyor ama resolver'a iletilmiyorsa, resolver input contract'ını genişletmen gerekecek. Bu sınır seni zorlarsa kullanıcıya bildir, biz adapte ederiz.

2. **Naming convention dataset:** Faz A businessları için kampanya isimleri reveal'da yok (sanitized). Yine de Adsecute'ta gerçek müşteri isimleri ham raw_pages'da yaşıyor — `lib/meta/decision-os-source.ts` üzerinden okunabilir. Source'tan parser'a kanonik bir path: `campaign.name` ya da `decisionOs.creatives[i].campaign.name`. Belirsizse `09-codex-deliverables-faz-B.md` § 1'deki target pack tablo formatında § 1'e ekle.

3. **PhaseSource UI tarafına ne kadar agresif sızdırılsın?** Spec'te detail tooltip için kullanılır dedim ama tablo / share / public surface'lerde gözükmesi lazım mı? Kullanıcı testi yapmadan optimum kararı vermek zor. İlk versiyon: sadece detail tooltip; Faz D'de buyer comprehension testi sırasında gözden geçiririz.

---

## 5. Self-review checklist

- [ ] `lib/creative-phase.ts` `derivePhase()` campaign family + naming signals'i tüketiyor.
- [ ] `lib/meta-campaign-family.ts` (mevcut) phase derivation'a bağlandı.
- [ ] Yeni `parseNamingConvention()` helper en az 6 fixture testle (test prefix, scale prefix, ambiguous, empty).
- [ ] `scripts/happy-harbor-faz-c-phase-calibration.ts` çalışır, exit 0, agreement ≥ %92.
- [ ] Snapshot migration UX: phase null → amber "needs analysis" badge (detail + table).
- [ ] "Promote to Scale" CTA: `Test Winner + scale + ready` koşulunda görünür; click handler MVP analytics event basıyor.
- [ ] `pnpm test` clean (yeni testler dahil).
- [ ] `pnpm creative:v2:safety` macroF1 ≥ 90, severe 0, high ≤ 5.
- [ ] `npx tsc --noEmit` clean.

---

## 6. Tetikleyici

Tüm checklist yeşil olduğunda `15-codex-deliverables-faz-C.md` yaz (4 sabit bölüm), commit, "Codex ekibi tamamladı" dedirt. Ben Faz C'yi denetlerim — özellikle phase calibration agreement'ı %92'ye ulaştı mı, naming convention parser farklı isim kalıplarına dayanıklı mı, snapshot migration UX gerçekten anlaşılır mı.

Yeşilse Faz D handoff'u (UI sadeleştirme: VerdictBand, tek kolon, designer-led iterasyon) yazılır.

— Claude ekibi
