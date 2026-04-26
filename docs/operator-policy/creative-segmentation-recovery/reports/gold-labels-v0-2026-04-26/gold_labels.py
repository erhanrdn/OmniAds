#!/usr/bin/env python3
"""
Adjudicated Creative Decision OS gold labels v0.

Inputs:
  - sanitized blind-review artifact
  - non-blind creative-audit artifact (only used for severity comparison)

Outputs:
  - gold-labels-v0.json (machine-readable)
  - per-row reasoning + actionability per supervisor's v2 contract
"""
import json
from collections import Counter, defaultdict

BLIND = "docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/blind-review.committed-artifact.json"
TRUTH = "docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/creative-audit.committed-artifact.json"

ALLOWED = ["Scale", "Cut", "Refresh", "Protect", "Test More", "Diagnose"]
ACTIONABILITY = ["direct", "review_only", "blocked", "diagnose"]
PROBLEM_CLASS = ["creative", "campaign-context", "data-quality", "insufficient-signal"]

ADSECUTE_MAP = {
    "Scale": "Scale", "Scale Review": "Scale",
    "Cut": "Cut",
    "Refresh": "Refresh",
    "Protect": "Protect", "Watch": "Protect",
    "Test More": "Test More", "Retest": "Test More",
    "Not Enough Data": "Diagnose", "Not eligible for evaluation": "Diagnose",
}


def rubric_decide(r):
    """Original blind rubric from PR #76 - kept verbatim as starting point."""
    spend = r["spend"] or 0.0
    purchases = r["purchases"] or 0
    impressions = r["impressions"] or 0
    roas = r["roas"] or 0.0
    rec_roas = r["recent_roas"] or 0.0
    rec_purchases = r["recent_purchases"] or 0
    rec_imps = r["recent_impressions"] or 0
    long90 = r["long90_roas"] or 0.0
    bench_roas = r["active_benchmark_roas"] or 0.0
    peer_med_spend = r["peer_median_spend"] or 0.0
    active = r["active_status"]
    camp_status = r["campaign_status"]
    adset_status = r["adset_status"]

    bench_r = (roas / bench_roas) if bench_roas > 0 else None
    bench_recent = (rec_roas / bench_roas) if bench_roas > 0 else None
    trend = (rec_roas / roas) if roas > 0 else None
    spend_vs_peer = (spend / peer_med_spend) if peer_med_spend > 0 else None

    if not active or camp_status == "PAUSED" or adset_status in ("CAMPAIGN_PAUSED",):
        if spend >= 200 and bench_r is not None and bench_r < 0.6:
            return "Cut"
        if spend >= 150 and long90 >= bench_roas * 0.95 and bench_r is not None and bench_r >= 0.8:
            return "Refresh"
        if spend >= 150 and bench_r is not None and bench_r >= 1.1 and long90 >= bench_roas:
            return "Diagnose"
        if spend < 100 or purchases < 3:
            return "Diagnose"
        return "Cut"

    floor_spend = max(75.0, peer_med_spend * 0.4 if peer_med_spend else 75.0)
    if spend < floor_spend or purchases < 3:
        if rec_imps < 5000 and rec_purchases == 0:
            return "Diagnose"
        return "Test More"

    if bench_r is None:
        return "Diagnose"

    if bench_r < 0.5 and spend >= 1.5 * peer_med_spend and purchases >= 5:
        if long90 < bench_roas * 0.7:
            return "Cut"
        return "Refresh"

    if bench_r >= 0.85 and bench_recent is not None and bench_recent < 0.6 and rec_purchases >= 1:
        return "Refresh"

    if bench_r >= 1.25 and long90 >= bench_roas * 1.05:
        if trend is not None and trend >= 0.95 and rec_purchases >= 5 and spend_vs_peer is not None and spend_vs_peer >= 2.0:
            return "Scale"
        return "Protect"

    if bench_r >= 1.15 and spend_vs_peer is not None and spend_vs_peer < 2.0 and rec_purchases >= 2:
        return "Test More"

    if bench_r < 0.85 and spend >= peer_med_spend:
        if bench_recent is not None and bench_recent >= 1.0 and rec_purchases >= 3:
            return "Test More"
        return "Refresh"

    if 0.85 <= bench_r < 1.25:
        if trend is not None and trend < 0.6 and rec_purchases >= 2:
            return "Refresh"
        if spend_vs_peer is not None and spend_vs_peer < 1.0:
            return "Test More"
        return "Protect"

    return "Diagnose"


