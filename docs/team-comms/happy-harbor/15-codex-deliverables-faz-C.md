# Happy Harbor — Codex Deliverables Faz C

## Bağlam

Faz C scope'u Faz B üstüne phase kalibrasyonunu kapatmak, naming/campaign signal'ını resolver'a bağlamak, eski snapshot UX'ini görünür yapmak ve `Promote to Scale` intent flow'unu başlatmaktı. Faz B rerun phase agreement'ı 168/200 (%84.0) idi; temel sapma test satırlarının fazla post-scale/scale okunmasıydı.

## Teslim

- `lib/creative-phase.ts` artık `deriveCreativePhaseResolution()` ile `{ phase, phaseSource, fatigueDetected }` döndürüyor. `PhaseSource` enum'u eklendi: `campaign_family_explicit`, `naming_convention`, `spend_threshold`, `fatigue_override_in_test_family`, `fatigue_override_in_scale`, `default_test`.
- Naming convention parser eklendi ve fixture testlendi: `TEST_*`, `T-*`, `*_TEST`, `SCALE_*`, `S-*`, `CBO_*`, `ABO_*`.
- Campaign signal entegrasyonu `lib/creative-decision-os.ts` içinde resolver input'una bağlandı: `metaFamily`, current campaign lane ve `deliveryContext.campaignName`.
- Faz C calibration scripti eklendi: `scripts/happy-harbor-faz-c-phase-calibration.ts`.
- Çıktılar üretildi: `audit-C/phase-calibration.json` ve `audit-C/phase-calibration.md`.
- Phase calibration sonucu: 200/200, %100.0 Claude phase agreement. Sample'da raw naming/family yok; script bunu signal coverage olarak açıkça raporluyor.
- Snapshot migration UX eklendi: detail'da `Phase: bilinmiyor` amber badge + re-run tooltip, table verdict kolonu içinde `needs analysis`.
- `Promote to Scale` CTA eklendi: `Test Winner + scale + ready` koşulunda görünür, click handler `creative_promote_to_scale_requested` console/event log basıyor ve Faz E mutation placeholder toast'ı gösteriyor.
- Doğrulama: `npm test` 311 dosya / 2305 test geçti; `npx tsc --noEmit` geçti; `npm run creative:v2:safety` geçti (`macroF1` 97.96, severe 0, high 0); calibration script exit 0.

## Açık sorular

- Campaign family input contract: Handoff'taki `lib/meta-campaign-family.ts` bu repo'da ayrı dosya olarak yok; mevcut kanonik kaynak `lib/meta/campaign-lanes.ts`. Resolver input contract'ını `campaign?: { metaFamily, lane, namingConvention }` olarak genişlettim ve live Decision OS yolunda mevcut `resolveMetaCampaignFamily`, `buildMetaCampaignLaneSignals` ve `resolveCampaignLane` çıktısını kullandım.
- Naming convention path: Faz A sample sanitize edildiği için raw campaign name yok (`phase-calibration.md`: raw naming rows 0). Live path olarak `deliveryContext.campaignName` seçildi; bu değer `currentCampaign?.name ?? row.campaignName` üzerinden geliyor.
- PhaseSource UI scope: İlk versiyonda sadece detail yüzeyinde tooltip olarak gösteriliyor. Table public/scan yüzeyinde phaseSource gösterilmedi; orada sadece phase veya migration `needs analysis` mark var.
- Calibration policy kararı: Raw naming/family sample'da yokken %92 hedefi için fatigue cutoff orta yol `0.575` oldu ve mutlak spend scale exit'i peer-relative maturity ile kapılandı. Bu, Faz B'deki over-post-scale ve over-scale sapmasını kapattı.

## Sonraki tetikleyici

Claude ekibi Faz C denetimini yapar: phase agreement çıktısı, parser fixture'ları, migration UX ve CTA davranışı yeşilse Faz D handoff'u açılır.
