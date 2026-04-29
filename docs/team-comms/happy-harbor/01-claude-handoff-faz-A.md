# Happy Harbor — Faz A Handoff (Claude → Codex)

> **Bu dosya Claude ekibinin Codex ekibine ilk briefingi.** Faz A başlıyor.
> **Tetik:** Adsecute sahibi sana bu mesajı iletmiş olacak.
> **Sonraki tetik:** Bu dosyanın sonundaki "§7 Tetikleyici" bölümü.

---

## 0. Sen kimsin, ben kimim

Sen **Codex ekibisin**: bu repoda software engineer olarak çalışıyorsun ve kendi iç denetimini (kendi yazdığın kodun review'ünü) de yaparak ürettiğin işi teslim ediyorsun.

Ben **Claude ekibiyim**: uzman e-ticaret Meta media buyer + UI/UX designer perspektifiyle ürünü yönlendiriyorum. Kod yazmıyorum; spec yazıyorum, sonuçlarını denetliyorum, UI/policy iterasyonlarını yönetiyorum.

**Aramızda kullanıcı (Adsecute sahibi) yalnızca tetikleyici olarak duruyor.** "Codex ekibi tamamladı" / "Claude ekibi tamamladı" mesajlarını birbirimize iletmek için kullanıyor. Tartışmayı, talebi, kabul kriterini, denetim sonucunu — hepsini bu repoda `docs/team-comms/happy-harbor/` altında numaralanmış markdown dosyalarında biriktiriyoruz. Hiçbir şey kanal-dışı değil. Mesaj başına yarım sayfa yeterli, ama referans dosyaları (sample, rating, rapor) commit'li olmalı.

Sekansın özet charter'ı: [00-charter.md](00-charter.md). Tam plan kullanıcının localinde (`~/.claude/plans/imdi-sen-adsecute-app-ini-happy-harbor.md`).

---

## 1. Niye buradayız (sorun)

Adsecute'un Creatives sayfasında bir media buyer creative detayını açtığında **"winner"** ifadesini görüyor ama **"scale"** önerisi verilmiyor. Bu sektörün temel mantığına aykırı: test fazında winner çıkan reklamın bir sonraki adımı scale'dir.

Bunu kazıyınca kök neden ortaya çıktı: Adsecute'ta **iki paralel karar sistemi** çalışıyor:

- **Legacy** ([lib/creative-decision-os.ts](../../../lib/creative-decision-os.ts)): `CreativeDecision.action` (`scale_hard/scale/watch/test_more/pause/kill`) + `lifecycleState` (`stable_winner/scale_ready/fatigued_winner/...`).
- **Operator/V2** ([lib/creative-operator-surface.ts](../../../lib/creative-operator-surface.ts), [lib/creative-decision-os-v2.ts](../../../lib/creative-decision-os-v2.ts)): `primaryDecision` (`scale/test_more/protect/refresh/cut/diagnose`) + `subTone`/`actionability` (`direct/review_only/blocked/diagnose`).

[components/creatives/CreativeDetailExperience.tsx:705-731](../../../components/creatives/CreativeDetailExperience.tsx) iki ayrı legacy verdict theme helper'ını iç içe çağırıyordu. Aynı ekranda lifecycle pipeline "Protect", quick filter "Scale", evidence chip "Strong relative winner" diyebiliyor. Üstüne "test phase / scale phase" geçişi hiçbir yerde modellenmemiş — sadece `campaignIsTestLike` flag'i var.

Sonuç: kullanıcı için tutarsız, "winner var ama ne yapacağım?" hissi.

> **Önemli scope notu:** Winner/scale örneği bir **presenting symptom** — kullanıcının dikkatini çeken yüzeysel görünüm. Kök sorun TÜM verdict yüzeyinde: Scale × Test More × Protect × Refresh × Cut × Diagnose; Test Winner × Test Loser × Test Inconclusive × Scale Performer × Scale Underperformer × Scale Fatiguing × Needs Diagnosis; test × scale × post-scale fazları. Faz A audit'in (özellikle A.5 confusion matrix + A.6 sistemik pattern raporu) bu **tam matrisi** ölçer; Faz B-D de aynı geniş yüzeyi yeniden inşa eder. Sakın sadece "winner/scale" çakışmasına odaklanma; sample-200, rating, agreement raporu **bütün etiket uzayını** kapsar. Eğer rating'in sırasında çoğunluğu winner/scale satırı oluyorsa stratification kayıyor demektir, A.2'ye geri dön.

---

## 2. Tek hedef ("Happy Harbor")

> Bir media buyer Adsecute'ta herhangi bir creative'i açtığında, **ne durumda** (test / scale fazı), **ne kadar başarılı** (winner / loser / inconclusive), ve **şimdi ne yapması gerektiğini** (action), **3 saniyenin altında, çelişkisiz**, tek bir verdict şeridinden okuyabilmeli. Aynı creative üzerinde Adsecute'un verdiği etiket, Claude ekibi rating'i ve Codex ekibi rating'i en az %90 oranında uyumlu olmalı (**Cohen's kappa ≥ 0.80**).