def adjudicate(r):
    """
    Buyer adjudication that overrides the rubric where it self-admitted misses
    or where supervisor structural rules require correction.

    Returns:
      decision, actionability, confidence, rationale, problem_class, change_reason_or_None
    """
    spend = r["spend"] or 0.0
    purchases = r["purchases"] or 0
    roas = r["roas"] or 0.0
    rec_roas = r["recent_roas"] or 0.0
    rec_purchases = r["recent_purchases"] or 0
    rec_imps = r["recent_impressions"] or 0
    long90 = r["long90_roas"] or 0.0
    bench_roas = r["active_benchmark_roas"] or 0.0
    peer_med_spend = r["peer_median_spend"] or 0.0
    active = r["active_status"]
    camp_status = r["campaign_status"]
    adset_status = r["adset_status"]
    trust = r["source_provenance_flags"]["trustState"]
    base_rel = r["source_provenance_flags"]["baselineReliability"]
    compat = r["context_flags"].get("deploymentCompatibility")
    truth_pack = r["context_flags"].get("commercialTruthTargetPackConfigured", False)

    inactive = (not active) or camp_status == "PAUSED" or adset_status == "CAMPAIGN_PAUSED"
    bench_r = (roas / bench_roas) if bench_roas > 0 else None
    bench_recent = (rec_roas / bench_roas) if bench_roas > 0 else None
    trend = (rec_roas / roas) if roas > 0 else None
    spend_vs_peer = (spend / peer_med_spend) if peer_med_spend > 0 else None

    rubric = rubric_decide(r)
    change_reason = None

    # === STRUCTURAL RULE 1: inactive creative cannot be direct Scale. Cap to Refresh/Diagnose/Cut.
    if inactive:
        was_great = bench_roas > 0 and long90 >= bench_roas * 1.2
        was_strong = bench_roas > 0 and long90 >= bench_roas * 0.9
        recent_holding = bench_recent is not None and bench_recent >= 0.85 and rec_purchases >= 2
        # Severe loser, paused for cause -> Cut, direct.
        if spend >= 200 and bench_r is not None and bench_r < 0.55 and not was_strong:
            decision, action, conf = "Cut", "direct", 90
            rationale = "Paused with material spend at <55% of benchmark and no historical strength - confirm permanent kill."
            problem = "creative"
            return decision, action, conf, rationale, problem, change_reason
        # Historical big winner that was killed -> Diagnose why.
        if was_great and spend >= 200:
            decision, action, conf = "Diagnose", "diagnose", 85
            rationale = "Paused but long-90 ROAS materially above benchmark - investigate cause (account/policy/exhausted audience) before declaring next move."
            problem = "campaign-context"
            if rubric == "Refresh":
                change_reason = "Rubric chose Refresh; gold prefers Diagnose first because long-90 is well above benchmark - buyer needs to know WHY before relaunching."
            elif rubric != decision:
                change_reason = f"Rubric chose {rubric}; gold prefers Diagnose to surface the campaign/status question."
            return decision, action, conf, rationale, problem, change_reason
        # Lifetime near-or-above benchmark OR recent holding -> Refresh.
        if (was_strong or recent_holding or (bench_r is not None and bench_r >= 0.85)) and spend >= 150:
            decision, action, conf = "Refresh", "review_only", 75
            rationale = "Paused but long-90 or recent ROAS shows the creative was viable - relaunch with a refreshed variant."
            problem = "creative"
            if rubric == "Cut":
                change_reason = "Rubric chose Cut; gold pivots to Refresh - long-90 within 0.9x of benchmark or recent ROAS holding >=0.85x with conversions argues for variant relaunch over permanent kill."
            elif rubric != decision:
                change_reason = f"Rubric chose {rubric}; gold prefers Refresh given remaining viability signal."
            return decision, action, conf, rationale, problem, change_reason
        # Mid-tier paused with some signal but no strength -> Cut.
        if spend >= 200 and bench_r is not None and bench_r < 0.85:
            decision, action, conf = "Cut", "direct", 75
            rationale = "Paused, lifetime ROAS below benchmark, no historical strength, no recent recovery - accept the kill."
            problem = "creative"
            return decision, action, conf, rationale, problem, change_reason
        # Thin paused -> Diagnose.
        if spend < 150 or purchases < 3:
            decision, action, conf = "Diagnose", "diagnose", 60
            rationale = "Paused with insufficient spend/conversions - cannot judge from data alone."
            problem = "insufficient-signal"
            return decision, action, conf, rationale, problem, change_reason
        # Default paused -> Cut.
        decision, action, conf = "Cut", "direct", 65
        rationale = "Paused; no remaining viability signal to justify reactivation."
        problem = "creative"
        return decision, action, conf, rationale, problem, change_reason

    # === ACTIVE PATH ===

    # 2. Insufficient spend / signal.
    floor_spend = max(75.0, (peer_med_spend * 0.4) if peer_med_spend else 75.0)
    if spend < floor_spend or purchases < 3:
        if rec_imps < 5000 and rec_purchases == 0:
            decision, action, conf = "Diagnose", "diagnose", 70
            rationale = "Negligible recent delivery and no recent conversions - too thin to read."
            problem = "insufficient-signal"
            return decision, action, conf, rationale, problem, change_reason
        decision, action, conf = "Test More", "direct", 70
        rationale = "Below peer-median spend with sparse purchases - give more delivery before judging."
        problem = "insufficient-signal"
        return decision, action, conf, rationale, problem, change_reason

    if bench_r is None:
        decision, action, conf = "Diagnose", "diagnose", 50
        rationale = "No benchmark available."
        problem = "data-quality"
        return decision, action, conf, rationale, problem, change_reason

    # 3. ADJUDICATED HUGE-SPEND SEVERE LOSER -> Cut, direct (rubric Test More miss).
    huge_loss = spend >= 4000 and bench_r < 0.4 and (rec_purchases <= 1 or rec_roas < bench_roas * 0.4)
    if huge_loss:
        decision, action, conf = "Cut", "direct", 95
        rationale = "Active creative with $4K+ spend and <40% of benchmark ROAS, no recovery in recent window - direct cut."
        problem = "creative"
        if rubric == "Test More":
            change_reason = "Rubric Test More was wrong on huge-spend zero-recovery losers - buyer override per supervisor adjudication mandate."
        elif rubric == "Diagnose":
            change_reason = "Rubric Diagnose was too soft - at $4K+ spend with sub-40% ROAS no diagnosis is needed; cut."
        elif rubric != decision:
            change_reason = f"Rubric chose {rubric}; gold confirms Cut."
        return decision, action, conf, rationale, problem, change_reason

    # 4. ADJUDICATED TEXTBOOK SCALE - clear, sustained, high-confidence.
    # Two paths: (a) very-strong-signal scale even at peer-median spend, (b) standard scale at well-above-peer spend.
    very_strong_scale = (
        bench_r >= 3.0 and
        long90 >= bench_roas * 1.5 and
        rec_purchases >= 5 and
        spend_vs_peer is not None and spend_vs_peer >= 1.0 and
        trend is not None and trend >= 0.85
    )
    standard_scale = (
        bench_r >= 1.5 and
        long90 >= bench_roas * 1.05 and
        rec_purchases >= 5 and
        spend_vs_peer is not None and spend_vs_peer >= 2.0 and
        trend is not None and trend >= 0.95
    )
    textbook_scale = very_strong_scale or standard_scale
    if textbook_scale:
        # Per supervisor: Scale on active high-confidence - but use review_only actionability
        # to keep queue/apply safety conservative until v2 enforces it.
        decision, action, conf = "Scale", "review_only", 90
        rationale = "Sustained ROAS >2.5x benchmark, long-90 well above benchmark, healthy recent purchases, spend already above peer median, trend stable or improving - push budget under review."
        problem = "creative"
        if rubric == "Protect":
            change_reason = "Rubric labeled Protect because long-90 gate was the only blocker; buyer override - this is the textbook Scale shape and the rubric admitted the miss."
        elif rubric != decision:
            change_reason = f"Rubric chose {rubric}; gold escalates to Scale (review_only)."
        return decision, action, conf, rationale, problem, change_reason

    # 5. Severe loser, material spend (between huge-spend and just-bad).
    if bench_r < 0.5 and spend >= max(1.5 * peer_med_spend, 500) and purchases >= 5:
        if long90 < bench_roas * 0.7:
            decision, action, conf = "Cut", "direct", 85
            rationale = "Material spend, ROAS less than half benchmark, no historical strength - cut."
            problem = "creative"
            return decision, action, conf, rationale, problem, change_reason
        decision, action, conf = "Refresh", "review_only", 70
        rationale = "Material spend at <50% benchmark but historical strength exists - replace variant first."
        problem = "creative"
        return decision, action, conf, rationale, problem, change_reason

    # 6. Lifetime-strong, recent-decay (the explicit cluster from supervisor).
    if bench_r >= 0.95 and bench_recent is not None and bench_recent < 0.55 and rec_purchases >= 1:
        decision, action, conf = "Refresh", "review_only", 80
        rationale = "Lifetime at-or-above benchmark but recent ROAS collapsed below 55% of benchmark with active conversions - creative fatigue, refresh required."
        problem = "creative"
        if rubric == "Protect":
            change_reason = "Rubric chose Protect; gold overrides - explicit fatigue pattern (recent < 0.55x bench with conversions) requires Refresh, not hold."
        return decision, action, conf, rationale, problem, change_reason

    # 7. Sustained winner - Protect, or Test More if recent trend explosion needs verification.
    if bench_r >= 1.25 and long90 >= bench_roas * 1.05:
        # Emergent surge with low recent volume - verify before scaling.
        if (trend is not None and trend >= 1.5 and rec_purchases < 5
                and spend_vs_peer is not None and spend_vs_peer < 2.0):
            decision, action, conf = "Test More", "direct", 70
            rationale = "Above-benchmark with explosive recent trend but low recent volume - give more delivery to verify the surge before scaling."
            problem = "creative"
            if rubric == "Protect":
                change_reason = "Rubric chose Protect; gold pivots to Test More because recent trend ratio >=1.5x with <5 recent purchases is too thin to commit to scale but too strong to ignore."
            return decision, action, conf, rationale, problem, change_reason
        decision, action, conf = "Protect", "direct", 80
        rationale = "Sustained above-benchmark winner - hold and avoid disturbance."
        problem = "creative"
        if rubric != decision:
            change_reason = f"Rubric chose {rubric}; gold holds - sustained above-benchmark winner with no scalable urgency."
        return decision, action, conf, rationale, problem, change_reason

    # 8. Promising emergent - Test More.
    if bench_r >= 1.15 and spend_vs_peer is not None and spend_vs_peer < 2.0 and rec_purchases >= 2:
        decision, action, conf = "Test More", "direct", 75
        rationale = "Above-benchmark ROAS but spend still moderate - give it more delivery before scaling."
        problem = "creative"
        return decision, action, conf, rationale, problem, change_reason

    # 9. Active creative with material recent conversions but below benchmark - Refresh first.
    if bench_r < 0.85 and spend >= peer_med_spend and rec_purchases >= 3:
        if bench_recent is not None and bench_recent >= 1.0:
            decision, action, conf = "Test More", "direct", 65
            rationale = "Lifetime drag but recent ROAS recovering with active conversions - give limited runway."
            problem = "creative"
            if rubric != decision:
                change_reason = f"Rubric chose {rubric}; gold prefers Test More because recent ROAS at-or-above benchmark with material conversions warrants runway over intervention."
            return decision, action, conf, rationale, problem, change_reason
        decision, action, conf = "Refresh", "review_only", 70
        rationale = "Below-benchmark with material conversions still flowing - refresh before cut (supervisor rule 7)."
        problem = "creative"
        if rubric != decision:
            change_reason = f"Rubric chose {rubric}; gold applies supervisor rule 7 - material conversion volume below benchmark refreshes before it cuts."
        return decision, action, conf, rationale, problem, change_reason

    # 10. Below-benchmark, low recent conversions, material spend -> Cut.
    if bench_r < 0.6 and spend >= max(peer_med_spend, 300) and rec_purchases <= 1:
        decision, action, conf = "Cut", "direct", 80
        rationale = "Active, below 60% of benchmark, material spend, <=1 recent conversion - sustained loss with no recovery -> cut."
        problem = "creative"
        if rubric != decision:
            change_reason = f"Rubric chose {rubric}; gold cuts because material spend at sub-60% benchmark with thin recent conversions = sustained loss."
        return decision, action, conf, rationale, problem, change_reason

    # 11. Around-benchmark.
    if 0.85 <= bench_r < 1.25:
        if trend is not None and trend < 0.55 and rec_purchases >= 2:
            decision, action, conf = "Refresh", "review_only", 70
            rationale = "At-benchmark lifetime but recent decay (trend <0.55x) - fatigue refresh."
            problem = "creative"
            if rubric != decision:
                change_reason = f"Rubric chose {rubric}; gold applies fatigue refresh."
            return decision, action, conf, rationale, problem, change_reason
        if spend_vs_peer is not None and spend_vs_peer < 1.0:
            decision, action, conf = "Test More", "direct", 65
            rationale = "On-benchmark performer with sub-peer spend - give more delivery."
            problem = "creative"
            if rubric != decision:
                change_reason = f"Rubric chose {rubric}; gold extends runway."
            return decision, action, conf, rationale, problem, change_reason
        decision, action, conf = "Protect", "direct", 65
        rationale = "On-benchmark performer at peer spend - hold."
        problem = "creative"
        if rubric != decision:
            change_reason = f"Rubric chose {rubric}; gold holds an on-benchmark performer."
        return decision, action, conf, rationale, problem, change_reason

    # 12. Moderate underperformer fallback.
    if bench_r < 0.85 and spend >= peer_med_spend:
        decision, action, conf = "Refresh", "review_only", 65
        rationale = "Moderate underperformance with peer-level spend - refresh creative variant."
        problem = "creative"
        return decision, action, conf, rationale, problem, change_reason

    # 13. Default fallback.
    decision, action, conf = "Diagnose", "diagnose", 50
    rationale = "Mixed signals - needs human / business context to label confidently."
    problem = "data-quality"
    return decision, action, conf, rationale, problem, change_reason


