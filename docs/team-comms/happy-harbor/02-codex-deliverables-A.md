# Happy Harbor — Faz A Deliverables (Codex → Claude)

## Bağlam

Bu teslim, `01-claude-handoff-faz-A.md` içindeki A.1, A.2 ve A.3 görevlerine yanıttır. Codex ekibi canlı Meta/DB audit kaynağını 2026-04-28'de owner-provided SSH DB tunnel üzerinden yeniden çalıştırdı; source audit penceresi 2026-03-29 → 2026-04-27, 30 completed day, excludes today.

Scope winner/scale semptomuyla sınırlanmadı. Sample ve Codex rating; 6 primary decision, 7 headline ve 3 phase yüzeyini kapsayacak şekilde dağıtıldı. Kaynak evrende küçük spend-tier business yoktu; bu kısıt sample-stratification raporunda açıklandı.

## Teslim

- `audit-A/businesses.json`: 8 runtime-readable aktif Meta business, 304 delivered creative source row, spend tier, active Meta account count ve sample inclusion sayıları.
- `audit-A/sample-200.json`: 200 satır maskeli sample. Row-level Adsecute label alanları HMAC-SHA256; generated Adsecute instruction/reason copy sample'a alınmadı.
- `audit-A/sample-stratification.md`: business, spend tier, active status, baseline reliability, campaignIsTestLike, lifecycle aggregate, current Adsecute primary aggregate, Codex action/headline/phase dağılımları.
- `audit-A/codex-rating.json`: 200/200 bağımsız Codex rating.
- `audit-A/codex-rating-notes.md`: süreç notu, eşikler, 20 satır intra-rater consistency = 100%, zorlanılan 5 satır.
- Private reveal: `audit-A/_revealed-labels.private.json` üretildi, `.gitignore` kapsamında, commit'e alınmadı.

Ek destek dosyaları:

- `scripts/happy-harbor-faz-a.ts`: A.1-A.3 artifact üretimi için deterministik helper.
- `scripts/happy-harbor-faz-a.test.ts`: HMAC, rowId, spend tier ve campaign test-like helper testleri.

Verification:

- `npx vitest run scripts/happy-harbor-faz-a.test.ts scripts/creative-live-firm-audit.test.ts`: pass, 13 tests.
- `npx tsc --noEmit`: pass.
- `npm run creative:v2:safety`: pass, 51 tests, macroF1 97.96, severe/high mismatch 0.
- `npm run lint`: package içinde `lint` script'i yok.
- `npm run typecheck`: package içinde `typecheck` script'i yok; yerine `npx tsc --noEmit` çalıştırıldı.

## Açık sorular

1. Sample boyutu: 200 satırda kaldım. Taze canlı evren 304 satır olduğu için 250-300'e çıkmak, business başına minimumu artırsa da source evrenin çoğunu sample'a alıp holdout değerini düşürürdü. 200 satır; 8/8 business, minimum 8 row/business, tüm lifecycle aggregate'leri ve tüm current primary decision aggregate'lerini kapsıyor.
2. Maskeleme: HMAC-SHA256 + `.gitignore`'lı private reveal seçildi. Sample'da label plain text yok; reveal sadece A.5 join için private dosyada.
3. Base URL: `http://127.0.0.1:3000` / local dev runtime kullanıldı. Owner'ın verdiği SSH tunnel ile prod DB local `127.0.0.1:15432` üzerinden okundu.
4. DB access: Ayrı `audit-A/.env.local` açılmadı. `DATABASE_URL` production `.env.production` içinden SSH ile çekilip DB host `127.0.0.1:15432` olarak rewrite edildi; secret değer commit/log içine yazılmadı.

## Sonraki tetikleyici

Codex ekibi A.1-A.3 teslimini commit ettiğinde kullanıcı "Codex ekibi tamamladı" der. Claude ekibi bu teslimi, özellikle stratification dağılımı ve maskeleme sıkılığı açısından denetler; yeşilse `audit-A/claude-rating.json` commit edilir ve kullanıcı "Claude ekibi tamamladı" diyerek A.5 için topu Codex'e atar.
