# Happy Harbor — Charter

**Sekans adı:** Happy Harbor
**Başlangıç tarihi:** 2026-04-28
**Plan sahibi (lokal):** `~/.claude/plans/imdi-sen-adsecute-app-ini-happy-harbor.md`
**Sahipler:** Claude ekibi (media buyer + UI/UX) ↔ Codex ekibi (engineer)
**Tetikleyici:** Adsecute sahibi — yalnızca "Claude ekibi tamamladı" / "Codex ekibi tamamladı" mesajını iletir.

---

## Niye buradayız

Adsecute Creatives sayfasında bir media buyer creative detayını açtığında **"winner"** ifadesini görüyor ama **"scale"** önerisi verilmiyor. Sektör mantığına aykırı: test fazında winner çıkan reklamın bir sonraki adımı scale'dir.

**Bu sadece bir semptom — kök sorun tüm verdict yüzeyinde.** Adsecute'ta iki paralel karar sistemi çalışıyor (legacy `CreativeDecision.action`/`lifecycleState` + operator `primaryDecision`/`subTone` + V2 `actionability`). UI bu üçünü iç içe çağırıyor; aynı ekran "Scale" ve "Protect" diyebiliyor. Üstüne "test phase / scale phase" geçişi modellenmemiş.

> **Scope:** Bu sekansın kapsamı winner/scale ekseniyle sınırlı **değil**. Faz A audit'i tüm verdict uzayını kapsar: 6 primary decision (Scale / Test More / Protect / Refresh / Cut / Diagnose) × 7 headline (Test Winner / Test Loser / Test Inconclusive / Scale Performer / Scale Underperformer / Scale Fatiguing / Needs Diagnosis) × 3 phase (test / scale / post-scale). Faz B-E de aynı geniş yüzeyi rebuild eder.

Ayrıntı kaynak: `~/.claude/plans/imdi-sen-adsecute-app-ini-happy-harbor.md` § 1.

---

## Tek hedef

> Bir media buyer Adsecute'ta herhangi bir creative'i açtığında, **ne durumda** (test / scale fazı), **ne kadar başarılı** (winner / loser / inconclusive), ve **şimdi ne yapması gerektiğini** (action), **3 saniyenin altında, çelişkisiz**, tek bir verdict şeridinden okuyabilmeli. Aynı creative üzerinde Adsecute'un verdiği etiket, Claude ekibi rating'i ve Codex ekibi rating'i en az %90 oranında uyumlu olmalı (**Cohen's kappa ≥ 0.80**).

Bu sekans **MVP üretmiyor — stabil ürün üretiyor.** Geçici hack, "ileride düzeltiriz" yok.

---

## Bitiş kriterleri (hepsi gerekli)

1. **Tek `CreativeVerdict` kontratı.** Legacy + operator + V2 birleştirilmiş, compile-time enforced; UI tek kontratı tüketiyor.
2. **Test→Scale `phase` modeli.** Her creative explicit `phase: "test" | "scale" | "post-scale"` taşıyor; test winner için "Promote to Scale" yolu net.
3. **Üçlü canlı audit ≥ %90 uyum.** Adsecute / Claude / Codex pair-wise kappa ≥ 0.80; severe + high mismatch = 0.
4. **Buyer comprehension testi.** 5 buyer × 10 creative; "What action does this need?" → 3 sn altı doğru cevap %95+.
5. **Sürekli doğrulama yeşil.** `pnpm creative:v2:safety` PR-blocking; macroF1 ≥ 90; queueEligible/applyEligible drift ≤ %2; gold label v1 ≥ 1.500 satır.
6. **Operator dokümanı + action playbook güncel.** Legacy referanslar archive'da.

---

## Yaklaşım — 5 Faz

| Faz | İçerik | Sahip | Şu anki durum |
|---|---|---|---|
| **A** | Live audit + üçlü bağımsız rating + uyum analizi (kod yazımı yok) | Codex (sample + rating + metrics) + Claude (rating + pattern raporu) | ▶ aktif |
| B | `CreativeVerdict` tek kontrat — dual-system birleştirme | Codex impl + Claude review | bekliyor |
| C | Test/Scale `phase` modeli + faz geçiş kuralları | Codex impl + Claude policy | bekliyor |
| D | UI sadeleştirme: VerdictBand, tek kolon | Claude designer-led + Codex engineer | bekliyor |
| E | Sürekli doğrulama (gold v1, agreement audit, dokümantasyon) | Codex script + Claude doc | bekliyor |

Tahmini toplam: 8-12 ekip turu (her tur kullanıcının "tamamlandı" mesajı ile döner).

---

## Kullanıcı kararları (2026-04-28)

- **Audit kapsamı:** Meta hesabı bağlı, son 30 günde delivery yapan TÜM aktif businesslar (sadece bir/birkaç değil).
- **Otomatik snapshot refresh:** Scope dışı. Manuel "Run Analysis" davranışı korunur. Bu sekans yalnızca coherence + correctness + UI dürüstlük üzerine.
- **İletişim formatı:** Bu repo'daki `docs/team-comms/happy-harbor/` markdown thread.

---

## İletişim protokolü

Dosya konvansiyonu (numaralı, kronolojik):
```
00-charter.md                    ← bu dosya
01-claude-handoff-faz-A.md       ← her handoff
02-codex-deliverables-A.md       ← her teslimat
03-claude-review-A.md            ← her denetim
04-claude-handoff-faz-B.md       ← bir sonraki tur
...
audit-A/                          ← faz çıktıları (sample, rating, rapor)
audit-B/, audit-C/, ...
```

Her dosya 4 sabit bölüm taşır:
1. **Bağlam** — niye yazıldı, neye yanıt
2. **Talep / Çıktı** — somut deliverable + kabul kriterleri
3. **Açık sorular** — diğer ekibin önce yanıtlaması gereken
4. **Sonraki tetikleyici** — hangi koşulda kullanıcıya "tamamlandı" denilecek

**Önemli:** Tartışmayı, talebi, kabul kriterini, denetim sonucunu — hepsi bu thread'de. Hiçbir şey kanal-dışı değil.

---

## Risk envanteri

| Risk | Karşı önlem |
|---|---|
| Legacy ↔ V2 birleştirmesi production'ı kırar | Faz B'de feature flag fallback'i 2 hafta tutulur; snapshot store'da contractVersion alanı mevcut |
| Gold v1 yapımı uzun sürer | Faz A'dan gelen 200 satır gold v1'in temelini direkt besliyor |
| Buyer comprehension testi insan zamanı ister | 5 buyer × 10 creative ≈ 1.5 saat toplam |
| `phase` türetimi kalibre olmaz | Faz C denetimi: Claude ekibi elle atadığı `phase` ile fonksiyon ≥ %92 uyumlu olmalı |
| Rating kirlenir (Adsecute label leak) | Sample maskeleme zorunlu; Adsecute label alanları rating tamamlanana kadar görünmez |

---

## Şu an aktif iş

**Faz A.1-A.3 — Codex'in işi.** Detay: [01-claude-handoff-faz-A.md](01-claude-handoff-faz-A.md).
