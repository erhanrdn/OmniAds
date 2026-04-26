#!/usr/bin/env python3
"""
Independent Meta media-buyer blind judge.
Inputs:
  - blind-review.committed-artifact.json (sanitized, no Adsecute labels)
Outputs:
  - blind labels per row
  - confusion matrix vs Adsecute labels (from creative-audit artifact)
  - severity-tagged mismatch list
"""
import json
from collections import Counter, defaultdict

BLIND = "docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/blind-review.committed-artifact.json"
TRUTH = "docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/creative-audit.committed-artifact.json"

ALLOWED = ["Scale", "Cut", "Refresh", "Protect", "Test More", "Diagnose"]

# Map Adsecute output -> our allowed set
ADSECUTE_MAP = {
    "Scale": "Scale",
    "Scale Review": "Scale",
    "Cut": "Cut",
    "Refresh": "Refresh",
    "Protect": "Protect",
    "Watch": "Protect",
    "Test More": "Test More",
    "Retest": "Test More",
    "Not Enough Data": "Diagnose",
    "Not eligible for evaluation": "Diagnose",
}


def buyer_decide(r):
    """Apply a deterministic Meta media-buyer decision rubric using ONLY
    fields available in the blind export."""
    spend = r["spend"] or 0.0
    purchases = r["purchases"] or 0
    impressions = r["impressions"] or 0
    roas = r["roas"] or 0.0
    cpa = r["cpa"] or 0.0
    rec_roas = r["recent_roas"] or 0.0
    rec_cpa = r["recent_cpa"] or 0.0
    rec_purchases = r["recent_purchases"] or 0
    rec_imps = r["recent_impressions"] or 0
    long90 = r["long90_roas"] or 0.0
    bench_roas = r["active_benchmark_roas"] or 0.0
    bench_cpa = r["active_benchmark_cpa"] or 0.0
    peer_med_spend = r["peer_median_spend"] or 0.0
    base_rel = r["source_provenance_flags"]["baselineReliability"]
    trust = r["source_provenance_flags"]["trustState"]
    active = r["active_status"]
    camp_status = r["campaign_status"]
    adset_status = r["adset_status"]
    lane = r["context_flags"].get("deploymentTargetLane")
    compat = r["context_flags"].get("deploymentCompatibility")

    # Helper ratios
    bench_r = (roas / bench_roas) if bench_roas > 0 else None
    bench_recent = (rec_roas / bench_roas) if bench_roas > 0 else None
    trend = (rec_roas / roas) if roas > 0 else None
    spend_vs_peer = (spend / peer_med_spend) if peer_med_spend > 0 else None

    notes = []

    # 1. Inactive / paused creative — buyer's decision is a confirmation lens.
    if not active or camp_status == "PAUSED" or adset_status in ("CAMPAIGN_PAUSED",):
        # Clear loser, material spend → Cut (confirm kill).
        if spend >= 200 and bench_r is not None and bench_r < 0.6:
            return ("Cut", 85, "Refresh",
                    "Paused creative with material spend at <60% of benchmark ROAS — confirm kill.",
                    "creative")
        # Was a winner long-term, recently faded → Refresh, not Cut.
        if spend >= 150 and long90 >= bench_roas * 0.95 and bench_r is not None and bench_r >= 0.8:
            return ("Refresh", 70, "Cut",
                    "Paused creative with long-90 at-or-above benchmark — relaunch with new variant.",
                    "creative")
        # Paused historical winner that is still strong → Diagnose why killed.
        if spend >= 150 and bench_r is not None and bench_r >= 1.1 and long90 >= bench_roas:
            return ("Diagnose", 65, "Protect",
                    "Paused creative still above benchmark — investigate why it was stopped.",
                    "campaign/context")
        # Low-spend paused → no signal.
        if spend < 100 or purchases < 3:
            return ("Diagnose", 60, "Cut",
                    "Paused creative with insufficient spend/conversions to judge.",
                    "insufficient-data")
        # Otherwise: paused, mediocre signal, no historical strength → Cut.
        return ("Cut", 65, "Refresh",
                "Paused creative; lifetime metrics do not justify reactivation.",
                "creative")

    # 2. Active creative path — decide using maturity and trend
    # 2a. Insufficient spend / signal
    floor_spend = max(75.0, peer_med_spend * 0.4 if peer_med_spend else 75.0)
    if spend < floor_spend or purchases < 3:
        # Recent activity meaningful?
        if rec_imps < 5000 and rec_purchases == 0:
            return ("Diagnose", 70, "Test More",
                    "Negligible recent delivery and no recent conversions — too thin to evaluate.",
                    "insufficient-data")
        return ("Test More", 70, "Diagnose",
                "Below peer-median spend with sparse purchases — needs more impressions to read.",
                "insufficient-data")

    # 2b. Material spend present — read benchmark performance + trend
    if bench_r is None:
        return ("Diagnose", 55, "Test More",
                "No benchmark available to compare against.",
                "insufficient-data")

    # Severe loser with material spend → Cut
    if bench_r < 0.5 and spend >= 1.5 * peer_med_spend and purchases >= 5:
        # Was it ever good? long90 vs benchmark
        if long90 < bench_roas * 0.7:
            return ("Cut", 90, "Refresh",
                    "Material spend, ROAS less than half benchmark, no historical strength — kill.",
                    "creative")
        else:
            return ("Refresh", 70, "Cut",
                    "Spend wasted at well-below benchmark ROAS but had historical strength — replace variant.",
                    "creative")

    # Decay pattern: previously decent, recent crater
    if bench_r >= 0.85 and bench_recent is not None and bench_recent < 0.6 and rec_purchases >= 1:
        return ("Refresh", 80, "Cut",
                "Lifetime at-or-above benchmark but recent ROAS collapsed — fatigue, refresh creative.",
                "creative")

    # Strong sustained winner with high spend → Protect (don't poke) or Scale (push more)
    if bench_r >= 1.25 and long90 >= bench_roas * 1.05:
        # Trend positive and lots of recent volume → Scale
        if trend is not None and trend >= 0.95 and rec_purchases >= 5 and spend_vs_peer is not None and spend_vs_peer >= 2.0:
            return ("Scale", 85, "Protect",
                    "Sustained above-benchmark ROAS, healthy recent trend, already heavy spender — push budget.",
                    "creative")
        return ("Protect", 80, "Scale",
                "Sustained winner above benchmark — hold and avoid disturbance.",
                "creative")

    # Promising emergent winner with limited spend
    if bench_r >= 1.15 and spend_vs_peer is not None and spend_vs_peer < 2.0 and rec_purchases >= 2:
        return ("Test More", 75, "Scale",
                "Above-benchmark ROAS but spend still moderate — give it more delivery before scaling.",
                "creative")

    # Moderate underperformer (between 0.5 and 0.85 of benchmark) with material spend
    if bench_r < 0.85 and spend >= peer_med_spend:
        # Is recent improving?
        if bench_recent is not None and bench_recent >= 1.0 and rec_purchases >= 3:
            return ("Test More", 65, "Refresh",
                    "Lifetime drag but recent ROAS recovering — give limited runway.",
                    "creative")
        return ("Refresh", 70, "Cut",
                "Spend at peer level, ROAS materially below benchmark — replace variant.",
                "creative")

    # Around-benchmark performer
    if 0.85 <= bench_r < 1.25:
        if trend is not None and trend < 0.6 and rec_purchases >= 2:
            return ("Refresh", 70, "Test More",
                    "At-benchmark lifetime but recent decay — fatigue refresh.",
                    "creative")
        if spend_vs_peer is not None and spend_vs_peer < 1.0:
            return ("Test More", 65, "Protect",
                    "On-benchmark performer with sub-peer spend — give more delivery.",
                    "creative")
        return ("Protect", 65, "Test More",
                "On-benchmark performer at peer spend — hold, monitor.",
                "creative")

    # Default fallback
    return ("Diagnose", 50, "Test More",
            "Mixed signals — needs human review.",
            "insufficient-data")


