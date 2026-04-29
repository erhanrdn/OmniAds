# Happy Harbor — Faz E Handoff (Claude → Codex)

> Önceki: [19-claude-review-D.md](19-claude-review-D.md) — Faz D kapanışı.
> Bu sekansın kapanış fazı. Faz E tamamlandığında Happy Harbor sekansı sona erer.

---

## 0. Bağlam — Sekansın geldiği nokta

Faz A-B-C-D ile:

- Tek `CreativeVerdict` kontratı kuruldu, dual-system birleştirildi (Faz B)
- Test/scale/post-scale `phase` modeli + naming convention + campaign family signal devrede (Faz C)
- VerdictBand UI sade, tutarlı; detail / tablo / share / surface tek bakışta verdict gösteriyor (Faz D)
- Sample-200 üzerinde Adsecute(new resolver) ↔ Claude rating action %84, readiness %99.5 (kappa ≈ 0.77)
- pnpm creative:v2:safety yeşil (macroF1 97.96, severe 0, high 0)

Plan'daki [00-charter.md § Bitiş Kriterleri](00-charter.md):

| Kriter | Durum |
|---|---|
| 1. Tek `CreativeVerdict` kontratı (compile-time enforced) | ✓ |
| 2. Test→Scale `phase` modeli, "Promote to Scale" yolu | ✓ |
| 3. Üç-değerlendirici canlı audit ≥ %90 uyum (kappa ≥ 0.80) | ⚠️ pair-wise tarafı tamam, üçlü gold v1 ile yapılacak |
| 4. Buyer comprehension testi (5 buyer × 10 creative, 3 sn altı %95+) | ⏳ Faz E |
| 5. `pnpm creative:v2:safety` PR-blocking, agreement audit | ⏳ Faz E |
| 6. Operator dokümanı + action playbook güncel, legacy archive | ⏳ Faz E |

Faz E'nin görevi: kalan 4 maddeyi kapatıp sekansı sonlandırmak.

---

## 1. Faz E'nin görevi — Tek tanım

[00-charter.md § Bitiş Kriterleri](00-charter.md)'nin 6 maddesinin hepsi yeşil; sekans **kapanış raporuyla** sonlandırılır.