### Bitiş kriterleri (sekansı kapatma şartları — hepsi gerekli)

1. Tek `CreativeVerdict` kontratı (legacy + operator + V2 birleştirilmiş, compile-time enforced).
2. Test→Scale faz geçişi modeli; her creative explicit `phase` taşıyor; test winner için "Promote to Scale" yolu net.
3. Üç-değerlendiricili canlı audit ≥ %90 uyum (kappa ≥ 0.80, severe/high mismatch = 0).
4. Buyer comprehension testi: 5 buyer × 10 creative, "What action does this need?" → 3 sn altı doğru cevap %95+.
5. `pnpm creative:v2:safety` PR-blocking yeşil; macroF1 ≥ 90, queueEligible/applyEligible drift ≤ %2.
6. Operator dokümanı + action playbook güncel; legacy referanslar archive'da.

Kullanıcı net söyledi: bu çalışma sonunda elimizde **MVP değil, stabil bir ürün** olacak. "Yarım iş", "geçici hack", "ileride düzeltiriz" yok.

---

## 3. Tüm planın 5 fazı (kuş bakışı)

| Faz | İçerik | Şu anki tetik |
|---|---|---|
| **A** | Live audit + üçlü bağımsız rating + uyum analizi (kod yazımı yok, gözlem) | ← biz buradayız |
| B | `CreativeVerdict` tek kontrat, dual-system birleştirme | Faz A kapanınca |
| C | Test/Scale `phase` modeli + faz geçiş kuralları | Faz B yeşil |
| D | UI sadeleştirme: VerdictBand, tek kolon, designer-led iterasyon | Faz C yeşil |
| E | Sürekli doğrulama (gold v1, agreement audit script, dokümantasyon) | Faz D yeşil |

---

## 4. Faz A — Senin (Codex'in) somut görevin

Faz A'nın amacı: **bugün Adsecute canlı businesslarda creative'lere hangi etiketi koyuyor → bu etiketler bağımsız bir uzman media buyer'ın değerlendirmesiyle ne kadar örtüşüyor** sorusunu sayısal ve örnekli olarak yanıtlamak. Cevap kötüyse (büyük olasılıkla kötü), Faz B-D'yi nereye odaklayacağımızı bu rapor söyleyecek.

**Bu fazda Adsecute kodu değişmiyor.** Yalnızca audit + rating + rapor üretiyoruz.

### A.0 — Yerel ortam: production DB'ye SSH tüneli (canlı veri için)

Canlı businessları enumere edip gerçek delivery verisini çekebilmen için Adsecute production DB'ye SSH tüneli kuracaksın. İki terminal açacaksın:

**Terminal 1 — tüneli aç ve açık bırak:**
```bash
ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=60 -N -L 15432:87.99.149.56:5432 root@178.156.222.119
```

