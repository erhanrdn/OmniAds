# Happy Harbor — Faz D Deliverable Request (Claude → Codex)

> Önceki: [17-claude-handoff-faz-D.md](17-claude-handoff-faz-D.md) — Faz D handoff.
> Sonraki tetikleyici: bu dosya iletildiğinde Codex deliverable dosyasını yazıp commit eder.

---

## 1. Bağlam

Kullanıcı "Codex ekibi tamamladı" mesajını ilettiğinde working tree taradım — Faz D'nin önemli implementation parçaları yerinde:

- ✓ `components/creatives/VerdictBand.tsx` + `.test.tsx`
- ✓ `components/creatives/CreativeDecisionOsSurface.tsx` (V2PreviewSurface rename)
- ✓ `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` silindi
- ✓ `app/(dashboard)/creatives/page.tsx`'den `v2Preview` flag kaldırıldı
- ✓ `docs/team-comms/happy-harbor/buyer-comprehension/` 3 dosyayla (protocol.md, example-set.json, results-template.md)
- ✓ Detail / Table / Share / TopSection / page-support hepsi modified
- ✓ `npx tsc --noEmit -p .` clean (0 error)

Ama **iki protokol eksikliği** var:

1. **`18-codex-deliverables-faz-D.md` yok** — protokol icabı her teslim 4 sabit bölümlü deliverable dosyası ile gelir (Bağlam / Teslim / Açık Sorular / Sonraki tetikleyici). Sensiz neyin yapıldığı, hangi açık soruların yanıtlandığı, manuel UI smoke koşullarının nasıl gözlemlendiği kayda geçmedi.

2. **Hiçbir değişiklik commit'lenmemiş** — `git status` 16 modified + 6 untracked dosya gösteriyor. Faz B/C'de Codex teslim sonu commit yaptı; Faz D'de unutuldu. Bu state'te denetim için yeterli ipucu yok.

Tam denetim yapamam çünkü:
- Hangi self-review checklist maddesini geçtiğini bilmiyorum.
- Manuel UI smoke (3 business × 5 creative) yapıldı mı, sonuçlar ne?
- 17-claude-handoff-faz-D.md § 4'teki 3 açık soruya kararın ne?
- `npm test`, `creative:v2:safety` çıktıları nasıl?

---

## 2. Talep — sadece 2 madde

1. **`docs/team-comms/happy-harbor/18-codex-deliverables-faz-D.md` yaz.** 4 sabit bölüm:
   - **Bağlam:** Faz D scope'unda ne yaptığın
   - **Teslim:** ne dosya/component üretildiği, test sayısı, verification çıktıları (`npm test`, `tsc --noEmit`, `creative:v2:safety`, manuel UI smoke gözlemleri)
   - **Açık sorular:** 17-claude-handoff-faz-D § 4'teki 3 sorunun (legacy tablo kolonları, action button wiring placeholder/gerçek, VerdictBand compact size davranışı) yanıtların — hangi yargıyı kullandığını gerekçele
   - **Sonraki tetikleyici:** Claude denetimini bekliyorsun

2. **Tüm Faz D değişikliklerini commit et.** 16 modified + 6 untracked dosya. Standart commit mesajı önerisi: `Complete Happy Harbor phase D` (Faz B/C ile aynı format).

---

## 3. Self-review checklist hatırlatma

[17-claude-handoff-faz-D.md § 5](17-claude-handoff-faz-D.md)'teki 14 maddenin hangilerinin yeşil olduğunu deliverable dosyasında check'lerle göster. Özellikle önemli:

- [ ] VerdictBand.test.tsx ≥ 12 test
- [ ] CreativeDetailExperience.tsx 705-840 inline implementation kaldırıldı, VerdictBand component'iyle değiştirildi
- [ ] Why bölümü 3+2 chip cap'li, "Show all" expand çalışıyor
- [ ] Tablo Verdict kolonu default preset'lerde **ilk** kolon
- [ ] Quick filter tooltip metinleri § 2.4 tablosuyla **birebir**
- [ ] PublicCreativeSharePage VerdictBand kullanıyor
- [ ] Snapshot test'ler yeniden üretildi (detail / table / share / surface aynı verdict)
- [ ] buyer-comprehension/ 3 dosya commit'li
- [ ] Manuel UI smoke (3 business × 5 creative) — bağlı production DB ile
- [ ] `npm test`, `npx tsc --noEmit`, `npm run creative:v2:safety` çıktıları

---

## 4. Tetikleyici

Deliverable yazıp commit ettiğinde kullanıcıya **"Codex ekibi tamamladı"** dedirt. Ben tam Faz D denetimini yaparım — yeşilse Faz E (sürekli doğrulama, gerçek buyer oturumları, gold v1, dokümantasyon) handoff'unu yazarım.

— Claude ekibi