Bitiş kriterleri (Faz E'nin sonunda):

1. **Gold v1 set** ≥ 1.500 satır, üç rater (Adsecute / Codex(new policy) / Claude) consensus ile onaylanmış. `audit-A/sample-200` core olur, `audit-E/extended-cohort-1300+` ile genişletilir.
2. **Üçlü kappa ≥ 0.80** (Codex re-rate yeni policy ile yapılır, böylece üç rater aynı policy uzayında); Codex ve Claude pair-wise + Adsecute(new resolver) + ground truth tutar.
3. **`pnpm creative:agreement-audit` ops scripti** — manuel olarak çağrılan, Faz A'daki `creative-decision-os-v2-live-audit.ts` gibi pattern; çıktı `docs/operator-policy/creative-segmentation-recovery/reports/agreement-weekly/`. PR-blocking değil — Faz F'de cron'a bağlamayı kullanıcı talep ederse eklenir.
4. **`pnpm creative:v2:safety` PR-blocking** — package.json scripts içinde `precommit` veya CI workflow YAML'ında required check; macroF1 ≥ 90, severe = 0, high ≤ 5.
5. **Buyer comprehension oturumları**: 5 buyer × 10 creative timed test gerçekten yapılır; sonuçlar `buyer-comprehension/results-2026-04-29.md`. Hedef: 3 sn altı doğru cevap %95+.
6. **Operator action playbook**: yeni `docs/operator-policy/creative-action-playbook.md` — media buyer'a "şu durumda ne yapmalı" tek sayfa karar ağacı. 6 action × 3 phase × 3 readiness için kanonik tavsiye.
7. **Doc archive**: `docs/phase-04-creative-decision-os.md`, `docs/phase-04-creative-action-contract.md`, `docs/phase-04-creative-release-checklist.md` ve mevcut [docs/operator-policy/creative-segmentation-recovery/](../../docs/operator-policy/creative-segmentation-recovery/) altındaki legacy referanslar → `docs/operator-policy/creative-segmentation-recovery/archive/` altına taşınır. Yerine kanonik [docs/phase-04-creative-action-contract.md](../../docs/phase-04-creative-action-contract.md) v2 yazılır (yeni `CreativeVerdict` kontratı + § 3 Faz B policy spec'leri kanonik referans).

---

## 2. Senin (Codex'in) somut görevi

### 2.1 Codex re-rating (yeni policy ile)

A.5'teki Codex rating'i Faz A'dan beri sabit, Codex'in own original policy'siyle. Faz B'de policy normalize edildi (Claude policy'sine yakın); şimdi Codex bu yeni policy ile sample-200'ü yeniden değerlendirmeli.

Yeni dosya: `scripts/happy-harbor-faz-e-codex-rerate.ts`

```ts
// sample-200.json oku
// Her satıra resolveCreativeVerdict()'i uygula (canonical resolver)
// Çıktı: audit-E/codex-rating-v2.json — Faz B policy ile Codex rating'i
```

Bu özünde "Codex now agrees with itself running through the new resolver" — yani Adsecute(new) ile birebir aynı çıkacak. Faz A'daki Codex'in original ratin'inden ayrıştırmak için **iki Codex rating** tutuyoruz:
- `audit-A/codex-rating.json` (original, Faz A — sabit)
- `audit-E/codex-rating-v2.json` (new policy, Faz E)

A.5'teki Codex rating Faz A'nın audit baseline'ı olarak donduruluyor. Yeni audit gold v1 ölçümleri için `codex-rating-v2`'yi kullanır.

### 2.2 Gold v1 cohort genişletme

Sample-200 core olarak kalır + `audit-E/extended-cohort.json` ile 1.300+ ek satır:

- Mevcut `creative-live-firm-audit.ts`'i 1.500 satır limit'le yeniden çalıştır (`CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=1500`)
- Cohort coverage requirements: business sayısı sample-200'dekiyle (8) aynı + ek olarak ne çıkarsa
- Stratification kalıbı sample-200 ile uyumlu (her business min 8 satır, spend tier ≥ %20)
- Maskeleme aynı pattern: HMAC + private reveal `.gitignore`'da

Yeni dosya: `audit-E/gold-v1.json` — sample-200 core + extended cohort birleşimi, üç rater rating'leri (Adsecute resolver output + Codex v2 + Claude rating) join'li.

Claude rating extended cohort için bu turda yapılmıyor — Faz E'nin bir sonraki turunda Claude ekibi extended cohort üzerinde rating üretecek (separate turn). Şimdilik gold v1 = sample-200 üzerinde üç rater + extended cohort üzerinde sadece Adsecute resolver output (Claude/Codex ratings TBD).

### 2.3 `pnpm creative:agreement-audit` ops scripti

Yeni dosya: `scripts/creative-agreement-audit.ts` (template: [scripts/creative-decision-os-v2-live-audit.ts](../../scripts/creative-decision-os-v2-live-audit.ts) gibi).

`package.json` scripts:
```json
"creative:agreement-audit": "node --import tsx scripts/creative-agreement-audit.ts"
```

Script:
- Aktif Meta businesslarda live audit çek
- Adsecute resolver output ↔ gold v1 ground truth (mevcutsa) karşılaştır
- Pair-wise kappa + severity tier raporu
- Çıktı: `docs/operator-policy/creative-segmentation-recovery/reports/agreement-weekly/{ISO_DATE}/`
- Eşik: macroF1 ≥ 90, severe ≤ 0, high ≤ 5; aşıldığında non-zero exit (CI'da block için hazır)

### 2.4 `pnpm creative:v2:safety` PR-blocking

CI workflow YAML'ı veya pre-commit hook'una bağla. Mevcut [.github/workflows/](../../.github/workflows/) altında yeni step ya da olan workflow'a ekleme:

```yaml
- name: Creative Decision OS v2 safety
  run: npm run creative:v2:safety
```

Bu eskiden manuel çağrılıyordu; PR-blocking olarak required check'e dönüştürülecek.

### 2.5 Buyer comprehension oturumları (5 buyer × 10 creative)

Faz D'de hazırladığın `docs/team-comms/happy-harbor/buyer-comprehension/` örnek setini kullan. 5 buyer'ı **kullanıcı (Adsecute sahibi) sağlayacak** — bizim tarafımızdan yapılacak iş:

- Her buyer için ayrı browser session
- 10 creative VerdictBand screenshot'ı + 6 seçenekli soru ("What action does this need?")
- Stopwatch zamanı (VerdictBand görür-görmez başlar, cevap işaretlendiğinde durur)
- Sonuçları `buyer-comprehension/results-2026-04-29.md` template'inde topla
- Hedef: 50/50 mikro-test'in ≥ %95'inde 3 sn altı doğru cevap

**Bu adım kullanıcının gerçek buyer panelini tedarik etmesini gerektirir.** Bu yüzden Faz E'nin tetikleyicisi farklı: kullanıcı buyer paneli hazır olduğunda Codex sessionları yönetir veya Claude ekibi (ben) aday değerlendirici olarak tek-buyer simülasyonu yaparım. Açık soru § 4'te.

### 2.6 Operator action playbook

Yeni dosya: `docs/operator-policy/creative-action-playbook.md`.

İçerik şablonu:

```markdown
# Creative Action Playbook (Media Buyer Quick Reference)

## Decision tree

When you open a creative in Adsecute, read the VerdictBand:

### Test phase
- Test Winner + scale + ready → **Promote to Scale**: …
- Test Winner + scale + needs_review → **Review then promote**: check business validation, …
- Test Loser + cut + ready → **Cut Now**: …
- Test Inconclusive + keep_testing → **Continue testing**: …

### Scale phase
- Scale Performer + protect + ready → **Keep active**: …
- Scale Underperformer + cut → **Cut**: …
- Scale Fatiguing + refresh → **Refresh angle/format**: …

### Post-scale phase
- Scale Fatiguing + refresh + ready → **Refresh creative**: …

### Diagnose
- Needs Diagnosis + diagnose + blocked → **Configure missing inputs**: see Settings → Commercial Truth, …

## Phase transitions

What moves a creative from test to scale?
- spend30d ≥ 5K AND spendToMedian ≥ 1.5 AND purchases ≥ 8 → forced to scale
- Or campaign family says "scale_cbo" / "scale_abo"
- Or naming convention says SCALE_ / CBO_ / ABO_

## When to trust the verdict
- High confidence (≥ 0.85) + no blockers → trust as-is
- Medium confidence (0.65-0.85) + business_validation_missing → review with target pack first
- Low confidence (< 0.65) → re-run analysis after 7 more days, or fill commercial truth

## When to override
- Adsecute says Cut but you have qualitative reason (brand campaign, top-of-funnel) → override is fine; mark in notes
- Adsecute says Refresh but recent7 ROAS is 0 due to ad-account issue → fix infrastructure first
```

Gerçek metni Codex yazar; Claude ekibi (ben) review eder.

### 2.7 Doc archive

```bash
mkdir -p docs/operator-policy/creative-segmentation-recovery/archive
git mv docs/phase-04-creative-decision-os.md docs/operator-policy/creative-segmentation-recovery/archive/
git mv docs/phase-04-creative-action-contract.md docs/operator-policy/creative-segmentation-recovery/archive/phase-04-creative-action-contract.v1.md
git mv docs/phase-04-creative-release-checklist.md docs/operator-policy/creative-segmentation-recovery/archive/
```

Yerine yeni kanonik `docs/phase-04-creative-action-contract.md` v2 — `CreativeVerdict` kontratı + Faz B § 3 policy spec'leri tek noktada referans.

[docs/operator-policy/creative-segmentation-recovery/](../../docs/operator-policy/creative-segmentation-recovery/) altında mevcut "implementation-pass-N" tarzı dosyalar Faz E'den önceki history; o klasörü olduğu gibi tutuyoruz, sadece yukarıdaki 3 phase-04 dosyasını archive'a taşıyoruz.

### 2.8 Doğrulama

- `npm test` clean
- `npm run creative:v2:safety` macroF1 ≥ 90, severe 0, high ≤ 5 — **PR-blocking olduğu için zaten her PR'da çalışacak**
- `npm run creative:agreement-audit` çalıştırıldı, çıktı `agreement-weekly/{ISO_DATE}/` altında
- `npx tsc --noEmit` clean

---

## 3. Sekans kapanış raporu (deliverable'a ek)

Faz E deliverable dosyası ([21-codex-deliverables-faz-E.md](21-codex-deliverables-faz-E.md)) standart 4 sabit bölümü taşır + ek **§ Sekans kapanış** bölümü:

- Faz A→E her birinden bir cümlelik özet
- 6 bitiş kriterinin tek tablosu (hepsi ✓ olmalı)
- Açık kalanlar (Faz F'ye veya gelecek scope'a ertelendiyse listele)
- Toplam metrik özet: dosya değişikliği sayısı, yeni dosya sayısı, satır ekleme/silme, test toplam sayısı

Bu rapor sekansı resmen kapatır. Bu tamamlandıktan sonra ben Faz E'yi denetlerim, "Happy Harbor sekansı kapanış raporu" yazarım, kullanıcıya teslim ederim.

---

## 4. Açık sorular (yanıt bekliyorum)

1. **Buyer comprehension oturumları kim yönetir?** Kullanıcı 5 gerçek buyer paneli sağlayabilir mi, yoksa MVP olarak Claude ekibi (ben) tek-rater olarak şablonu doldurur, Faz F'de gerçek panel yapılır mı? Senin önerin? **Önerim:** Kullanıcıya açık soru olarak yönelt; eğer panel hazır değilse Claude single-rater ile minimum 1 sample'ı doldursun (50 mikro-test), sonuç fizibilite kanıtı olarak kalsın.

2. **Extended cohort Claude rating'i:** Bu Faz E'de değil, ek bir turda mı yapılsın? Gold v1 ≥ 1.500 satır demektim ama extended cohort Claude rating'i Claude ekibi yapacaktı (1.300+ satır manuel rate çok zaman). MVP yol: gold v1 = sample-200 (tüm 3 rater) + extended cohort (sadece resolver output + Codex v2 rerate). Claude rating extended için Faz F'ye ya da scope-cap olarak.

3. **PR-blocking workflow YAML lokasyonu:** [.github/workflows/](../../.github/workflows/) altında hangi mevcut workflow'a ekleyelim, yoksa yeni `creative-safety.yml` mi? Kodu en iyi sen biliyorsun; senin yargın.

4. **`creative-action-playbook.md` Türkçe mi İngilizce mi?** Diğer happy-harbor dosyaları Türkçe; ama playbook media buyer'a hitap eden kanonik docs. Adsecute'un public-facing docs dilini takip et.

---

## 5. Self-review checklist

- [ ] `scripts/happy-harbor-faz-e-codex-rerate.ts` çalışır, `audit-E/codex-rating-v2.json` üretildi.
- [ ] `audit-E/gold-v1.json` ≥ 1.500 satır, üç rater rating'leri (sample-200 core + extended cohort) join'li.
- [ ] `scripts/creative-agreement-audit.ts` çalıştı, çıktı `agreement-weekly/{ISO_DATE}/` altında.
- [ ] `package.json` scripts'e `creative:agreement-audit` eklendi.
- [ ] `npm run creative:v2:safety` PR-blocking (CI workflow YAML).
- [ ] Buyer comprehension `results-2026-04-29.md` doldu (en az 1 buyer'la fizibilite kanıtı; gerçek 5 buyer kullanıcı paneli sağladığında).
- [ ] `docs/operator-policy/creative-action-playbook.md` yazıldı.
- [ ] `docs/phase-04-*` 3 dosya archive/'a taşındı, yerine yeni kanonik action-contract v2.
- [ ] `npm test` + `tsc --noEmit` clean.
- [ ] Sekans kapanış raporu `21-codex-deliverables-faz-E.md` § Sekans kapanış bölümünde.

---

## 6. Tetikleyici

Tüm checklist yeşil olduğunda `21-codex-deliverables-faz-E.md` yaz (4 sabit bölüm + Sekans kapanış), commit, "Codex ekibi tamamladı" dedirt. Ben Faz E'yi denetlerim — özellikle gold v1 cohort kapsamı, agreement-audit script çıkışı, action playbook'un media buyer için faydası, doc archive bütünlüğü.

Yeşilse Happy Harbor sekansının resmi kapanış raporunu yazıp kullanıcıya iletirim. Sekans biter; gelecek iş Faz F (eğer kullanıcı isterse: cron'a bağlama, gerçek buyer panel oturumları, extended cohort Claude rating) ayrı bir sekans olur.

— Claude ekibi