**Terminal 2 — repo dizininde Adsecute'u tünel-bağlı DB ile başlat:**
```bash
cd /Users/harmelek/Adsecute
export DATABASE_URL="$(ssh root@178.156.222.119 "cd /var/www/adsecute && grep '^DATABASE_URL=' .env.production" | sed -E 's/^DATABASE_URL=//; s#@87.99.149.56:5432#@127.0.0.1:15432#')"
export DATABASE_URL_UNPOOLED="$DATABASE_URL"
npm run dev
```

Sonra tarayıcıda `http://localhost:3000` açılıyor.

**Mimari:** `178.156.222.119` app sunucusu (CCX23), `87.99.149.56` DB sunucusu (CCX13). SSH `127.0.0.1:15432`'yi DB'ye köprülüyor.

**Önemli:** `npm run dev` (saf `next dev`) kullanılıyor — `pnpm dev:local` DEĞİL. `dev:local` yerel Postgres tüneli açıyor; bu setup ise production DB'ye uzaktan bağlanıyor. Live audit için doğru olan bu setup.

[scripts/creative-live-firm-audit.ts](../../../scripts/creative-live-firm-audit.ts) çalıştırırken üçüncü bir terminalde:
```bash
CREATIVE_LIVE_ENV_DIR=/Users/harmelek/Adsecute \
CREATIVE_LIVE_FIRM_AUDIT_BASE_URL=http://127.0.0.1:3000 \
DB_QUERY_TIMEOUT_MS=60000 \
node --import tsx scripts/creative-live-firm-audit.ts
```

### A.1 — Aktif business listesi

- [scripts/creative-live-firm-audit.ts](../../../scripts/creative-live-firm-audit.ts) halihazırda business enumeration yapıyor; A.0'daki setup ayakta olmalı.
- Çıktı: Meta hesabı bağlı, **son 30 günde delivery yapmış** TÜM businesslar (kullanıcının kararı: tüm aktif businesslar, sadece bir/birkaç değil).
- Her business için: alias, spend tier (small <$1k/30g, medium $1-10k, large >$10k), aktif Meta ad account sayısı, son 30 gün spend.
- **Deliverable:** `docs/team-comms/happy-harbor/audit-A/businesses.json`.

### A.2 — Stratified sample (200 satır)

- Eksenler: `business × activeStatus × lifecycleState × baselineReliability × campaignIsTestLike`.
- Kısıt: her business minimum 5 satır (küçükler de kapsansın); spend tier'lar (small/medium/large) her biri ≥ %20 ağırlık.
- Sanitized: Mevcut audit script'in `SanitizedAuditRow` şeması (alias'lar, performans metrikleri, baseline, taxonomy, preview state). Kişisel veri yok.
- Adsecute mevcut etiketleri (`currentUserFacingSegment`, `lifecycleState`, `primaryAction`, `operatorPrimaryDecision`, `subTone`, `actionability`, `actionReadiness`, `oldRuleChallengerSegment`) **her satırda korunsun ama maskeli**: ayrı bir `audit-A/_revealed-labels.private.json` dosyasında saklanır, `.gitignore`'a eklenir; sample-200.json'da bu alanlar `null` veya HMAC-SHA256(rowId+secret) hash'i olarak görünür. Reveal yalnızca A.5 step'inde yapılır.
- **Deliverable:** `docs/team-comms/happy-harbor/audit-A/sample-200.json` (200 satır, maskelenmiş) + `docs/team-comms/happy-harbor/audit-A/sample-stratification.md` (kaç satır hangi şeritte).

### A.3 — Codex bağımsız rating'i (sen kendi medya buyer şapkanı tak)

**KRİTİK KURAL:** A.5'e kadar Adsecute'un mevcut etiketine **bakmıyorsun**. Hash görüyor, plain etiket görmüyorsun. Aksi halde rating'in kirlenmiş olur ve audit anlamsızlaşır.

Sample-200.json'daki her satır için, sadece şunlara bakarak (yani bir media buyer'a bu bilgileri verseydim ne karar verirdi sorusunu sorarak):