def severity(blind, truth):
    """Severity of mismatch from a buyer's perspective."""
    if blind == truth:
        return None
    pair = frozenset([blind, truth])
    # Severe: opposite-direction money decisions
    if pair in (frozenset(["Scale", "Cut"]),):
        return "severe"
    # High: budget-direction errors that move real money wrongly
    if pair in (
        frozenset(["Scale", "Refresh"]),
        frozenset(["Cut", "Protect"]),
        frozenset(["Cut", "Refresh"]),
        frozenset(["Scale", "Protect"]) ,  # buyer says push, system says hold — material miss
    ):
        return "high"
    # Medium: same lane but different intervention
    if pair in (
        frozenset(["Refresh", "Test More"]),
        frozenset(["Cut", "Diagnose"]),
        frozenset(["Cut", "Test More"]),
        frozenset(["Refresh", "Protect"]),
        frozenset(["Scale", "Test More"]),
    ):
        return "medium"
    # Low: pause-and-reflect vs gentle action
    return "low"


def main():
    blind = json.load(open(BLIND))
    truth = json.load(open(TRUTH))
    truth_map = {r["row_id"]: r for r in truth["rows"]}

    results = []
    for r in blind["rows"]:
        decision, conf, alt, rationale, prob_class = buyer_decide(r)
        t = truth_map[r["row_id"]]
        adsecute_raw = t["current_primary_decision_shown_to_operator"]
        adsecute_mapped = ADSECUTE_MAP.get(adsecute_raw, adsecute_raw)
        sev = severity(decision, adsecute_mapped)
        results.append({
            "row_id": r["row_id"],
            "blind_decision": decision,
            "confidence": conf,
            "alt": alt,
            "rationale": rationale,
            "problem_class": prob_class,
            "adsecute_raw": adsecute_raw,
            "adsecute_mapped": adsecute_mapped,
            "match": decision == adsecute_mapped,
            "severity": sev,
            # Carry context for spot examples
            "spend": r["spend"],
            "roas": r["roas"],
            "recent_roas": r["recent_roas"],
            "recent_purchases": r["recent_purchases"],
            "bench_roas": r["active_benchmark_roas"],
            "long90": r["long90_roas"],
            "trust": r["source_provenance_flags"]["trustState"],
            "active": r["active_status"],
            "campaign_status": r["campaign_status"],
            "adset_status": r["adset_status"],
            "internal_segment": t.get("current_internal_segment"),
            "recommended_action": t.get("recommended_action"),
            "company": r["company_identifier"],
        })

    # Confusion matrix (rows=blind, cols=adsecute_mapped)
    cm = defaultdict(lambda: Counter())
    for x in results:
        cm[x["blind_decision"]][x["adsecute_mapped"]] += 1

    labels = sorted(set(ALLOWED) | set(x["adsecute_mapped"] for x in results))
    print("\n=== Confusion matrix (rows=BLIND, cols=ADSECUTE) ===")
    print("blind\\ads".ljust(14), "  ".join(l[:9].ljust(9) for l in labels), "  total")
    for b in ALLOWED:
        row = cm[b]
        total = sum(row.values())
        print(b.ljust(14), "  ".join(str(row[l]).ljust(9) for l in labels), " ", total)
    col_total = Counter()
    for b in ALLOWED:
        for l in labels:
            col_total[l] += cm[b][l]
    print("TOTAL".ljust(14), "  ".join(str(col_total[l]).ljust(9) for l in labels))

    # Raw accuracy
    total = len(results)
    matches = sum(1 for x in results if x["match"])
    print(f"\nRaw accuracy: {matches}/{total} = {100*matches/total:.1f}%")

    # Per-class precision/recall (treating Adsecute as truth)
    print("\n=== Per-decision precision / recall (Adsecute as truth) ===")
    f1s = []
    for d in ALLOWED:
        tp = sum(1 for x in results if x["blind_decision"] == d and x["adsecute_mapped"] == d)
        fp = sum(1 for x in results if x["blind_decision"] == d and x["adsecute_mapped"] != d)
        fn = sum(1 for x in results if x["blind_decision"] != d and x["adsecute_mapped"] == d)
        prec = (tp/(tp+fp)*100) if (tp+fp) else 0
        rec = (tp/(tp+fn)*100) if (tp+fn) else 0
        f1 = (2*prec*rec/(prec+rec)) if (prec+rec) else 0
        f1s.append(f1)
        print(f"  {d:10s}  tp={tp:2d} fp={fp:2d} fn={fn:2d}  prec={prec:5.1f}  rec={rec:5.1f}  f1={f1:5.1f}")

    macro_f1 = sum(f1s)/len(f1s)
    print(f"\nMacro F1 (equal-segment score): {macro_f1:.1f}")

    # Severity buckets
    print("\n=== Severity buckets ===")
    sev_counter = Counter(x["severity"] for x in results if not x["match"])
    for k in ("severe", "high", "medium", "low"):
        print(f"  {k}: {sev_counter[k]}")

    # Mismatches
    print("\n=== Severe / high mismatches ===")
    for x in results:
        if x["severity"] in ("severe", "high"):
            print(f"  [{x['severity']}] {x['row_id']}")
            print(f"      blind={x['blind_decision']} adsecute={x['adsecute_raw']}->{x['adsecute_mapped']}")
            print(f"      spend={x['spend']} roas={x['roas']} rec_roas={x['recent_roas']} bench={x['bench_roas']} long90={x['long90']} purch={x['recent_purchases']} active={x['active']} trust={x['trust']}")
            print(f"      reason: {x['rationale']}")
            print(f"      ads internal_segment={x['internal_segment']} action={x['recommended_action']}")

    print("\n=== Medium mismatches ===")
    for x in results:
        if x["severity"] == "medium":
            print(f"  blind={x['blind_decision']} ads={x['adsecute_raw']}->{x['adsecute_mapped']}  {x['row_id']}")
            print(f"      spend={x['spend']} roas={x['roas']} rec_roas={x['recent_roas']} bench={x['bench_roas']} purch={x['recent_purchases']} trust={x['trust']}")

    # Output JSON for downstream
    out = {
        "summary": {
            "rows": total,
            "matches": matches,
            "raw_accuracy_pct": round(100*matches/total, 2),
            "macro_f1": round(macro_f1, 2),
            "severity_counts": dict(sev_counter),
        },
        "results": results,
    }
    out_path = "docs/operator-policy/creative-segmentation-recovery/reports/blind-media-buyer-review-2026-04-25/blind_judge_results.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
