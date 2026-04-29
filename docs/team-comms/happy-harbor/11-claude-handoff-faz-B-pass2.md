# Happy Harbor — Faz B Pass 2 Handoff (Claude → Codex)

> Önceki: [10-claude-review-B.md](10-claude-review-B.md) — Faz B denetim, yeşil-kondisyonel.
> Sonraki tetikleyici: bu dosya iletildiğinde Codex Pass 2 implementation'ına başlar; tamamlandığında Faz B kapanır, Faz C handoff'u yazılır.

---

## 1. Bağlam

Faz B implementation'ının çekirdeği yerinde, ama [08-claude-handoff-faz-B.md § 3.8](08-claude-handoff-faz-B.md) commercial truth verification gate uygulanmadı. Bu gate Faz B'nin teknik tamamlanma kriteridir — A.5 sample'ında 5/8 işletmenin target pack'i hiç ayarlı değil; resolver bu durumda fallback (business median ROAS) kullanıyor ama UI hiçbir yerde göstermiyor. Kullanıcı yanlış kalibre olduğunu bilmiyor → Adsecute önerilerine güvenir → "winner" kararları sistemli yanlış olabilir.

Pass 2 sadece bu gate'i kapatıyor. 1-2 saat iş.

---

## 2. Görev — § 3.8'in 5 maddesi

### 2.1 Evidence tag: `break_even_proxy_used` (primary weight)

[lib/creative-verdict.ts](../../lib/creative-verdict.ts) içinde:

```ts
// CreativeReasonTag union'ına ekle:
| "break_even_proxy_used"
| "break_even_default_floor"
```

Resolver içinde break-even hesabı yaparken:

```ts
// resolveCreativeVerdict body içinde, evidence push site'ları:
if (commercialTruth.targetPackConfigured && commercialTruth.targetRoas > 0) {
  // canonical target — no proxy
  pushEvidence(evidence, seenEvidence, "target_pack_configured", "supporting");
} else if (baseline.selected.medianRoas > 0) {
  // fallback to business median
  pushEvidence(evidence, seenEvidence, "break_even_proxy_used", "primary");
} else {
  // ultimate fallback
  pushEvidence(evidence, seenEvidence, "break_even_proxy_used", "primary");
  pushEvidence(evidence, seenEvidence, "break_even_default_floor", "primary");
}
```

**Why primary weight:** Bu rating'in güvenilirliğini doğrudan etkiler — UI prioritization'ında "supporting" tag'lerin altında değil, "primary" sırasında olmalı.

### 2.2 UI rozet — Creative detail surface

[components/creatives/CreativeDetailExperience.tsx](../../components/creatives/CreativeDetailExperience.tsx) verdict band içinde, "Why" bölümü chip'lerinin yanında veya verdict band'ın hemen altında küçük amber pill:

```
[Test Winner] [Ready to Scale]    Break-even: median proxy ⓘ
```

Tıklanınca tooltip:
> "This break-even is computed from the business's 30-day median ROAS because no commercial truth target pack is configured. Configure a target pack in Settings → Commercial Truth for accurate break-even calibration."

`evidence.some(e => e.tag === "break_even_proxy_used")` ile gösterilir.

### 2.3 UI rozet — Meta decision OS panel

[components/meta/meta-decision-os.tsx:951](../../components/meta/meta-decision-os.tsx) zaten `Targets {formatBooleanState(commercialTruth.targetPackConfigured)}` satırını render ediyor. `targetPackConfigured == false` durumunda amber tone ekle ve metni "Targets: median proxy fallback" olarak güncelle. Tooltip yine settings link'i.

### 2.4 Test fixtures (creative-verdict.test.ts)

En az 4 yeni test:

| Test adı | targetPackConfigured | targetRoas | medianRoas | Beklenen evidence |
|---|---|---|---|---|
| `break_even uses target pack when configured and finite` | true | 2.5 | 3.0 | `target_pack_configured`, NO `break_even_proxy_used` |
| `break_even falls back to median when target pack absent` | false | null | 3.0 | `break_even_proxy_used` (primary), NO `break_even_default_floor` |
| `break_even falls back to median when targetRoas is null` | true | null | 3.0 | `break_even_proxy_used` (primary), NO `break_even_default_floor` |
| `break_even uses 1.0 floor when both target and median absent` | false | null | null | `break_even_proxy_used` AND `break_even_default_floor` (both primary) |

### 2.5 Re-run integrity check

[scripts/happy-harbor-faz-b-rerun.ts](../../scripts/happy-harbor-faz-b-rerun.ts) içinde sample-200 işlerken sayım assertion'ı ekle:

```ts
const targetPackConfiguredCount = sample.rows.filter(
  (r) => r.commercialTruth?.targetPackConfigured === true
).length;
if (targetPackConfiguredCount !== 95) {
  throw new Error(
    `Integrity check failed: expected 95 rows with targetPackConfigured=true, got ${targetPackConfiguredCount}. ` +
    `If sample-200.json was regenerated, update the expected value in this script.`
  );
}
const proxyUsedCount = sample.rows.filter((r, i) => {
  const verdict = resolveCreativeVerdict(toResolverInput(r));
  return verdict.evidence.some(e => e.tag === "break_even_proxy_used");
}).length;
console.log(`Break-even proxy used: ${proxyUsedCount}/200 rows`);
// Expected: 105 (200 - 95 target pack configured = 105 fallback)
```

`audit-B/faz-b-rerun.md`'ye yeni satır:

```
- targetPackConfigured: 95/200 (assertion passed)
- break_even_proxy_used evidence: 105/200 rows
```

---

## 3. Açık sorular

**Yok.** Spec § 3.8'de yazıldı; Pass 2 implementation directive'i.

---

## 4. Self-review checklist

- [ ] `creative-verdict.ts` `CreativeReasonTag` union'ına `break_even_proxy_used` ve `break_even_default_floor` eklendi.
- [ ] Resolver fallback path'te `break_even_proxy_used` (primary weight) basıyor.
- [ ] CreativeDetailExperience'da rozet görünür (sample-200 üzerinde 105/200 satırda).
- [ ] meta-decision-os.tsx'de `targetPackConfigured == false` durumunda amber tone + güncellenmiş label.
- [ ] 4 fixture test eklendi ve pass.
- [ ] `scripts/happy-harbor-faz-b-rerun.ts` integrity check (95/200 + proxy used 105/200) `audit-B/faz-b-rerun.md`'ye yansıdı.
- [ ] `npm test` clean, `npx tsc --noEmit` clean.
- [ ] Manuel UI smoke: bağlı staging'de 5 creative aç (en az 2'sinin company-01/03/04/06/07 olması — proxy fallback aktif olduğu işletmelerden); rozet görünüyor mu? Tooltip Settings link'ini doğru veriyor mu?

---

## 5. Tetikleyici

Tüm checklist yeşil olduğunda `12-codex-deliverables-faz-B-pass2.md` yaz (4 sabit bölüm), commit, "Codex ekibi tamamladı" dedirt. Ben Pass 2'yi denetlerim; yeşilse Faz B kapanır ve Faz C handoff'u (`13-claude-handoff-faz-C.md`) yazılır.

— Claude ekibi