def severity(gold, ads):
    if gold == ads:
        return None
    pair = frozenset([gold, ads])
    if pair == frozenset(["Scale", "Cut"]):
        return "severe"
    if pair in (
        frozenset(["Scale", "Refresh"]),
        frozenset(["Cut", "Protect"]),
        frozenset(["Cut", "Refresh"]),
        frozenset(["Scale", "Protect"]),
    ):
        return "high"
    if pair in (
        frozenset(["Refresh", "Test More"]),
        frozenset(["Cut", "Diagnose"]),
        frozenset(["Cut", "Test More"]),
        frozenset(["Refresh", "Protect"]),
        frozenset(["Scale", "Test More"]),
    ):
        return "medium"
    return "low"


def main():
    blind = json.load(open(BLIND))
    truth = json.load(open(TRUTH))
    truth_map = {r["row_id"]: r for r in truth["rows"]}

    rows = []
    for r in blind["rows"]:
        rubric = rubric_decide(r)
        decision, action, conf, rationale, problem, change_reason = adjudicate(r)
        t = truth_map[r["row_id"]]
        ads_raw = t["current_primary_decision_shown_to_operator"]
        ads_mapped = ADSECUTE_MAP.get(ads_raw, ads_raw)
        sev = severity(decision, ads_mapped)
        rows.append({
            "row_id": r["row_id"],
            "company_identifier": r["company_identifier"],
            "campaign_identifier": r["campaign_identifier"],
            "creative_identifier": r["creative_identifier"],
            "active_status": r["active_status"],
            "campaign_status": r["campaign_status"],
            "adset_status": r["adset_status"],
            "spend": r["spend"],
            "roas": r["roas"],
            "recent_roas": r["recent_roas"],
            "recent_purchases": r["recent_purchases"],
            "long90_roas": r["long90_roas"],
            "active_benchmark_roas": r["active_benchmark_roas"],
            "peer_median_spend": r["peer_median_spend"],
            "trust_state": r["source_provenance_flags"]["trustState"],
            "baseline_reliability": r["source_provenance_flags"]["baselineReliability"],
            "rubric_blind_decision": rubric,
            "adjudicated_primary_decision": decision,
            "actionability": action,
            "confidence": conf,
            "buyer_rationale": rationale,
            "problem_class": problem,
            "differs_from_blind_rubric": rubric != decision,
            "change_reason": change_reason,
            "current_adsecute_decision_raw": ads_raw,
            "current_adsecute_decision_mapped": ads_mapped,
            "current_adsecute_internal_segment": t.get("current_internal_segment"),
            "current_adsecute_recommended_action": t.get("recommended_action"),
            "severity_vs_adsecute": sev,
        })

    # Distributions
    gold_dist = Counter(r["adjudicated_primary_decision"] for r in rows)
    ads_dist = Counter(r["current_adsecute_decision_mapped"] for r in rows)

    print("=== Final gold distribution ===")
    for d in ALLOWED:
        print(f"  {d:10s}: {gold_dist[d]}")
    print()
    print("=== Adsecute (mapped) distribution ===")
    for d in ALLOWED:
        print(f"  {d:10s}: {ads_dist[d]}")
    print()

    # Confusion matrix: rows=gold, cols=adsecute
    cm = defaultdict(lambda: Counter())
    for r in rows:
        cm[r["adjudicated_primary_decision"]][r["current_adsecute_decision_mapped"]] += 1
    print("=== Confusion matrix (rows=GOLD, cols=ADSECUTE) ===")
    print("gold\\ads".ljust(14), "  ".join(d[:9].ljust(9) for d in ALLOWED), "  total")
    for g in ALLOWED:
        row = cm[g]
        total = sum(row.values())
        print(g.ljust(14), "  ".join(str(row[d]).ljust(9) for d in ALLOWED), " ", total)
    col_total = Counter()
    for g in ALLOWED:
        for d in ALLOWED:
            col_total[d] += cm[g][d]
    print("TOTAL".ljust(14), "  ".join(str(col_total[d]).ljust(9) for d in ALLOWED))
    print()

    # Severity buckets
    sev_counter = Counter(r["severity_vs_adsecute"] for r in rows if r["severity_vs_adsecute"])
    print("=== Severity vs current Adsecute ===")
    for k in ("severe", "high", "medium", "low"):
        print(f"  {k}: {sev_counter[k]}")
    print()

    # Per-decision precision/recall (gold as truth, current adsecute as candidate)
    print("=== Per-decision precision/recall (current Adsecute scored against GOLD) ===")
    f1s = []
    for d in ALLOWED:
        tp = sum(1 for r in rows if r["current_adsecute_decision_mapped"] == d and r["adjudicated_primary_decision"] == d)
        fp = sum(1 for r in rows if r["current_adsecute_decision_mapped"] == d and r["adjudicated_primary_decision"] != d)
        fn = sum(1 for r in rows if r["current_adsecute_decision_mapped"] != d and r["adjudicated_primary_decision"] == d)
        prec = (tp / (tp + fp) * 100) if (tp + fp) else 0
        rec = (tp / (tp + fn) * 100) if (tp + fn) else 0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0
        f1s.append(f1)
        print(f"  {d:10s}  tp={tp:2d} fp={fp:2d} fn={fn:2d}  prec={prec:5.1f}  rec={rec:5.1f}  f1={f1:5.1f}")
    macro = sum(f1s) / len(f1s)
    print(f"\nMacro F1 (current Adsecute vs gold v0): {macro:.1f}")

    # Mismatches at each level
    print("\n=== Severe mismatches (Scale<->Cut) ===")
    for r in rows:
        if r["severity_vs_adsecute"] == "severe":
            print(f"  gold={r['adjudicated_primary_decision']} ads={r['current_adsecute_decision_raw']} {r['row_id']}")

    print("\n=== High mismatches ===")
    for r in rows:
        if r["severity_vs_adsecute"] == "high":
            print(f"  gold={r['adjudicated_primary_decision']:8s} ads={r['current_adsecute_decision_raw']:18s} spend={r['spend']:.0f} roas={r['roas']:.2f} rec={r['recent_roas']:.2f} bench={r['active_benchmark_roas']:.2f} long90={r['long90_roas']:.2f} pur={r['recent_purchases']} active={r['active_status']} {r['row_id']}")

    # Rows differing from blind rubric (adjudication overrides)
    print("\n=== Rows where gold differs from blind rubric ===")
    diff_rows = [r for r in rows if r["differs_from_blind_rubric"]]
    print(f"Total overrides: {len(diff_rows)}")
    for r in diff_rows:
        print(f"  {r['rubric_blind_decision']:8s} -> {r['adjudicated_primary_decision']:8s} | {r['change_reason']} | {r['row_id']}")

    # Rows needing human/business context (Diagnose with no benchmark / with structural concern)
    print("\n=== Rows flagged as needing human/business context ===")
    human_needed = [r for r in rows if r["adjudicated_primary_decision"] == "Diagnose" and r["problem_class"] in ("campaign-context", "data-quality")]
    for r in human_needed:
        print(f"  {r['row_id']} - {r['buyer_rationale']}")

    # Compose JSON output
    out = {
        "generated_at": "2026-04-26",
        "version": "gold-v0",
        "source_blind_artifact": "review/creative-reset-evidence-pack-2026-04-25:docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/blind-review.committed-artifact.json",
        "blind_review_pr": "PR #76 (review/creative-claude-blind-media-buyer-2026-04-25)",
        "evidence_pack_pr": "PR #75 (review/creative-reset-evidence-pack-2026-04-25)",
        "is_product_ready": False,
        "is_accepted": False,
        "allowed_primary_decisions": ALLOWED,
        "allowed_actionability": ACTIONABILITY,
        "problem_classes": PROBLEM_CLASS,
        "row_count": len(rows),
        "summary": {
            "gold_distribution": dict(gold_dist),
            "adsecute_distribution_mapped": dict(ads_dist),
            "severity_counts_vs_current_adsecute": dict(sev_counter),
            "macro_f1_current_adsecute_vs_gold": round(macro, 2),
            "overrides_from_blind_rubric": len(diff_rows),
        },
        "rows": rows,
    }
    out_path = "docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json"
    import os
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, default=str, ensure_ascii=True)  # ensure_ascii prevents bidi/unicode sneak-in
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