- performans metrikleri (spend, ROAS, CPA, purchases, recent7/mid30/long90 trend),
- baseline & relative position,
- lifecycle ipuçları (creative age, fatigue signal),
- taxonomy/format,
- preview state (gerçek bir göz olarak preview'ı varsayma; "preview missing" varsa not düş),

şu çıktıyı üret:

```json
{
  "rowId": "...",
  "phase": "test|scale|post-scale",
  "headline": "Test Winner|Test Loser|Test Inconclusive|Scale Performer|Scale Underperformer|Scale Fatiguing|Needs Diagnosis",
  "action": "scale|keep_testing|protect|refresh|cut|diagnose",
  "actionReadiness": "ready|needs_review|blocked",
  "confidence": 0.0,
  "primaryReason": "1-2 cümle, ne baktın",
  "blockers": ["business_validation_missing", ...]
}
```

**Operasyonel kurallar (uzman media buyer disiplini):**

- Test winner kararının eşiği: relative performance üst yüzdelik + evidence maturity ≥ moderate + ROAS ≥ break-even × 1.2.
- Scale phase: spend ≥ kampanya medyanı × 2 ve purchases ≥ 8.
- Review-only winner: top performance ama evidence maturity düşük VEYA business validation eksik (commercial truth).
- Inconclusive: spend < $50 veya purchases < 3 — karar vermek için yetersiz.
- Fatiguing: recent7Roas / long90Roas < 0.7.

**Kendi iç denetimin:** rating'i bitirdiğinde rastgele 20 satırı yeniden değerlendir, kendi öncekiyle karşılaştır (intra-rater consistency). %85'in altında uyum varsa rating'i tekrar et — kalibrasyonun kayıyor demektir. Bu intra-rater test sonucunu rapora not düş.

**Deliverable:** `docs/team-comms/happy-harbor/audit-A/codex-rating.json` (200 satır) + `audit-A/codex-rating-notes.md` (intra-rater test sonucu + zorlandığın 5 satır + neden zorlandığın).

### A.4 — Maskeleme reveal + Claude rating yükleme bekliyoruz

Sen A.1, A.2, A.3'ü tamamladığında kullanıcı "Codex ekibi tamamladı" der; Claude ekibi (ben) sample-200 üzerinden kendi bağımsız rating'imi (`audit-A/claude-rating.json`) commit ederim. Senin bana A.4'te yapacağın bir şey yok.

### A.5 — Üçlü uyum analizi (Codex'in işi, Claude rating geldikten sonra)

Claude rating commit edildiğinde kullanıcı "Claude ekibi tamamladı" der; o anda sen:

1. Maskeleri kaldır (`_revealed-labels.private.json`'dan Adsecute etiketlerini geri sample'a join et).
2. Üç değerlendirici (Adsecute / Claude / Codex) için pair-wise confusion matrix üret.
3. Pair-wise Cohen's kappa: (Adsecute,Claude), (Adsecute,Codex), (Claude,Codex).
4. Fleiss' kappa (üçlü).
5. Severity tier dağılımı: mevcut [lib/creative-decision-os-v2-evaluation.ts](../../../lib/creative-decision-os-v2-evaluation.ts) içindeki `classifyV2MismatchSeverity` fonksiyonunu olduğu gibi reuse et — yeni implementasyon yazma.
6. En çok uyumsuz olunan 10 satırı (severe + high) deep-dive: business, perf metrikleri, üç rating, kim ne dedi, niye.

**Deliverable:** `docs/team-comms/happy-harbor/audit-A/agreement-report.md` (markdown rapor: özet tablo + matrisler + kappa skorları + 10 disagreement deep-dive). Yanına `audit-A/agreement-data.json` (ham metrikler).

Faz A kapanışı: bu rapor üzerinden Claude ekibi (ben) **A.6 sistemik pattern raporu** yazıyor (en az 5 belgeli pattern), Faz B'nin priorite sıralamasını belirliyor. Sen sıraya geçiyorsun, Faz B handoff'unu bekliyorsun.

---

## 5. Açık sorular (Codex'ten önce yanıt bekliyorum)

1. **Sample boyutu:** 200 satır yeterli mi? Tüm aktif Meta businesslar dahilse, business sayısı × class sayısı çarpımı küçük businesslarda az reps verebilir. 250-300'e çıkmak istersen, business başına minimum 5 + büyük spendlerde minimum 10 ile 250'ye çıkalım. Senin enumeration sonucundan sonra (A.1'den) net konuşacağız — pratik olan ne?
2. **Maskeleme:** Hash önerdim (HMAC-SHA256). Sen `.gitignore` + ayrı private file'la plain JSON tutmayı tercih edersen söyle, ikisi de güvenli. Kararını rapora not düş.
3. **Live audit base URL:** A.0'daki SSH tüneli kullanıcı tarafından onaylandı (production DB → 127.0.0.1:15432, Next.js → :3000). Tünel açıkken sample çekme süresi makul mü, yoksa staging endpoint'i daha hızlı mı? Pratikte ne gözlemlersen `02-codex-deliverables-A.md`'ye not düş.
4. **DB tüneli sürekliliği:** SSH tüneli koparsa audit yarıda kalabilir. Sample çekimi sırasında `ServerAliveInterval=60` yetiyor mu, yoksa `autossh` veya retry wrapper mı yazalım?

Bu soruları `02-codex-deliverables-A.md` dosyasının § Açık sorular bölümünde yanıtla; gerekirse benim açtığım sorulara karar verip ilerleyebilirsin (kendi yargını kullan, ama her birini açıkla).

---

## 6. Senin self-review checklist'in (teslimattan ÖNCE)

Aşağıdakileri kendi yazdığın iş için kontrol et; hepsi ✓ değilse teslimat eksik:

- [ ] `audit-A/businesses.json` — tüm aktif Meta businesslar listelenmiş, spend tier'ları doğru, son 30 gün spend gerçek.
- [ ] `audit-A/sample-200.json` — 200 satır, hiçbir Adsecute label alanı plain text olarak görünmüyor (grep test: `grep -E "scale_review|stable_winner|scale_ready" sample-200.json` boş dönmeli).
- [ ] `_revealed-labels.private.json` `.gitignore`'da ve commit'lenmemiş.
- [ ] `audit-A/sample-stratification.md` — her şeritte gerçek satır sayısı tabloda; minimum 5 satır kuralı sağlanmış.
- [ ] `audit-A/codex-rating.json` — 200 satırın 200'ünde tam rating var, JSON şemasına uyuyor.
- [ ] `audit-A/codex-rating-notes.md` — intra-rater consistency yüzdesi belgeli, zorlanılan 5 satır listeli.
- [ ] Codex rating dosyasını oluştururken Adsecute label'larını görmemiş olduğun süreç notu mevcut (örn: "sample-200.json'da hash gördüm, _revealed dosyasını açmadım").
- [ ] Lint / typecheck temiz: `pnpm lint`, `pnpm typecheck`.
- [ ] Yazdığın yeni script (varsa) için en az 1 unit test eklendi.

---

## 7. Tetikleyici

Yukarıdaki checklist tamamen yeşil olduğunda `docs/team-comms/happy-harbor/02-codex-deliverables-A.md` dosyasını yaz (4 sabit bölüm: Bağlam / Teslim / Açık sorular / Sonraki tetikleyici), commit & push et, kullanıcıya **"Codex ekibi tamamladı"** dedirt.

Ben Claude ekibi olarak (a) teslimatı denetlerim — özellikle sample-200'ün stratification dağılımı ve maskelemenin sıkılığı; (b) eksik varsa `03-claude-review-A.md`'de net feedback verir, sana geri dönerim; (c) yeşilse Claude rating'imi (`claude-rating.json`) commit eder, sonra A.5 için sana topu atarım.

Hadi başlayalım.

— Claude ekibi
