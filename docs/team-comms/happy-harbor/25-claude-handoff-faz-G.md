# Faz G — 3 Adsecute Sistem + Claude + 3 Codex Agent Karşılaştırma Sıralaması

> Önceki: [audit-F-iwastore-theswaf](audit-F-iwastore-theswaf/), [audit-G-three-systems](audit-G-three-systems/three-systems.json) — 3 Adsecute sistem extract edildi, Claude rating join'lendi.
> Bu handoff: Codex'in 3 farklı persona ile media buyer agent'ı oluşturup IwaStore + TheSwaf'taki 75 creative üzerinde rating üretmesi.

---

## 1. Bağlam

Production'a Happy Harbor öncesi commit'e (96bd038) rollback yaptık. Snapshot içindeki üç ayrı karar sistemini ([Sistem 1 Legacy / Sistem 2 Operator / Sistem 3 V2 Preview](audit-G-three-systems/three-systems.json)) ve daha önce yaptığım Claude bağımsız multi-signal rating'i ([audit-F-iwastore-theswaf/claude-rating.json](audit-F-iwastore-theswaf/claude-rating.json)) elimde.

İlk dört rater için pair-wise uyum tablosu (n=75 creative, IwaStore + TheSwaf):

| Pair | Match | Agreement |
|---|---|---:|
| sys1 ↔ sys2 | 23/75 | 30.7% |
| sys1 ↔ sys3 | 2/75 | **2.7%** |
| sys1 ↔ claude | 9/75 | 12.0% |
| sys2 ↔ sys3 | 30/75 | 40.0% |
| sys2 ↔ claude | 15/75 | 20.0% |
| sys3 ↔ claude | 6/75 | 8.0% |
| **Quadruple agreement** | **0/75** | **0.0%** |

Üç sistem hiçbir creative'de ortak karar üretemiyor. Adsecute'un kendi içindeki tutarsızlığı net.

Şimdi 7. rater grubunu eklemek istiyoruz: **Codex'in 3 farklı media buyer persona'sını taşıyan agent'ları** — gerçek piyasada üç tipik media buyer disposition'ı. Bu üç bağımsız rater'ı ekleyince 7-rater agreement matrisini çıkarıp hangi sistemin/persona'nın sahaya en yakın karar verdiğini somut göreceğiz.

---

## 2. Senin (Codex'in) görevi — 3 farklı media buyer agent'ı oluştur

### Persona kuralları

Üç agent **birbirinden ve diğer rater'lardan bağımsız** karar versin. Her agent kendi disposition'ını uygular; aynı creative'i farklı yorumlayabilirler — bu istediğimiz şey.

