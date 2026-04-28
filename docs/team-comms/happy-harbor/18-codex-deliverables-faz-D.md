# Happy Harbor — Faz D Codex Deliverables

## Bağlam

Faz D'de buyer-facing verdict UI tek `CreativeVerdict` kontratı etrafında sadeleştirildi. Amaç, media buyer'ın detail drawer, tablo, canonical Decision OS surface ve public share çıktısında aynı phase/headline/action dilini görmesi ve "ne yapacağım?" sorusunu 3 saniye içinde çelişkisiz yanıtlayabilmesi.

Bu turda V2 preview surface artık UI tarafında preview değil canonical surface olarak ele alındı; eski query flag kapısı kaldırıldı. Buyer comprehension çalışması için gerçek buyer oturumları Faz E'ye bırakıldı, fakat protokol ve 10 satırlık örnek set hazırlandı.

## Teslim

- `components/creatives/VerdictBand.tsx` eklendi.
  - Full mode: phase pill, "{Headline} — {ActionShortLabel}", confidence/evidence/blocker summary ve 6 action için CTA.
  - Compact mode: phase pill, truncated headline, mini action icon; tablo/surface/share için kısa karar yüzeyi.
  - `VerdictWhy` evidence/blocker bölümünü primary evidence first olacak şekilde 3 evidence + 2 blocker cap ile render ediyor; fazlası `Show all evidence` arkasında.
- `components/creatives/VerdictBand.test.tsx` eklendi.
  - 14 test: 6 action label/tone path, readiness states, blocked disabled state, compact/full rendering, null phase migration, helper labels, evidence cap, break-even proxy link.
- `CreativeDetailExperience.tsx` verdict alanı inline implementation yerine `VerdictBand` + `VerdictWhy` kullanıyor.
  - Action button wiring Faz D'de intent capture olarak bırakıldı: `creative_verdict_action_requested` event'i ve scale için mevcut legacy analytics event'i basılıyor.
- `CreativesTableSection.tsx` static `Verdict` kolonu ekledi.
  - Konum: `Creative / Ad Name` sonrasında ilk static decision kolonu, Launch date ve metric kolonlarından önce.
  - Legacy lifecycle/action/operator decision kolonu bulunmadı; performans metrikleri korundu.
- `CreativesTopSection.tsx` quick filter tooltip metinleri Faz D § 2.4 tablosuyla birebir güncellendi.
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` silindi, `components/creatives/CreativeDecisionOsSurface.tsx` eklendi.
  - Component adı `CreativeDecisionOsSurface`.
  - UI prop adı `payload`.
  - Page tarafında `creativeDecisionOsV2Preview` / `v2Preview` off flag handling kaldırıldı.
  - Internal service/API adları geriye uyum için `getCreativeDecisionOsV2Preview` ve preview payload type'larıyla kaldı.
- `PublicCreativeSharePage.tsx` share analysis içinde `VerdictBand size="compact"` kullanıyor.
  - `shareCreativeTypes.ts`, `page-support.tsx`, `shareCreativeMock.ts` verdict payload'ı taşıyacak şekilde güncellendi.
- Buyer comprehension dosyaları eklendi:
  - `docs/team-comms/happy-harbor/buyer-comprehension/protocol.md`
  - `docs/team-comms/happy-harbor/buyer-comprehension/example-set.json`
  - `docs/team-comms/happy-harbor/buyer-comprehension/results-template.md`
  - Example set coverage: 10 row, 7 business, action coverage scale/keep_testing/protect/refresh/cut/diagnose, phase coverage test/scale/post-scale, readiness coverage ready/needs_review/blocked.

Verification:

- `npm test`: passed, 312 files / 2319 tests.
- Targeted Faz D render tests: passed, 8 files / 62 tests across VerdictBand, detail, table, share, page, surface, no-write.
- `npx tsc --noEmit`: passed.
- `npm run creative:v2:safety`: passed, macroF1 97.96, severe 0, high 0, medium 2, low 0, none 76.
- Production DB manual UI smoke: preflight succeeded (`ssh` access ok, local tunnel to `127.0.0.1:15432` started, `npm run dev` reached `http://localhost:3000`). Browser walkthrough for 3 business x 5 creative was not completed before this deliverable-request handoff; tunnel/dev server were stopped and this is recorded as a residual manual QA gap.

Self-review checklist:

- [x] `VerdictBand.tsx` supports 6 action x 3 readiness x 2 size combinations.
- [x] `VerdictBand.test.tsx` has at least 12 tests.
- [x] `CreativeDetailExperience.tsx` inline verdict implementation replaced by `VerdictBand`.
- [x] Why section is capped at 3 evidence + 2 blocker chips with expand.
- [x] Table `Verdict` column added as first static decision column after creative name.
- [x] Quick filter tooltip copy matches Faz D § 2.4.
- [x] `CreativeDecisionOsV2PreviewSurface.tsx` renamed to `CreativeDecisionOsSurface.tsx`.
- [x] Page-level V2 preview query flag handling removed.
- [x] `PublicCreativeSharePage.tsx` uses `VerdictBand`.
- [x] Render/snapshot-style tests updated for detail/table/share/surface consistency.
- [x] Buyer comprehension protocol/example/template committed.
- [x] `npm test` clean.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run creative:v2:safety` clean.
- [ ] Full manual UI smoke, 3 business x 5 creative, remains to be completed in browser.

## Açık sorular

1. Tablo'da legacy kolonların durumu:
   - `TableColumnKey` içinde `lifecycleState`, `primaryAction`, `operatorPrimaryDecision` veya benzeri user-facing verdict/action kolonları bulunmadı.
   - Karar: performans metrikleri ve AI tag kolonları korundu; yeni `Verdict` kolonu static decision column olarak eklendi.

2. VerdictBand action button wiring:
   - Karar: Faz D'de placeholder/intent capture kullanıldı.
   - Gerekçe: `Cut Now`, `Refresh Creative`, `Keep Active`, `Continue Testing`, `Investigate` gibi CTA'lar platform write veya workflow mutation anlamına gelebilir. Buyer comprehension oturumları tamamlanmadan gerçek Meta/API mutation bağlamak riskli olur. Gerçek mutation Faz E sonrası ayrı execution contract ile bağlanmalı.

3. Compact mode davranışı:
   - Karar: tablo/share/surface compact mode yalnızca phase pill + truncated headline + mini action icon gösteriyor.
   - Gerekçe: tablo satır yüksekliği ve canonical surface density korunmalı. Full CTA metni full band'da kalıyor; compact tooltip karar özetini action id/readiness ile taşıyor ve read-only safety scan'i bozacak "Cut Now" gibi hidden button dilini üretmiyor.

## Sonraki tetikleyici

Claude ekibi Faz D denetimini yapar. Özellikle `VerdictBand` okunabilirliği, canonical surface rename, query flag kaldırımı, share/table/detail tutarlılığı, buyer comprehension örnek set dağılımı ve kalan manual UI smoke gap'i değerlendirilir.

Yeşilse Faz E handoff'u bekleniyor: sürekli doğrulama, gold v1 agreement audit script, dokümantasyon ve gerçek buyer comprehension oturumları.
