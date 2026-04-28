# Happy Harbor — Faz D Handoff (Claude → Codex)

> Önceki: [16-claude-review-C.md](16-claude-review-C.md) — Faz C kapanışı.
> Sonraki tetikleyici: bu dosya iletildiğinde Faz D implementation'ına başlıyorsun.

---

## 0. Bağlam — UI sadeleştirme niçin lazım

Faz B-C kontratı + policy'yi temizledi: tek `CreativeVerdict`, tek `derivePhase()`, fallback'ler transparan, eski snapshot migration UX yerinde. Şimdi sıra UI'da: kullanıcı creative'i açtığında 3 saniyenin altında, çelişkisiz, tek bakışta karar verebilmeli. [00-charter.md § 2 Bitiş Kriteri #4](00-charter.md): 5 buyer × 10 creative comprehension testi, "What action does this need?" → 3 sn altı doğru cevap %95+.

Şu anki detail drawer ([components/creatives/CreativeDetailExperience.tsx:705-840](../../components/creatives/CreativeDetailExperience.tsx)):
- Verdict label aynı satırda iki kez render ediliyor (büyük tipografi + pill — Faz B'de düzeltildi ama hâlâ optimal değil).
- Evidence chip'leri sınırsız → kullanıcı 5+ chip'i taradığında "ne yapacağım?" cevabı kaybolabiliyor.
- Action button henüz verdict band'ın doğal parçası değil — Faz C'de "Promote to Scale" eklendi ama tek koşul (`Test Winner + scale + ready`); diğer 5 action için (cut, refresh, protect, keep_testing, diagnose) explicit CTA yok.

Tablo tarafı: çoklu kolon var, "Verdict" diye tek kolon yok. Quick filter pill'leri 6 farklı renk/tone, ama tooltip'leri Faz C'deki phase-aware policy'yi yansıtmıyor.

V2 preview surface ([components/creatives/CreativeDecisionOsV2PreviewSurface.tsx](../../components/creatives/CreativeDecisionOsV2PreviewSurface.tsx)) hâlâ "preview" çerçevesinde — `?creativeDecisionOsV2Preview=0` flag'i ile kapatılabiliyor. Faz B kontratı GA olduğu için bu artık preview değil, kanonik UI olmalı.

---

## 1. Faz D'nin görevi — Tek tanım

Detail drawer + tablo + V2 preview surface tek `CreativeVerdict` üzerine inşa edilen sade bir UI'a kavuşur. Kullanıcı creative'i açtığında VerdictBand'da phase + headline + action'ı 3 saniyede okur, doğru CTA'ya bir tıklamayla erişir.

Bitiş kriteri (Faz D'nin sonunda):

1. **Detail VerdictBand**: 64px tek şerit, soldan sağa: Phase pill (Test/Scale/Post-Scale) → Headline (büyük tipografi: "Test Winner — Ready to Scale") → primary Action button (her 6 action için doğru label + ton).
2. **Why bölümü**: VerdictBand'ın hemen altında en fazla **3 evidence chip + 2 blocker chip**. Daha fazlası "Show all evidence ⌄" arkasında collapsed.
3. **Tablo Verdict kolonu**: tek kolon, headline + phase pill + action mini-icon. `selectedColumns` listesinden eski `lifecycleState` / `primaryAction` / `operatorPrimaryDecision` benzeri legacy kolonlar kaldırıldı.
4. **Quick filter tooltip'leri**: 6 pill (Scale, Test More, Protect, Refresh, Cut, Diagnose) tooltip'i şimdi "Test phase / Scale phase ayrımı"nı gösteriyor — phase bağımsız değil, phase-aware.
5. **V2 preview surface kanonik**: dosya ismi `CreativeDecisionOsV2PreviewSurface.tsx` → `CreativeDecisionOsSurface.tsx`'e rename, `CreativeDecisionOsV2PreviewProps` → `CreativeDecisionOsSurfaceProps`. `?creativeDecisionOsV2Preview=0` flag handling kaldırılır. ?verdictContract=v0 (Faz B) hâlâ kalır — verdict kontrat fallback bağımsız.
6. **Buyer comprehension testi**: protokol [00-charter.md § Bitiş Kriteri #4](00-charter.md)'te tanımlandı. Bu turun bir parçası olarak protokol dosyası ve sonuç şablonu hazırlanır (gerçek buyer'lar Faz E'de oturur). Şimdilik: protokol + 10 creative örnek seti + sonuç şablonu commit'lenir.
7. `npm test` + `creative:v2:safety` yeşil; `tsc --noEmit` clean.

---

## 2. UI tasarım spec'i

### 2.1 VerdictBand component

Yeni dosya: `components/creatives/VerdictBand.tsx`

```tsx
export interface VerdictBandProps {
  verdict: CreativeVerdict;
  onAction?: (action: CreativeAction) => void;
  size?: "compact" | "full"; // compact = table row, full = detail drawer
}
```

Layout (full size):
```
┌─────────────────────────────────────────────────────────────────────────┐
│ [TEST]  Test Winner — Ready to Scale         [▶ Promote to Scale]       │
│         Confidence 0.92  ·  3 evidence  ·  0 blockers                   │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Phase pill** (sol): Test = sky-50 / Scale = emerald-50 / Post-Scale = amber-50. Compact (24px height) tipografi.
- **Headline** (orta): büyük 18px semibold, tek satır truncate. Format: "{Headline} — {ActionShortLabel}" (ör. "Test Winner — Ready to Scale", "Scale Fatiguing — Refresh Required", "Needs Diagnosis — Investigate").
- **Primary action button** (sağ): `verdict.action`'a göre ton:
  - scale → emerald solid "Promote to Scale"
  - cut → rose solid "Cut Now"
  - refresh → amber solid "Refresh Creative"
  - protect → slate outline "Keep Active"
  - keep_testing → sky outline "Continue Testing"
  - diagnose → orange outline "Investigate"
  - actionReadiness === "blocked" ise button disabled, tooltip blocker reason'larını listeler
  - actionReadiness === "needs_review" ise button outline + " (review)" suffix

Mevcut `getVerdictTheme(verdict)` ([components/creatives/CreativeDetailExperience.tsx:1120](../../components/creatives/CreativeDetailExperience.tsx)) tek tema fonksiyonu olarak kalsın; VerdictBand bunu tüketir.

### 2.2 Why bölümü

VerdictBand'ın hemen altında, dikey stack:

```
EVIDENCE
[Strong relative winner] [Above break-even] [Mature evidence]
                                            ↓ Show all (5 more)

BLOCKERS
[Business validation missing] [Trust degraded]
```

- Evidence chip'leri primary weight olanlar önce; max 3.
- Blocker chip'leri max 2; "Show all" expand butonu rest'i açar.
- Boş durum: evidence/blocker yoksa o sub-section gizli.

### 2.3 Tablo Verdict kolonu

[components/creatives/CreativesTableSection.tsx](../../components/creatives/CreativesTableSection.tsx) içinde:

```tsx
{ key: "verdict", label: "Verdict", render: (row) => <VerdictBand verdict={row.verdict} size="compact" /> }
```

Compact size:
```
[TEST] Test Winner ▶
```
Sadece phase pill + truncated headline + action icon (mini). Hover'da full VerdictBand tooltip.

`STATIC_COLUMN_SPECS` ve `PRESETS` listesinden çıkarılması gerekenler:
- Eğer "lifecycleState" benzeri legacy kolonlar varsa kaldır
- "Verdict" kolonu yeni default preset'lerde ilk kolon olmalı

### 2.4 Quick filter tooltip güncellemesi

[components/creatives/CreativesTopSection.tsx:336-389](../../components/creatives/CreativesTopSection.tsx) `performanceFilterToneClasses()` mevcut. Tooltip içeriği güncellemen gereken yer: pill'lerin `data-tooltip` veya `title` attribute'leri.

Yeni tooltip metinleri:

| Pill | Tooltip |
|---|---|
| Scale | "Creatives ready to scale: Test Winner with confident validation, or Scale Performer in stable production." |
| Test More | "Creatives still in test phase needing more evidence: spend < $50 or purchases < 3, or mixed signal." |
| Protect | "Stable Scale Performers — keep active without changes. Most reliable revenue contributors." |
| Refresh | "Creative fatigue detected (recent vs. long-term ROAS dropping ≥ 40%). Refresh angle/format." |
| Cut | "Test Losers or Scale Underperformers — bleeding capital relative to break-even. Pause." |
| Diagnose | "Hard blockers (missing commercial truth + business validation). Manual triage required." |

### 2.5 V2 preview surface kanonikleştirme

Rename:
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` → `components/creatives/CreativeDecisionOsSurface.tsx`
- `CreativeDecisionOsV2PreviewProps` → `CreativeDecisionOsSurfaceProps`
- Component ismi `CreativeDecisionOsV2PreviewSurface` → `CreativeDecisionOsSurface`

Page kullanımı ([app/(dashboard)/creatives/page.tsx:25](../../app/(dashboard)/creatives/page.tsx)):
- `creativeDecisionOsV2PreviewDisabled`, `creativeDecisionOsV2PreviewEnabled`, `?creativeDecisionOsV2Preview=0` flag'leri kaldır.
- `?v2Preview=0` short flag'i de kaldır.
- `creativeDecisionOsV2PreviewQuery` → `creativeDecisionOsSurfaceQuery` rename.
- `getCreativeDecisionOsV2Preview` service çağrısı kalabilir (lib tarafı internal name) ama UI tarafı sade.

### 2.6 Buyer comprehension test protokolü

Yeni dosya: `docs/team-comms/happy-harbor/buyer-comprehension/protocol.md`

İçerik:
- 5 buyer × 10 creative timed test (toplam 50 mikro-test)
- Her creative için: VerdictBand screenshot + soru "What action does this need?"
- Buyer 6 seçenekten birini işaretler: Scale / Keep Testing / Protect / Refresh / Cut / Investigate
- Beklenen: VerdictBand'daki primary action ile eşleşmeli
- Süre ölçümü: stopwatch, kullanıcı VerdictBand'ı görür-görmez başlar, cevap işaretlendiğinde durur
- Hedef: ≥%95 satırda 3 sn altı doğru cevap

10 creative örnek seti `audit-A/sample-200.json`'dan:
- Her 6 action sınıfından en az 1 creative
- Karışık phase (test, scale, post-scale)
- Karışık readiness (ready, needs_review, blocked)
- Diverse business (en az 4 farklı business)

`docs/team-comms/happy-harbor/buyer-comprehension/example-set.json` — 10 creative ID listesi + ground truth verdict JSON.

`docs/team-comms/happy-harbor/buyer-comprehension/results-template.md` — sonuç şablonu (buyer A/B/C/D/E × 10 satır × {action_correct, time_seconds, notes}).

Gerçek buyer oturumları Faz E'de yapılacak. Bu turda sadece protokol + örnek set + şablon commit'lenir.

---

## 3. Senin (Codex'in) somut görevi

### 3.1 Implementation

1. **Yeni:** `components/creatives/VerdictBand.tsx` + `.test.tsx` (en az 12 test — her action × her readiness, blocked + disabled state, compact + full size).
2. **Refactor:** `CreativeDetailExperience.tsx` 705-840 arası verdict band kısmını VerdictBand component'ine değiştir. Why bölümünü 3+2 chip + Show all expand olarak yeniden yaz.
3. **Refactor:** `CreativesTableSection.tsx` Verdict kolonunu ekle, eski legacy benzeri kolonları (varsa) kaldır, default preset'lerde Verdict ilk kolon.
4. **Refactor:** `CreativesTopSection.tsx` quick filter pill tooltip'lerini § 2.4 tablosuna göre güncelle.
5. **Rename:** V2PreviewSurface → DecisionOsSurface (file + types + imports).
6. **Page cleanup:** `app/(dashboard)/creatives/page.tsx`'den V2 preview flag handling kaldır.
7. **Snapshot tests** güncelle: detail / table / share / surface page snapshot'ları yeniden üret. Aynı creative ID için tüm yüzeylerde aynı VerdictBand görünmeli (çelişki yok).
8. **PublicCreativeSharePage** ([components/creatives/PublicCreativeSharePage.tsx](../../components/creatives/PublicCreativeSharePage.tsx)) VerdictBand'ı share çıktısında kullansın.

### 3.2 Buyer comprehension protokolü

`docs/team-comms/happy-harbor/buyer-comprehension/` dizini açılır:
- `protocol.md` — § 2.6'daki içerik
- `example-set.json` — 10 creative seçimi (sample-200'den)
- `results-template.md` — boş tablo şablonu

10 creative seçim kuralları:
- Her 6 action'dan ≥ 1 (toplam ≥ 6)
- En az 4 farklı business
- Phase dağılımı: test / scale / post-scale her biri ≥ 1
- Readiness dağılımı: ready / needs_review / blocked her biri ≥ 1

### 3.3 Doğrulama

- `npm test` clean (yeni VerdictBand testleri dahil)
- `npx tsc --noEmit` clean
- `npm run creative:v2:safety` macroF1 ≥ 90, severe 0, high ≤ 5
- Manuel UI smoke ([scripts/creative-live-firm-audit.ts](../../scripts/creative-live-firm-audit.ts)'in setup'ını tekrar kullan): bağlı production DB ile dev server'ı aç, en az 3 farklı business'tan 5'er creative açıp VerdictBand'ı incele. Detail / table / share aynı verdict'i gösteriyor mu?

---

## 4. Açık sorular (yanıt bekliyorum)

1. **Tablo'da legacy kolonların durumu:** [components/creatives/CreativesTableSection.tsx:57-101](../../components/creatives/CreativesTableSection.tsx) `TableColumnKey` union'ında 40+ kolon var. Bunların büyük kısmı performans metrikleri (spend, ROAS, CPA, vb.) — bunlar kalmalı. Ama "lifecycleState" benzeri verdict alanları var mı, varsa kaldırılması gerekiyor mu? Sen kodu inceleyince netleştirebilirsin.

2. **VerdictBand action button → gerçek action wiring:** Faz C "Promote to Scale" CTA placeholder analytics event basıyor. Faz D'de diğer 5 action için aynı placeholder pattern mı, yoksa "Cut Now" / "Refresh Creative" Meta API'sine gerçekten push'lasın mı? **Önerim placeholder**: gerçek mutation Faz E'de (buyer testleri sonrası); şimdi sadece intent capture. Aksi düşüncen varsa `18-codex-deliverables-faz-D.md` § Açık sorular'da gerekçele.

3. **VerdictBand size=compact tablo'da nasıl render edilsin:** spec'te "phase pill + truncated headline + action icon" yazdım. Eğer tablo row height (mevcut 58px [CreativesTableSection.tsx:606](../../components/creatives/CreativesTableSection.tsx)) buna yetmiyorsa, sub-info'yu kırp, tooltip'e taşı. Yargını kullan.

---

## 5. Self-review checklist

- [ ] `VerdictBand.tsx` 6 action × 3 readiness × 2 size kombinasyonu render ediyor.
- [ ] `VerdictBand.test.tsx` ≥ 12 test (her action 1, blocked state 1, compact rendering 1, accessibility 1).
- [ ] `CreativeDetailExperience.tsx` verdict band kısmı VerdictBand component'iyle değiştirildi; eski 705-840 inline implementation kaldırıldı.
- [ ] Why bölümü 3+2 chip cap'li; "Show all" expand çalışıyor.
- [ ] `CreativesTableSection.tsx` Verdict kolonu eklendi, default preset'lerde ilk kolon.
- [ ] `CreativesTopSection.tsx` quick filter tooltip metinleri § 2.4 tablosuyla birebir.
- [ ] `CreativeDecisionOsV2PreviewSurface.tsx` → `CreativeDecisionOsSurface.tsx` rename tam (dosya + tip + component + import).
- [ ] `app/(dashboard)/creatives/page.tsx`'den `creativeDecisionOsV2Preview` flag kaldırıldı.
- [ ] `PublicCreativeSharePage.tsx` VerdictBand kullanıyor.
- [ ] Snapshot test'ler yeniden üretildi; aynı creative ID için detail / table / share / surface aynı verdict gösteriyor.
- [ ] `docs/team-comms/happy-harbor/buyer-comprehension/{protocol.md,example-set.json,results-template.md}` commit edildi.
- [ ] `npm test` clean.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run creative:v2:safety` macroF1 ≥ 90.
- [ ] Manuel UI smoke (3 business × 5 creative) tamamlandı; VerdictBand çelişki içermiyor.

---

## 6. Tetikleyici

Tüm checklist yeşil olduğunda `18-codex-deliverables-faz-D.md` yaz (4 sabit bölüm), commit, "Codex ekibi tamamladı" dedirt. Ben Faz D'yi denetlerim — özellikle VerdictBand tasarımı 3-saniye comprehension için işe yarıyor mu, V2 preview rename tam mı, snapshot çelişkileri sıfır mı.

Yeşilse Faz E handoff'u (sürekli doğrulama: gold v1, agreement audit script, dokümantasyon, gerçek buyer oturumları) yazılır.

— Claude ekibi