**Agent A — "Aggressive Growth / Scaling-First"**
- Disposition: Büyüme odaklı, riski tolere eder. Mature winner'ları hızla scale eder.
- Eşikler:
  - Test winner: ROAS ≥ break-even × 1.1, purchases ≥ 4 (düşük kanıt eşiği)
  - Scale ready: spend ≥ peer median × 1.5 + purchases ≥ 6 (agresif scale eşiği)
  - Fatigue: recent7/long90 < 0.4 (geç fatigue çağrısı, refresh'i geciktirir)
  - Cut: ROAS < break-even × 0.5 + spend ≥ 300 (tutucu cut)
- Filozofi: "Bir winner tespit edilirse hızla scale, fatigue belirgin olmadıkça refresh erteleme."

**Agent B — "Conservative / Efficiency-First"**
- Disposition: Verimliliğe odaklanır, hızlı cut, daha az scale.
- Eşikler:
  - Test winner: ROAS ≥ break-even × 1.5, purchases ≥ 8, ctr_strength ≥ 1.0 (yüksek kanıt)
  - Scale ready: spend ≥ peer median × 3 + purchases ≥ 10 + recent stable
  - Fatigue: recent7/long90 < 0.7 (erken fatigue → refresh)
  - Cut: ROAS < break-even × 0.8 + spend ≥ 150 (agresif cut)
- Filozofi: "Şüphe varsa kes; winner kanıtı çok güçlü olmadıkça scale etme."

**Agent C — "Funnel / Creative-Quality-First"**
- Disposition: ROAS sonuçtur, asıl sinyal CTR + hook + click-to-purchase. Funnel breakdown'ı detaylı analiz eder.
- Eşikler:
  - Strong creative: ctr ≥ benchmark × 1.0 AND attention/hook ≥ benchmark × 0.85
  - Test winner: strong creative AND clickToPurchase ≥ benchmark × 0.9 AND ROAS ≥ break-even × 1.2
  - Cut: weak creative (ctr < benchmark × 0.7 AND hook < benchmark × 0.7) — ROAS marjinal olsa bile creative kaliteli değilse kes
  - Landing problem (yüksek CTR + düşük click-to-purchase): action = `keep_testing` (creative iyi, landing/offer sorunu)
  - Fatigue: roasDecay >= 0.3 OR ctrDecay >= 0.4 OR clickToPurchaseDecay >= 0.4 (multi-window compound)
- Filozofi: "Creative'in fiziksel kalitesi (hook + click-to-purchase) ROAS'tan daha öngörü taşır. ROAS sonuç, biz nedene bakıyoruz."

### Output şeması

Her agent için ayrı bir JSON dosyası, [audit-F-iwastore-theswaf/claude-rating.json](audit-F-iwastore-theswaf/claude-rating.json) ile aynı şema:

```json
{
  "generatedAt": "ISO timestamp",
  "rater": "Codex agent A — Aggressive Growth",
  "total": 75,
  "distributions": { "phase": {...}, "headline": {...}, "action": {...}, "readiness": {...} },
  "rows": [
    {
      "rowId": "IwaStore|creative_xyz",
      "business": "IwaStore",
      "creativeName": "...",
      "phase": "test|scale|post-scale",
      "headline": "Test Winner|Test Loser|Test Inconclusive|Scale Performer|Scale Underperformer|Scale Fatiguing|Needs Diagnosis",
      "action": "scale|test_more|protect|refresh|cut|diagnose",
      "actionReadiness": "ready|needs_review|blocked",
      "confidence": 0.0,
      "primaryReason": "1-2 cümle agent disposition'ına göre"
    }
  ]
}
```

**Önemli:** Action enum **`test_more`** kullan (Adsecute'un 3 sistemi ile uyumlu olsun); benim Claude rating'imdeki `keep_testing` ile aynı şey, normalize edeceğim.

### Dosya konumları

- `docs/team-comms/happy-harbor/audit-G-three-systems/codex-agent-a.json`
- `docs/team-comms/happy-harbor/audit-G-three-systems/codex-agent-b.json`
- `docs/team-comms/happy-harbor/audit-G-three-systems/codex-agent-c.json`
- Plus: `docs/team-comms/happy-harbor/audit-G-three-systems/codex-agents-notes.md` — 1-2 sayfa, her agent'ın kararlarında en çarpıcı 3 örneği belgele (örneğin "Agent A bu creative'i scale dedi çünkü..., Agent B aynı creative'i cut dedi çünkü...").

### Kritik kural

**Agent'lar birbirinin output'unu görmemeli.** Üçü de aynı raw input'tan (`audit-G-three-systems/three-systems.json`'daki her satır metric + benchmark + fatigue alanları) bağımsız rating üretsin. Adsecute'un üç sisteminin çıktısı (system1.action, system2.action, system3.action) input'tan **çıkarılmalı / maskeli olarak** verilmeli — agent'lar bunları görüp etkilenmesin.

Pratik yol: `three-systems.json`'dan `system1`, `system2`, `system3` alanlarını çıkararak `audit-G-three-systems/raw-input-for-agents.json` üret; üç agent bunu okusun.

### Nasıl çalıştır

Üç farklı approach mümkün, sen tercih et:

1. **Programatik deterministic rater** (Faz F'deki Claude rater'ım gibi): her persona'nın eşiklerini kodla yaz, `audit-G/codex-agent-{a,b,c}-rater.ts` script'leri üret, deterministic çalıştır. Tekrarlanabilirlik yüksek; ama agent'ın "düşünce" derinliği düşük (sadece eşikler).

2. **LLM agent çağrısı** (Anthropic API ile): üç farklı system prompt + same input. Claude API kullanarak (Claude Opus 4.7 önerilir) her satıra agent persona'sının yargısı ile karar ver.

3. **Hybrid:** kompleks ya da düşük confidence satırlar için LLM, kalan büyük çoğunluk için programatik kural.

(2) en zengin sonucu verir ama API çağrı maliyeti var. (1) hızlı ve ucuz. Sen hangisini seçersen seç, `codex-agents-notes.md`'de gerekçele.

---

## 3. Self-review checklist

- [ ] 3 agent JSON dosyası mevcut ([3 dosya])
- [ ] Her agent 75/75 rating üretmiş, schema tam
- [ ] Action enum birebir Adsecute ile aynı (`test_more` not `keep_testing`)
- [ ] Üç agent'ın action dağılımı **belirgin şekilde farklı** (eğer üçü aynı sonucu veriyorsa persona ayrımı çalışmamış)
- [ ] `codex-agents-notes.md` her agent için en az 3 örnek vakayla birlikte
- [ ] Agent'lar input olarak `system1.action / system2.action / system3.action` alanlarını **görmemiş** (raw-input-for-agents.json üretildi)
- [ ] `npm test` ve `npx tsc --noEmit` clean (yeni script eklendiyse)

---

## 4. Tetikleyici

Üç agent rating'i + notes commit edildiğinde "Codex ekibi tamamladı" dedirt. Ben final 7-rater agreement matrisini hesaplayıp tek tabloda kullanıcıya sunarım. Tablodan hangi sistemin / persona'nın sahaya en yakın olduğu net çıkacak.

— Claude ekibi
